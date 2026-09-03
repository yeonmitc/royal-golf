// src/features/offline/offlineSync.js
import { sbInsert, sbRpc, sbSelect } from '../../db/supabaseRest';
import {
  countUnsyncedOfflineSales,
  getAllCachedProducts,
  getCachedProductByCode,
  getMeta,
  getUnsyncedOfflineSales,
  markOfflineSaleFailed,
  removeOfflineSale,
  replaceCachedProducts,
  replaceTodaySalesCache,
  setMeta,
  isBrowserOnline,
} from './offlineDB';

// ---------------------------------------------------------------------------
// Product cache sync — duplicate-safe guard
// ---------------------------------------------------------------------------

let _syncProductsInFlight = null;

/**
 * Fetch products from the server (minimum fields for selling)
 * and fully replace the IndexedDB cache.
 * Duplicate-safe: if a sync is already running, returns the same promise.
 */
export async function syncProductsToCache({ onInfo, force = false } = {}) {
  if (_syncProductsInFlight) {
    if (onInfo) onInfo('Sync already in progress, waiting...');
    return _syncProductsInFlight;
  }

  _syncProductsInFlight = (async () => {
    try {
      if (onInfo) onInfo('Fetching product list from server...');

      // We need code, name, sale_price, free_gift, brand label, color label.
      // Also fetch inventories sizes with stock for offline display.
      const [products, inventories] = await Promise.all([
        sbSelect('products', {
          select: 'code,name,sale_price,free_gift,no',
          limit: 5000,
        }),
        sbSelect('inventories', {
          select: 'code,s,m,l,xl,2xl,3xl,4xl,5xl,6xl,7xl,8xl,free,total_qty',
          limit: 5000,
        }),
      ]);

      const invByCode = new Map((inventories || []).map((r) => [String(r?.code || '').trim(), r]));

      const rows = (products || []).map((p) => {
        const code = String(p.code || '').trim();
        const inv = invByCode.get(code) || null;
        return {
          code,
          name: String(p.name || '').trim(),
          sale_price: Number(p.sale_price ?? 0) || 0,
          free_gift: Boolean(p.free_gift ?? false),
          brand: null,
          color: null,
          sizes_json: inv ? JSON.stringify(inv) : null,
          updated_at: new Date().toISOString(),
        };
      });

      const result = await replaceCachedProducts(rows);
      // Mark successful sync timestamp
      try {
        await setMeta('products_last_synced_at', result.syncedAt);
      } catch {
        /* ignore */
      }
      try {
        await setMeta('products_sync_status', 'ok');
      } catch {
        /* ignore */
      }

      if (onInfo) {
        onInfo(`Product data updated successfully. (${result.count} items)`);
      }
      return result;
    } catch (e) {
      console.error('[offlineSync] syncProductsToCache failed:', e);
      // Do NOT delete existing cache on failure!
      try {
        await setMeta('products_sync_status', 'failed');
      } catch {
        /* ignore */
      }
      const msg = e?.message || String(e);
      if (onInfo) {
        onInfo(
          `Product data could not be updated. Previously saved data will continue to be used. (${msg.slice(0, 80)})`
        );
      }
      throw e;
    } finally {
      _syncProductsInFlight = null;
    }
  })();

  return _syncProductsInFlight;
}

/**
 * Sync only if the cache is stale (>= 24 hours) or missing.
 * Returns { skipped, reason?, count?, syncedAt? }
 */
export async function syncProductsIfStale() {
  const { shouldSyncProducts } = await import('./offlineDB');
  const needed = await shouldSyncProducts();
  if (!needed) return { skipped: true, reason: 'fresh' };
  if (!isBrowserOnline()) return { skipped: true, reason: 'offline' };
  try {
    const res = await syncProductsToCache();
    return { skipped: false, ...res };
  } catch (e) {
    return { skipped: false, error: String(e?.message || e) };
  }
}

export async function getProductsSyncStatus() {
  const syncedAt = await getMeta('products_last_synced_at', null);
  const syncStatus = await getMeta('products_sync_status', 'unknown');
  const cached = await getAllCachedProducts();
  return {
    syncedAt,
    syncStatus,
    cachedCount: cached.length,
  };
}

// ---------------------------------------------------------------------------
// Today's sales cache sync
// ---------------------------------------------------------------------------

function todayDateKey() {
  const d = new Date();
  const yyyy = String(d.getFullYear());
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

let _syncTodaySalesInFlight = null;

/**
 * Fetch today's sales from server and cache in IndexedDB.
 * Uses getSalesHistoryFilteredResult with today's date range.
 * Duplicate-safe: if a sync is already running, returns the same promise.
 */
export async function syncTodaySalesToCache({ onInfo } = {}) {
  if (_syncTodaySalesInFlight) return _syncTodaySalesInFlight;

  _syncTodaySalesInFlight = (async () => {
    try {
      const dateKey = todayDateKey();
      const { getSalesHistoryFilteredResult } = await import('../sales/salesApiSupabase');
      const result = await getSalesHistoryFilteredResult({
        fromDate: dateKey,
        toDate: dateKey,
      });
      const rows = result?.rows || [];
      await replaceTodaySalesCache(rows, dateKey);
      if (onInfo) onInfo(`Today's sales cached: ${rows.length} records`);
      return { count: rows.length, dateKey };
    } catch (e) {
      console.error('[offlineSync] syncTodaySalesToCache failed:', e);
      if (onInfo) onInfo("Could not refresh today's sales.");
      return { count: 0, error: String(e?.message || e) };
    } finally {
      _syncTodaySalesInFlight = null;
    }
  })();

  return _syncTodaySalesInFlight;
}

/**
 * Refresh both products and today's sales.
 * Called by manual "Refresh Data" button and scheduled auto-refresh.
 */
export async function refreshAllData({ onInfo } = {}) {
  const results = { products: null, todaySales: null };

  // Products
  try {
    results.products = await syncProductsToCache({ onInfo, force: true });
  } catch (e) {
    results.products = { error: String(e?.message || e) };
  }

  // Today's sales
  try {
    results.todaySales = await syncTodaySalesToCache({ onInfo });
  } catch (e) {
    results.todaySales = { error: String(e?.message || e) };
  }

  return results;
}

// ---------------------------------------------------------------------------
// Scheduled auto-refresh (8:00, 12:00, 15:00 local time)
// ---------------------------------------------------------------------------

const SCHEDULED_HOURS = [8, 12, 15]; // 8am, 12pm, 3pm
let _scheduleIntervalId = null;

/**
 * Get the most recent scheduled refresh time (in ms) that should have fired.
 * Returns 0 if no schedule applies.
 */
function getLastScheduledTimeMs() {
  const now = new Date();
  const h = now.getHours();
  const m = now.getMinutes();
  const todayBase = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

  // Find the latest scheduled time that has passed today
  let lastMs = 0;
  for (const hour of SCHEDULED_HOURS) {
    const scheduledMs = todayBase + hour * 60 * 60 * 1000;
    if (Date.now() >= scheduledMs) {
      lastMs = scheduledMs;
    }
  }
  return lastMs;
}

/**
 * Check if we should run a scheduled refresh.
 * Returns true if the last scheduled time is newer than our last recorded refresh.
 */
async function shouldRunScheduledRefresh() {
  const lastScheduledMs = getLastScheduledTimeMs();
  if (!lastScheduledMs) return false; // before first scheduled time today

  const lastRun = await getMeta('last_scheduled_refresh_at', null);
  const lastRunMs = lastRun ? Date.parse(String(lastRun)) : 0;

  // If we haven't run since the last scheduled time, we should refresh
  return lastRunMs < lastScheduledMs;
}

async function runScheduledRefresh() {
  if (!isBrowserOnline()) return;
  try {
    const needed = await shouldRunScheduledRefresh();
    if (!needed) return;
    console.info('[offlineSync] Scheduled refresh triggered');
    await refreshAllData({
      onInfo: (msg) => console.info('[offlineSync] scheduled:', msg),
    });
    await setMeta('last_scheduled_refresh_at', new Date().toISOString());
  } catch (e) {
    console.warn('[offlineSync] Scheduled refresh failed (non-fatal):', e);
  }
}

/**
 * Start the scheduled auto-refresh system.
 * Checks every 60 seconds if a scheduled time has been missed.
 * On first call, also checks if a past schedule was missed (app opened late).
 * Safe to call multiple times; only one interval will be active.
 */
export function startScheduledRefresh() {
  if (_scheduleIntervalId) return;
  if (typeof window === 'undefined') return;

  // First check after 30 seconds (missed schedule recovery)
  setTimeout(() => runScheduledRefresh(), 30 * 1000);

  // Check every 60 seconds for scheduled times
  _scheduleIntervalId = setInterval(() => runScheduledRefresh(), 60 * 1000);
}

export function stopScheduledRefresh() {
  if (_scheduleIntervalId) {
    clearInterval(_scheduleIntervalId);
    _scheduleIntervalId = null;
  }
}

// Keep backward-compatible alias
export const startBackgroundProductSync = startScheduledRefresh;
export const stopBackgroundProductSync = stopScheduledRefresh;

/**
 * Notify that a sale was completed (online or offline).
 * Refreshes today's sales cache in background (non-blocking).
 * Call this after finalize_sale_group or after saving an offline sale.
 */
export function notifySaleCompleted() {
  // Fire-and-forget: refresh today's sales cache in background
  syncTodaySalesToCache().catch((e) => {
    console.warn('[offlineSync] notifySaleCompleted background refresh failed:', e);
  });
}

export async function findCachedProduct(code) {
  return getCachedProductByCode(code);
}

// ---------------------------------------------------------------------------
// Offline sales -> server sync
// ---------------------------------------------------------------------------

/**
 * Sync unsynced offline sales (PENDING or FAILED) to Supabase sales table.
 *
 * Critical rules:
 *  - Use local_id (UUID) as sales.offline_sale_id for idempotency (UNIQUE).
 *  - Use offline_group_id as sale_groups.offline_group_id.
 *  - Snapshot values (sale price, commission rate, commission amount) are
 *    used as-is, never recomputed on the server.
 *  - success → delete from offline_sales
 *  - failure → mark sync_status = FAILED, keep in IndexedDB
 *  - unique violation (offline_sale_id already in DB) → treat as success,
 *    because it means an earlier sync already processed this row.
 */
export async function syncOfflineSalesToServer({ onInfo } = {}) {
  const pending = await getUnsyncedOfflineSales();
  if (!pending || pending.length === 0) {
    if (onInfo) onInfo('No unsynced sales found.');
    return {
      ok: true,
      total: 0,
      success: 0,
      failed: 0,
      skippedDuplicate: 0,
      message: 'No unsynced sales found.',
    };
  }

  if (onInfo) {
    onInfo(`Syncing sales records... (${pending.length} items)`);
    onInfo('Do not close this page while syncing.');
  }

  // Group pending rows by offline_group_id so we can:
  //   1) insert one sale_groups row per group, 2) insert sales lines.
  const byGroup = new Map();
  for (const row of pending) {
    const gid = String(row.offline_group_id || '');
    if (!byGroup.has(gid)) {
      byGroup.set(gid, {
        rows: [],
        guide_id: null,
        local_guide_name: '',
        guide_rate: 0,
        guide_commission: 0,
        sold_at: null,
        subtotal: 0,
        total: 0,
      });
    }
    const g = byGroup.get(gid);
    g.rows.push(row);
    if (!g.sold_at) g.sold_at = row.sold_at;
    if (g.guide_id === null) g.guide_id = row.guide_id || null;
    if (!g.local_guide_name && row.local_guide_name_snapshot) {
      g.local_guide_name = String(row.local_guide_name_snapshot || '').trim();
    }
    if (!g.guide_rate) g.guide_rate = Number(row.guide_rate_snapshot ?? 0) || 0;
    const lineTotal = Number(row.price ?? 0) * Number(row.qty ?? 0);
    g.subtotal += lineTotal;
    g.total += lineTotal;
  }

  // Compute guide_commission per group from snapshot rows (sum lines commission)
  // If individual rows have guide_commission_snapshot per line, sum them.
  // Otherwise fall back to subtotal * guide_rate.
  for (const [, g] of byGroup.entries()) {
    const lineCommSum = g.rows.reduce(
      (acc, r) => acc + (Number(r.guide_commission_snapshot ?? 0) || 0),
      0
    );
    g.guide_commission =
      lineCommSum > 0 ? lineCommSum : Math.round(g.subtotal * (g.guide_rate || 0));
  }

  let successCount = 0;
  let failCount = 0;
  let duplicateCount = 0;
  const errors = [];

  for (const [groupId, g] of byGroup.entries()) {
    // First: insert or skip the sale_groups row for this transaction group.
    let groupDbId = null;
    try {
      // Check if this offline group was already synced (unique check).
      if (groupId) {
        const found = await sbSelect('sale_groups', {
          select: 'id,offline_group_id',
          filters: [{ column: 'offline_group_id', op: 'eq', value: groupId }],
          limit: 1,
        });
        if (found && found.length && found[0].id) {
          groupDbId = found[0].id;
        }
      }
      if (!groupDbId) {
        const insertRow = {
          id: groupId || crypto.randomUUID(),
          offline_group_id: groupId || null,
          guide_id: g.guide_id || null,
          local_guide_name: g.local_guide_name || null,
          sold_at: g.sold_at || new Date().toISOString(),
          subtotal: g.subtotal,
          total: g.total,
          guide_rate: g.guide_rate,
          guide_commission: g.guide_commission,
        };
        const result = await sbInsert('sale_groups', [insertRow], {
          returning: 'representation',
        });
        groupDbId = result?.[0]?.id ?? insertRow.id;
      }
    } catch (e) {
      // Unique violation on offline_group_id means already synced → safe.
      const msg = String(e?.message || '').toLowerCase();
      if (msg.includes('duplicate') && msg.includes('offline_group')) {
        // Try one more lookup to find the existing group id.
        try {
          const found = await sbSelect('sale_groups', {
            select: 'id',
            filters: [{ column: 'offline_group_id', op: 'eq', value: groupId }],
            limit: 1,
          });
          groupDbId = found?.[0]?.id ?? null;
        } catch {
          groupDbId = null;
        }
      }
      if (!groupDbId) {
        // Group insert failed completely → mark all rows as FAILED.
        for (const r of g.rows) {
          await markOfflineSaleFailed(r.local_id, `Group insert failed: ${e?.message || e}`);
          failCount += 1;
          errors.push({ local_id: r.local_id, error: e?.message || String(e) });
        }
        continue;
      }
    }

    // Now insert each line of this group into `sales` table.
    for (const r of g.rows) {
      try {
        const saleRow = {
          offline_sale_id: r.local_id,
          sold_at: r.sold_at,
          code: String(r.code || '').trim(),
          size_raw: r.size_raw,
          size_std: r.size_std,
          color: r.color || null,
          qty: Number(r.qty || 0) || 0,
          list_price: Number(r.list_price ?? r.price ?? 0) || 0,
          price: Number(r.price ?? 0) || 0,
          free_gift: Boolean(r.free_gift ?? false),
          sale_group_id: groupDbId,
        };
        try {
          await sbInsert('sales', [saleRow], { returning: 'minimal' });
        } catch (insertErr) {
          const msg = String(insertErr?.message || '').toLowerCase();
          const isDupOffline =
            (msg.includes('duplicate') || msg.includes('unique')) &&
            (msg.includes('offline_sale_id') || msg.includes('sales_offline_sale_id'));
          if (!isDupOffline) throw insertErr;
          // Already exists in sales → treat as successful sync, just remove from queue.
          duplicateCount += 1;
          if (onInfo) {
            onInfo(`This sale has already been synced (${String(r.code || '').slice(0, 20)}).`);
          }
        }
        await removeOfflineSale(r.local_id);
        successCount += 1;
      } catch (e) {
        await markOfflineSaleFailed(r.local_id, e?.message || String(e));
        failCount += 1;
        errors.push({ local_id: r.local_id, error: e?.message || String(e) });
      }
    }

    // After all sales rows: finalize the group via dedicated RPC (snapshot overwrite).
    // Called once per group, not per row. Non-fatal if RPC is not deployed yet.
    if (failCount === 0) {
      try {
        await sbRpc('finalize_offline_sale_group', {
          p_group_id: groupDbId,
          p_offline_group_id: groupId,
        });
      } catch (finalizeErr) {
        console.warn('[offlineSync] finalize_offline_sale_group non-fatal:', finalizeErr);
      }
    }
  }

  const stillLeft = await countUnsyncedOfflineSales();
  let message = '';
  if (failCount === 0 && duplicateCount === 0) {
    message = `Sales records synced successfully.`;
  } else if (duplicateCount && failCount === 0) {
    message = `${successCount} sales synced successfully.`;
  } else if (failCount > 0 && successCount > 0) {
    message = `${successCount} sales synced successfully. ${failCount} sale could not be synced. Please try again.`;
  } else if (failCount > 0 && successCount === 0) {
    message = `${failCount} sale could not be synced. Please try again.`;
  }
  if (onInfo && message) onInfo(message);

  // After successful sync, refresh today's sales cache
  if (successCount > 0) {
    try {
      await syncTodaySalesToCache();
    } catch {
      /* non-fatal */
    }
  }

  return {
    ok: failCount === 0,
    total: pending.length,
    success: successCount,
    failed: failCount,
    skippedDuplicate: duplicateCount,
    remaining: stillLeft,
    errors,
    message,
  };
}

export async function countPendingOfflineSales() {
  return countUnsyncedOfflineSales();
}

// ---------------------------------------------------------------------------
// Offline stock checks -> server sync
// ---------------------------------------------------------------------------

/**
 * Sync unsynced stock checks from IndexedDB to Supabase.
 * For each record:
 *   - 'checked' status → inventories.check_status='checked' + resolve any existing erro_stock
 *   - 'error' status   → inventories.check_status='error' + upsert erro_stock with memo
 * On success → remove from IndexedDB.
 * On failure → keep in IndexedDB with FAILED status.
 */
export async function syncStockChecksToServer({ onInfo } = {}) {
  const { getUnsyncedStockChecks, removeStockChecks } = await import('./offlineDB');

  const pending = await getUnsyncedStockChecks();
  if (!pending || pending.length === 0) {
    if (onInfo) onInfo('No unsynced stock checks found.');
    return {
      ok: true,
      total: 0,
      success: 0,
      failed: 0,
      message: 'No unsynced stock checks found.',
    };
  }

  if (onInfo) {
    onInfo(`Syncing stock checks... (${pending.length} items)`);
  }

  const { batchUpdateInventoryStatus, upsertErroStock } = await import('../products/productApi');
  const { sbUpdate } = await import('../../db/supabaseRest');

  let successCount = 0;
  let failCount = 0;
  const succeeded = [];

  const checkedRows = pending.filter((r) => r.check_status === 'checked');
  const errorRows = pending.filter((r) => r.check_status === 'error');

  // --- Checked items: inventories.check_status='checked' + resolve any old erro_stock ---
  if (checkedRows.length > 0) {
    try {
      const changes = {};
      for (const r of checkedRows) {
        changes[r.code] = 'checked';
      }
      await batchUpdateInventoryStatus(changes);

      // Resolve any existing erro_stock records for these codes (stamp checked_at).
      // Same logic as deleteErroStock's erro_stock part, but without setting inventories to unchecked.
      const now = new Date().toISOString();
      await Promise.all(
        checkedRows.map((r) =>
          sbUpdate(
            'erro_stock',
            { checked_at: now, updated_at: now },
            { filters: [{ column: 'code', op: 'eq', value: r.code }], returning: 'minimal' }
          ).catch(() => {})
        )
      );

      successCount += checkedRows.length;
      succeeded.push(...checkedRows);
    } catch (e) {
      console.error('[offlineSync] stock check sync (checked) failed:', e);
      failCount += checkedRows.length;
    }
  }

  // --- Error items: inventories.check_status='error' + upsert erro_stock with memo ---
  for (const r of errorRows) {
    try {
      // 1. Update inventories.check_status to 'error'
      await batchUpdateInventoryStatus({ [r.code]: 'error' });
      // 2. Upsert erro_stock with code + memo
      await upsertErroStock({ code: r.code, memo: r.memo || '' });
      successCount += 1;
      succeeded.push(r);
    } catch (e) {
      console.error('[offlineSync] stock check sync (error) failed:', e);
      failCount += 1;
    }
  }

  // Remove successfully synced from IndexedDB
  if (succeeded.length > 0) {
    await removeStockChecks(succeeded);
  }

  let message = '';
  if (failCount === 0) {
    message = 'Stock checks synced successfully.';
  } else if (successCount > 0) {
    message = `${successCount} checks synced, ${failCount} failed. Please try again.`;
  } else {
    message = `${failCount} checks could not be synced.`;
  }
  if (onInfo) onInfo(message);

  return {
    ok: failCount === 0,
    total: pending.length,
    success: successCount,
    failed: failCount,
    message,
  };
}
