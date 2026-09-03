import * as local from './salesApi';
import * as supabase from './salesApiSupabase';

function isNetworkFailure(err) {
  if (typeof navigator !== 'undefined' && navigator && navigator.onLine === false) return true;
  const msg = String(err?.message || '');
  return (
    err?.name === 'TypeError' ||
    msg.includes('Failed to fetch') ||
    msg.includes('NetworkError') ||
    msg.includes('Load failed')
  );
}

async function withOfflineFallback(runSupabase, runLocal) {
  try {
    return await runSupabase();
  } catch (e) {
    if (isNetworkFailure(e)) {
      return runLocal();
    }
    throw e;
  }
}

/**
 * Convert unsynced offline_sales rows to the same normalized format
 * as getSalesHistoryFlatFiltered so SalesTable can render them directly.
 */
function offlineSalesToNormalized(rows) {
  if (!rows || rows.length === 0) return [];
  return rows.map((r) => {
    const qty = Number(r.qty || 0) || 0;
    const price = Number(r.price ?? 0) || 0;
    const listPrice = Number(r.list_price ?? 0) || 0;
    const isFreeGift = Boolean(r.free_gift) || price === 0;
    const isMrMoon = Boolean(r.is_mr_moon_snapshot);
    const isPeter = Boolean(r.is_peter_snapshot);
    const isKakao = Boolean(r.is_kakao_snapshot);
    const guideName = String(r.guide_name_snapshot || '').trim();
    const localGuideName = String(r.local_guide_name_snapshot || '').trim();

    return {
      saleId: r.local_id,
      soldAt: r.sold_at,
      code: String(r.code || '').trim(),
      nameKo: '', // will be filled by attachLocalProductMeta if needed
      sizeDisplay: String(r.size_raw || r.size_std || '').trim(),
      color: String(r.color || '').trim(),
      qty,
      unitPricePhp: price,
      listPricePhp: listPrice,
      discountUnitPricePhp: null,
      freeGift: isFreeGift,
      isRefunded: false,
      refundedAt: null,
      isExchanged: false,
      saleGroupId: r.offline_group_id,
      guideId: r.guide_id || null,
      localGuideName,
      guideName,
      isMrMoon,
      isElla: false,
      isPeter,
      isKakaoFriend: isKakao,
      commission: Number(r.guide_commission_snapshot || 0),
      // Marker for UI to show "Waiting to sync"
      _offlinePending: true,
    };
  });
}

/**
 * Get today's date key (YYYY-MM-DD) in local time.
 */
function todayDateKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Merge server rows with unsynced offline_sales, avoiding duplicates.
 * An offline sale is considered duplicate if its offline_group_id matches
 * an existing server sale's saleGroupId.
 */
async function mergeWithOfflineSales(serverResult, fromDate, toDate) {
  try {
    const { getUnsyncedOfflineSales } = await import('../offline/offlineDB');
    const pending = await getUnsyncedOfflineSales();
    if (!pending || pending.length === 0) return serverResult;

    // Filter offline sales to the requested date range
    const fromKey = String(fromDate || '').trim();
    const toKey = String(toDate || '').trim();
    const todayKey = todayDateKey();

    const filtered = pending.filter((r) => {
      const soldAt = String(r.sold_at || '');
      // Extract YYYY-MM-DD from ISO timestamp
      const key = soldAt.length >= 10 ? soldAt.slice(0, 10) : '';
      if (!key) return false;
      if (fromKey && key < fromKey) return false;
      if (toKey && key > toKey) return false;
      return true;
    });

    if (filtered.length === 0) return serverResult;

    // Collect existing sale_group_ids from server rows to avoid duplicates
    const serverGroupIds = new Set(
      (serverResult?.rows || []).map((r) => String(r.saleGroupId || '')).filter(Boolean)
    );

    // Only include offline sales whose group is NOT already on the server
    const uniqueOffline = filtered.filter((r) => {
      const gid = String(r.offline_group_id || '');
      return !gid || !serverGroupIds.has(gid);
    });

    if (uniqueOffline.length === 0) return serverResult;

    const offlineNormalized = offlineSalesToNormalized(uniqueOffline);

    return {
      ...serverResult,
      rows: [...offlineNormalized, ...(serverResult?.rows || [])],
    };
  } catch (e) {
    console.warn('[salesApiClient] mergeWithOfflineSales failed:', e);
    return serverResult;
  }
}

export function checkoutCart(cartItems) {
  // Use a single implementation with integrated offline fallback (IndexedDB queue).
  // Never route through salesApi.local.checkoutCart (Dexie sales/saleItems tables
  // which are legacy and not synced to server).
  return Promise.resolve().then(() => supabase.checkoutCartWithOfflineFallback(cartItems));
}

export function instantSale(payload) {
  return Promise.resolve().then(() => supabase.checkoutCartWithOfflineFallback([payload]));
}

export function getSalesList() {
  return withOfflineFallback(
    () => supabase.getSalesList(),
    () => local.getSalesList()
  );
}

export function processRefund(payload) {
  return withOfflineFallback(
    () => supabase.processRefund(payload),
    () => local.processRefund(payload)
  );
}

export function getSaleItemsBySaleId(saleId) {
  return withOfflineFallback(
    () => supabase.getSaleItemsBySaleId(saleId),
    () => local.getSaleItemsBySaleId(saleId)
  );
}

export async function getSalesHistoryFilteredResult(args) {
  try {
    const result = await supabase.getSalesHistoryFilteredResult(args);
    // Merge unsynced offline sales into server results
    return await mergeWithOfflineSales(result, args?.fromDate, args?.toDate);
  } catch (e) {
    if (isNetworkFailure(e)) {
      // Offline: try local DB, then merge offline sales
      const localResult = await local.getSalesHistoryFilteredResult(args);
      return await mergeWithOfflineSales(localResult, args?.fromDate, args?.toDate);
    }
    throw e;
  }
}

export function getSalesSummaryRows(args) {
  return withOfflineFallback(
    () => supabase.getSalesSummaryRows(args),
    () => local.getSalesSummaryRows(args)
  );
}

export function getAnalytics(args) {
  return withOfflineFallback(
    () => supabase.getAnalytics(args),
    () => local.getAnalytics(args)
  );
}

export function setSaleFreeGift(payload) {
  return withOfflineFallback(
    () => supabase.setSaleFreeGift(payload),
    () => local.setSaleFreeGift(payload)
  );
}

export function setSaleGroupGuide(payload) {
  return supabase.setSaleGroupGuide(payload);
}

export function setSaleTime(payload) {
  return withOfflineFallback(
    () => supabase.setSaleTime(payload),
    () => local.setSaleTime(payload)
  );
}

export function updateSaleItemColor(payload) {
  return withOfflineFallback(
    () => supabase.updateSaleItemColor(payload),
    () => local.updateSaleItemColor(payload)
  );
}

export function updateSalePrice(payload) {
  return withOfflineFallback(
    () => supabase.updateSalePrice(payload),
    () => local.updateSalePrice(payload)
  );
}
