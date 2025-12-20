// src/db/seedLoader.js
import db from './dexieClient';
import { requireAdminOrThrow } from '../utils/admin';

// 네가 실제로 사용하는 seed 파일
import seedCodeParts from './seed/seed-code-parts.json';

async function tryFetchJson(relativePath) {
  const base = String(import.meta.env.BASE_URL || '/');
  const url = base.endsWith('/') ? `${base}${relativePath}` : `${base}/${relativePath}`;
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * 코드 파싱
 * GM-TP-TT-BK-02 → category, gender, type, brand, color, modelNo
 */
function parseCode(code) {
  if (!code) return {};
  const [cg, typeCode, brandCode, colorCode, modelNo] = code.split('-');
  return {
    categoryCode: cg?.[0] ?? null,
    genderCode: cg?.[1] ?? null,
    typeCode,
    brandCode,
    colorCode,
    modelNo,
  };
}

/**
 * codeParts 변환
 * seed-code-parts.json → DB codeParts 테이블용 배열
 */
function buildCodePartRows() {
  const rows = [];

  Object.entries(seedCodeParts).forEach(([group, list]) => {
    if (!Array.isArray(list)) return;
    list.forEach((item) =>
      rows.push({
        group,
        code: item.code,
        labelKo: item.label,
      })
    );
  });

  return rows;
}

/**
 * products 테이블용 데이터 생성
 * - 하나의 제품코드는 여러 사이즈가 있음
 * - 총 재고 stockQty 합산
 * - pricePhp는 seed에서 제공된 값(pricePhp)
 */
function buildProductRows({ productPriceList, seedExpanded }) {
  const map = {};

  const priceMap = new Map(
    (Array.isArray(productPriceList) ? productPriceList : []).map((p) => [
      String(p['제품코드'] || p.Code || p.code || '').trim(),
      Number(p['판매가'] || p.Price || p.price || 0) || 0,
    ])
  );

  (Array.isArray(seedExpanded) ? seedExpanded : []).forEach((item) => {
    const code = String(item?.code || '').trim();
    if (!code) return;
    if (!map[code]) {
      map[code] = {
        code,
        ...parseCode(code),
        salePricePhp: priceMap.get(code) ?? 0,
        totalStock: 0,
      };
    }
    map[code].totalStock += Number(item.stockQty ?? 0);
  });

  return Object.values(map);
}

/**
 * inventory 테이블용 데이터 생성
 * code + size + stockQty
 */
function buildInventoryRows(seedExpanded) {
  return (Array.isArray(seedExpanded) ? seedExpanded : [])
    .map((item) => {
      const code = String(item?.code || '').trim();
      if (!code) return null;
      const size = item?.size ?? '';
      return {
        code,
        size,
        stockQty: item?.stockQty,
        sizeDisplay: size || 'Free',
      };
    })
    .filter(Boolean);
}

/**
 * 실제 DB에 seed 로딩
 */
export async function loadSeedData() {
  const [pCount, iCount, cCount] = await Promise.all([
    db.products.count(),
    db.inventory.count(),
    db.codeParts.count(),
  ]);

  if (pCount > 0 && iCount > 0 && cCount > 0) {
    return;
  }

  const codePartRows = buildCodePartRows();
  const [productPriceList, seedExpanded] = await Promise.all([
    tryFetchJson('products.json'),
    tryFetchJson('seed-products-expanded.json'),
  ]);

  const productRows = pCount > 0 ? [] : buildProductRows({ productPriceList, seedExpanded });
  const inventoryRows = iCount > 0 ? [] : buildInventoryRows(seedExpanded);

  await db.transaction('rw', db.products, db.inventory, db.codeParts, async () => {
    if (cCount <= 0 && codePartRows.length) await db.codeParts.bulkAdd(codePartRows);
    if (productRows.length) await db.products.bulkAdd(productRows);
    if (inventoryRows.length) await db.inventory.bulkAdd(inventoryRows);
  });
}

/**
 * 개발용: DB 리셋 후 다시 seed 로딩
 */
export async function resetAndReloadSeed() {
  await db.delete();
  await db.open();
  await loadSeedData();
}

// 기존 페이지 코드 호환용 래퍼
export async function seedIfEmpty() {
  return loadSeedData();
}

export async function resetFromSeed() {
  requireAdminOrThrow();
  return resetAndReloadSeed();
}
