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
