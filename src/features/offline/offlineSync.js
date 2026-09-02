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

      const invByCode = new Map(
        (inventories || []).map((r) => [String(r?.code || '').trim(), r])
      );

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
      try { await setMeta('products_last_synced_at', result.syncedAt); } catch { /* ignore */ }
      try { await setMeta('products_sync_status', 'ok'); } catch { /* ignore */ }

      if (onInfo) {
        onInfo(`Product data updated successfully. (${result.count} items)`);
      }
      return result;
    } catch (e) {
      console.error('[offlineSync] syncProductsToCache failed:', e);
      // Do NOT delete existing cache on failure!
      try { await setMeta('products_sync_status', 'failed'); } catch { /* ignore */ }
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

let _bgIntervalId = null;
const BG_SYNC_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Start a 24-hour background sync interval.
 * Safe to call multiple times; only one interval will be active.
 * Only runs when the browser is online.
 */
export function startBackgroundProductSync() {
  if (_bgIntervalId) return; // already running
  if (typeof window === 'undefined') return;

  // First check after 1 minute (in case app opens and goes idle)
  setTimeout(async () => {
    if (!isBrowserOnline()) return;
    const stale = await (await import('./offlineDB')).shouldSyncProducts();
    if (stale) {
      try { await syncProductsToCache(); } catch { /* silent */ }
    }
  }, 60 * 1000);

  _bgIntervalId = setInterval(async () => {
    if (!isBrowserOnline()) return;
    try {
      const stale = await (await import('./offlineDB')).shouldSyncProducts();
      if (stale) {
        await syncProductsToCache();
      }
    } catch (e) {
      console.warn('[offlineSync] background sync failed (non-fatal):', e);
    }
  }, BG_SYNC_MS);
}

export function stopBackgroundProductSync() {
  if (_bgIntervalId) {
    clearInterval(_bgIntervalId);
    _bgIntervalId = null;
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
