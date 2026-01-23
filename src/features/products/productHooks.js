// src/features/products/productHooks.js
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  deleteProduct,
  getProductByCode,
  getProductInventoryList,
  getProductWithInventory,
  isProductCodeExists,
  searchProducts,
  upsertProduct,
  updateInventoryQuantities,
  updateInventoryStatus,
  batchUpdateInventoryStatus,
  resetAllInventoryStatus,
  upsertErroStock,
  deleteErroStock,
} from './productApi';

/**
 * 단일 상품
 */
export function useProduct(code, options = {}) {
  return useQuery({
    queryKey: ['products', 'detail', code],
    queryFn: () => getProductByCode(code),
    enabled: !!code,
    ...options,
  });
}

/**
 * 단일 상품 + 재고
 */
export function useProductWithInventory(code, options = {}) {
  return useQuery({
    queryKey: ['products', 'withInventory', code],
    queryFn: () => getProductWithInventory(code),
    enabled: !!code,
    ...options,
  });
}

/**
 * 전체 상품 + 재고 리스트
 */
export function useProductInventoryList(options = {}) {
  return useQuery({
    queryKey: ['inventory', 'withProducts'],
    queryFn: getProductInventoryList,
    ...options,
  });
}

/**
 * 키워드 검색
 */
export function useProductSearch(keyword) {
  return useQuery({
    queryKey: ['products', 'search', keyword],
    queryFn: () => searchProducts(keyword),
  });
}

/**
 * 코드 중복 검사용 (ProductForm에서 사용 가능)
 */
export function useProductCodeExists(code) {
  return useQuery({
    queryKey: ['products', 'codeExists', code],
    queryFn: () => isProductCodeExists(code),
    enabled: !!code,
  });
}

/**
 * 상품 저장(추가/수정)
 */
export function useUpsertProductMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ['products', 'upsert'],
    mutationFn: upsertProduct,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
    },
  });
}

export function useUpdateInventoryStatusMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ['inventory', 'updateStatus'],
    mutationFn: ({ code, status }) => updateInventoryStatus(code, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
    },
  });
}

export function useBatchUpdateInventoryStatusMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ['inventory', 'batchUpdateStatus'],
    mutationFn: (changes) => batchUpdateInventoryStatus(changes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
    },
  });
}

export function useResetAllInventoryStatusMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ['inventory', 'resetAllStatus'],
    mutationFn: resetAllInventoryStatus,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
    },
  });
}

export function useUpsertErroStockMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ['erroStock', 'upsert'],
    mutationFn: upsertErroStock,
    onMutate: async ({ code, memo }) => {
      // 1. Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['inventory'] });

      // 2. Snapshot the previous value
      const previousInventory = queryClient.getQueryData(['inventory', 'withProducts']);

      // 3. Optimistically update to the new value
      queryClient.setQueryData(['inventory', 'withProducts'], (old) => {
        if (!Array.isArray(old)) return old;
        return old.map((item) =>
          item.code === code
            ? {
                ...item,
                check_status: 'error',
                error_memo: memo,
                check_updated_at: new Date().toISOString(),
              }
            : item
        );
      });

      // Return a context object with the snapshotted value
      return { previousInventory };
    },
    onError: (err, variables, context) => {
      if (context?.previousInventory) {
        queryClient.setQueryData(['inventory', 'withProducts'], context.previousInventory);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
    },
  });
}

export function useDeleteErroStockMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ['erroStock', 'delete'],
    mutationFn: deleteErroStock,
    onMutate: async (code) => {
      // 1. Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['inventory'] });

      // 2. Snapshot the previous value
      const previousInventory = queryClient.getQueryData(['inventory', 'withProducts']);

      // 3. Optimistically update to the new value
      queryClient.setQueryData(['inventory', 'withProducts'], (old) => {
        if (!Array.isArray(old)) return old;
        return old.map((item) =>
          item.code === code
            ? {
                ...item,
                check_status: 'unchecked',
                error_memo: '',
                check_updated_at: new Date().toISOString(),
              }
            : item
        );
      });

      return { previousInventory };
    },
    onError: (err, variables, context) => {
      if (context?.previousInventory) {
        queryClient.setQueryData(['inventory', 'withProducts'], context.previousInventory);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
    },
  });
}

/**
 * 상품 삭제
 */
export function useDeleteProductMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ['products', 'delete'],
    mutationFn: deleteProduct,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
    },
  });
}

export function useUpdateInventoryMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ['inventory', 'updateQuantities'],
    mutationFn: ({ code, changes }) => updateInventoryQuantities(code, changes),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['products', 'withInventory', vars.code] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
    },
  });
}
