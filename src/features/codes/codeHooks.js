// src/features/codes/codeHooks.js
import { useQuery } from '@tanstack/react-query';
import { fetchCodePartByType, fetchCodeParts } from './codeApi';

/**
 * 모든 코드 파츠 불러옴
 */
export function useCodeParts() {
  return useQuery({
    queryKey: ['codeParts'],
    queryFn: fetchCodeParts,
  });
}

/**
 * 특정 타입의 코드 값만 불러오는 훅
 * 예: useCodePart("category1")
 */
export function useCodePart(type) {
  return useQuery({
    queryKey: ['codeParts', type],
    queryFn: () => fetchCodePartByType(type),
    enabled: !!type,
  });
}
