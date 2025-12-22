// src/features/sales/salesHooks.js
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  checkoutCart,
  getSaleItemsBySaleId,
  getSalesHistoryFilteredResult,
  getSalesList,
  instantSale,
  processRefund,
  setSaleFreeGift,
} from './salesApiClient';

/**
 * 판매 헤더 리스트
 */
export function useSalesList() {
  return useQuery({
    queryKey: ['sales', 'list'],
    queryFn: getSalesList,
  });
}

/**
 * ✅ 판매 이력 (필터/검색 포함)
 * result: { hasAnySales: boolean, rows: [] }
 */
export function useSalesHistoryFiltered({ fromDate, toDate, query }) {
  return useQuery({
    queryKey: [
      'sales',
      'historyFlat',
      { fromDate: fromDate || '', toDate: toDate || '', query: query || '' },
    ],
    queryFn: () => getSalesHistoryFilteredResult({ fromDate, toDate, query }),
    staleTime: 0,
    refetchOnMount: true,
  });
}

/**
 * 단일 판매 상세
 */
export function useSaleDetail(saleId, options = {}) {
  return useQuery({
    queryKey: ['sales', 'detail', saleId],
    queryFn: () => getSaleItemsBySaleId(saleId),
    enabled: !!saleId,
    ...options,
  });
}

/**
 * 장바구니 결제용 mutation
 */
export function useCheckoutCartMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ['sales', 'checkoutCart'],
    mutationFn: checkoutCart,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
  });
}

/**
 * 환불 처리 mutation
 */
export function useProcessRefundMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ['sales', 'processRefund'],
    mutationFn: processRefund,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
  });
}

/**
 * 즉시판매 mutation
 */
export function useInstantSaleMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ['sales', 'instantSale'],
    mutationFn: instantSale,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
  });
}

export function useSetSaleFreeGiftMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ['sales', 'setSaleFreeGift'],
    mutationFn: setSaleFreeGift,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales'] });
    },
  });
}
