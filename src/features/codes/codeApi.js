// src/features/codes/codeApi.js
import db from '../../db/dexieClient';

/**
 * 전체 코드 파츠 조회
 * (상품코드 생성에 필요한: category1, category2, type, brand, color, serial)
 */
export async function fetchCodeParts() {
  return db.codeParts.toArray();
}

/**
 * 특정 codePart type만 조회
 * 예: "category1", "category2", "type", "brand", "color"
 */
export async function fetchCodePartByType(type) {
  return db.codeParts.where('type').equals(type).toArray();
}
