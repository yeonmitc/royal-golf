// src/features/codes/codeApi.js
import db from '../../db/dexieClient';
import { sbSelect } from '../../db/supabaseRest';

/**
 * 전체 코드 파츠 조회
 * (상품코드 생성에 필요한: category1, category2, type, brand, color, serial)
 * Supabase에서 우선 조회하고 실패시 Dexie(로컬) 사용
 */
export async function fetchCodeParts() {
  try {
    const rows = await sbSelect('code_parts', { select: '*' });
    if (Array.isArray(rows)) {
      return rows.map((r) => ({
        id: r.id,
        group: r.group_key, // Map group_key to group
        code: r.code,
        labelKo: r.label, // Map label to labelKo
        label: r.label,
      }));
    }
  } catch (e) {
    console.warn('Supabase code_parts fetch failed, falling back to Dexie', e);
  }
  return db.codeParts.toArray();
}

/**
 * 특정 codePart type만 조회
 * 예: "category1", "category2", "type", "brand", "color"
 */
export async function fetchCodePartByType(type) {
  try {
    const rows = await sbSelect('code_parts', { 
      select: '*', 
      filters: [{ column: 'group_key', op: 'eq', value: type }] 
    });
    if (Array.isArray(rows)) {
      return rows.map((r) => ({
        id: r.id,
        group: r.group_key,
        code: r.code,
        labelKo: r.label,
        label: r.label,
      }));
    }
  } catch (e) {
    console.warn(`Supabase code_parts fetch failed for type ${type}, falling back to Dexie`, e);
  }
  return db.codeParts.where('group').equals(type).toArray();
}
