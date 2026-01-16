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
  return withOfflineFallback(
    () => supabase.checkoutCart(cartItems),
    () => local.checkoutCart(cartItems)
  );
}

export function instantSale(payload) {
  return withOfflineFallback(
    () => supabase.instantSale(payload),
    () => local.instantSale(payload)
  );
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
