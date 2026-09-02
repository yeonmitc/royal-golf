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
