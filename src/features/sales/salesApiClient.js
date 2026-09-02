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

export function getSalesHistoryFilteredResult(args) {
  return withOfflineFallback(
    () => supabase.getSalesHistoryFilteredResult(args),
    () => local.getSalesHistoryFilteredResult(args)
  );
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
