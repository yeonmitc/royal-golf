// src/features/offline/offlineDB.js
import db from '../../db/dexieClient';

/**
 * Lightweight offline data helpers for:
 *   - Offline product cache (IndexedDB product_cache)
 *   - Offline sales queue    (IndexedDB offline_sales)
 *   - Meta keys           (IndexedDB app_meta)
 *
 * Uses existing Dexie instance from src/db/dexieClient.js (royalInventoryDB
 * version 6
 */

// ---------------------------------------------------------------------------
// Meta (app_meta helpers
// ---------------------------------------------------------------------------

export async function getMeta(key, fallback = null) {
  try {
    const row = await db.table('app_meta').get(String(key || ''));
    if (!row) return fallback;
    return row.value ?? fallback;
  } catch {
    return fallback;
  }
}

export async function setMeta(key, value) {
  const k = String(key || '');
  try {
    await db
      .table('app_meta')
      .put({ key: k, value: value === undefined ? null : value }, k);
  } catch (e) {
    console.warn('[offlineDB] setMeta failed:', e);
  }
}

// ---------------------------------------------------------------------------
// Product cache
// ---------------------------------------------------------------------------

export async function getAllCachedProducts() {
  try {
    return await db.table('product_cache').toArray();
  } catch (e) {
    console.warn('[offlineDB] getAllCachedProducts failed:', e);
    return [];
  }
}

export async function getCachedProductByCode(code) {
  try {
    return await db.table('product_cache').get(String(code || '').trim());
  } catch {
    return null;
  }
}

/**
 * Replace the entire product cache with fresh rows from server.
 * Rows: [{code, name, sale_price, free_gift, brand, color, sizes_json, updated_at}]
 */
export async function replaceCachedProducts(rows, updatedAtIso) {
  const stamp = updatedAtIso || new Date().toISOString();
  const clean = (rows || [])
    .filter((r) => r && String(r.code || '').trim())
    .map((r) => ({
      code: String(r.code).trim(),
      name: String(r.name || '').trim(),
      sale_price: Number(r.sale_price ?? r.salePricePhp ?? 0) || 0,
      free_gift: Boolean(r.free_gift ?? false),
      brand: r.brand ?? null,
      color: r.color ?? null,
      sizes_json: r.sizes_json ?? null,
      updated_at: stamp,
    }));

  try {
    await db.transaction('rw', db.table('product_cache'), async () => {
      await db.table('product_cache').clear();
      if (clean.length) await db.table('product_cache').bulkPut(clean);
    });
    await setMeta('products_last_synced_at', stamp);
    return { count: clean.length, syncedAt: stamp };
  } catch (e) {
    console.error('[offlineDB] replaceCachedProducts failed:', e);
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Offline sales queue
// ---------------------------------------------------------------------------

/**
 * Insert a batch of offline sale rows.
 * Each row is one product (flat line item per sale):
 *   local_id, offline_group_id, sync_status, sold_at,
 * code, size_raw, size_std, color, qty, list_price, price, free_gift,
 * guide_id, local_guide_name_snapshot,
 * guide_name_snapshot, guide_rate_snapshot, guide_commission_snapshot,
 * is_mr_moon_snapshot, is_peter_snapshot, is_kakao_snapshot,
 * subtotal_snapshot, sale_group_total_snapshot,
 * sync_error (null initially), created_at
 */
export async function addOfflineSales(rows) {
  const arr = Array.isArray(rows) ? rows : [rows];
  if (arr.length === 0) return [];
  const now = new Date().toISOString();
  const toInsert = arr.map((r) => ({
    ...r,
    sync_status: r.sync_status || 'PENDING',
    sync_error: r.sync_error || null,
    created_at: r.created_at || now,
  }));
  try {
    await db.table('offline_sales').bulkAdd(toInsert);
    return toInsert;
  } catch (e) {
    console.error('[offlineDB] addOfflineSales failed:', e);
    throw e;
  }
}

export async function getUnsyncedOfflineSales() {
  try {
    const rows = await db
      .table('offline_sales')
      .where('sync_status')
      .anyOf(['PENDING', 'FAILED'])
      .sortBy('created_at');
    return rows || [];
  } catch (e) {
    console.warn('[offlineDB] getUnsyncedOfflineSales failed:', e);
    return [];
  }
}

export async function countUnsyncedOfflineSales() {
  try {
    const rows = await db
      .table('offline_sales')
      .where('sync_status')
      .anyOf(['PENDING', 'FAILED'])
      .count();
    return Number(rows || 0);
  } catch {
    return 0;
  }
}

export async function markOfflineSaleFailed(localId, errorMessage) {
  try {
    await db
      .table('offline_sales')
      .update(String(localId || ''), {
        sync_status: 'FAILED',
        sync_error: String(errorMessage || 'Unknown error').slice(0, 500),
      });
  } catch (e) {
    console.warn('[offlineDB] markOfflineSaleFailed failed:', e);
  }
}

export async function removeOfflineSale(localId) {
  try {
    await db.table('offline_sales').delete(String(localId || ''));
  } catch (e) {
    console.warn('[offlineDB] removeOfflineSale failed:', e);
  }
}

export async function getAllOfflineSales() {
  try {
    return await db.table('offline_sales').toArray();
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Network / online helpers
// ---------------------------------------------------------------------------

export function isBrowserOnline() {
  if (typeof navigator === 'undefined') return true;
  return navigator.onLine !== false;
}

export const PRODUCTS_SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

export async function shouldSyncProducts() {
  const last = await getMeta('products_last_synced_at', null);
  if (!last) return true;
  const t = Date.parse(String(last));
  if (!Number.isFinite(t)) return true;
  return Date.now() - t >= PRODUCTS_SYNC_INTERVAL_MS;
}

// ---------------------------------------------------------------------------
// Today's sales cache
// ---------------------------------------------------------------------------

/**
 * Replace the entire today_sales cache with fresh rows from server.
 * Each row: { id, sale_date, sold_at, ... (any extra fields from server) }
 */
export async function replaceTodaySalesCache(sales, dateKey) {
  const clean = (sales || []).filter((r) => r && r.id);
  try {
    await db.transaction('rw', db.table('today_sales'), async () => {
      await db.table('today_sales').clear();
      if (clean.length) {
        const rows = clean.map((r) => ({ ...r, sale_date: dateKey }));
        await db.table('today_sales').bulkPut(rows);
      }
    });
    await setMeta('today_sales_date', dateKey);
    await setMeta('today_sales_synced_at', new Date().toISOString());
    return clean.length;
  } catch (e) {
    console.error('[offlineDB] replaceTodaySalesCache failed:', e);
    throw e;
  }
}

/**
 * Get all cached today's sales for a given date key.
 * Returns [] if the cache is for a different date.
 */
export async function getTodaySalesCache(dateKey) {
  try {
    const cachedDate = await getMeta('today_sales_date', null);
    if (cachedDate !== dateKey) return [];
    return await db.table('today_sales').where('sale_date').equals(dateKey).toArray();
  } catch {
    return [];
  }
}

/**
 * Add a single sale to today's cache (for immediate update after sale completion).
 * If the cache date doesn't match, this is a no-op.
 */
export async function addTodaySaleToCache(sale, dateKey) {
  if (!sale || !sale.id) return;
  try {
    const cachedDate = await getMeta('today_sales_date', null);
    if (cachedDate !== dateKey) return; // cache is for a different day
    await db.table('today_sales').put({ ...sale, sale_date: dateKey });
  } catch (e) {
    console.warn('[offlineDB] addTodaySaleToCache failed:', e);
  }
}

/**
 * Remove specific sales from today's cache (after sync dedup).
 */
export async function removeTodaySalesFromCache(ids) {
  if (!ids || ids.length === 0) return;
  try {
    await db.table('today_sales').bulkDelete(ids);
  } catch (e) {
    console.warn('[offlineDB] removeTodaySalesFromCache failed:', e);
  }
}

// ---------------------------------------------------------------------------
// Offline stock checks (check_date + code compound key)
// ---------------------------------------------------------------------------

/**
 * Save a batch of stock check results to IndexedDB.
 * Each record: { check_date, code, check_status, has_error, memo, checked_at, sync_status }
 * Same (check_date + code) = latest record replaces previous.
 */
export async function saveOfflineStockChecks(checkDate, changes, memos = {}) {
  if (!changes || Object.keys(changes).length === 0) return 0;
  const now = new Date().toISOString();
  const rows = Object.entries(changes)
    .filter(([, status]) => status === 'checked' || status === 'error')
    .map(([code, status]) => ({
      check_date: checkDate,
      code: String(code).trim(),
      check_status: status,
      has_error: status === 'error',
      memo: status === 'error' ? String(memos[code] || '').trim() : '',
      checked_at: now,
      sync_status: 'PENDING',
    }));
  if (rows.length === 0) return 0;
  try {
    await db.table('stock_checks').bulkPut(rows);
    return rows.length;
  } catch (e) {
    console.error('[offlineDB] saveOfflineStockChecks failed:', e);
    throw e;
  }
}

/**
 * Get all offline stock checks for a given date.
 */
export async function getOfflineStockChecksByDate(checkDate) {
  try {
    return await db.table('stock_checks').where('check_date').equals(checkDate).toArray();
  } catch {
    return [];
  }
}

/**
 * Get offline stock checks as a map { code: record } for a given date.
 * IDB records take priority over DB values.
 */
export async function getOfflineStockChecksMap(checkDate) {
  const rows = await getOfflineStockChecksByDate(checkDate);
  const map = {};
  for (const r of rows) {
    map[r.code] = r;
  }
  return map;
}

/**
 * Count unsynced stock checks (PENDING or FAILED).
 */
export async function countUnsyncedStockChecks() {
  try {
    return await db
      .table('stock_checks')
      .where('sync_status')
      .anyOf(['PENDING', 'FAILED'])
      .count();
  } catch {
    return 0;
  }
}

/**
 * Get all unsynced stock checks.
 */
export async function getUnsyncedStockChecks() {
  try {
    return await db
      .table('stock_checks')
      .where('sync_status')
      .anyOf(['PENDING', 'FAILED'])
      .toArray();
  } catch {
    return [];
  }
}

/**
 * Mark a stock check as synced (remove from IDB).
 */
export async function removeStockCheck(checkDate, code) {
  try {
    await db.table('stock_checks').delete([checkDate, code]);
  } catch (e) {
    console.warn('[offlineDB] removeStockCheck failed:', e);
  }
}

/**
 * Bulk remove stock checks after successful sync.
 */
export async function removeStockChecks(records) {
  if (!records || records.length === 0) return;
  try {
    const keys = records.map((r) => [r.check_date, r.code]);
    await db.table('stock_checks').bulkDelete(keys);
  } catch (e) {
    console.warn('[offlineDB] removeStockChecks failed:', e);
  }
}
