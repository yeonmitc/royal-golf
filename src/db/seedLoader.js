// src/db/seedLoader.js
import db from './dexieClient';
import { requireAdminOrThrow } from '../utils/admin';

// 네가 실제로 사용하는 seed 파일
import productPriceList from './products.json';
import seedCodeParts from './seed/seed-code-parts.json';
import seedExpanded from './seed/seed-products-expanded.json';

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
function buildProductRows() {
  const map = {};

  const priceMap = new Map(
    (Array.isArray(productPriceList) ? productPriceList : []).map((p) => [
      String(p['제품코드'] || '').trim(),
      Number(p['판매가'] || 0) || 0,
    ])
  );

  seedExpanded.forEach((item) => {
    const code = item.code;
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
function buildInventoryRows() {
  return seedExpanded.map((item) => ({
    code: item.code,
    size: item.size,
    stockQty: item.stockQty,
    sizeDisplay: item.size ?? 'Free',
  }));
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

  if (pCount > 0 || iCount > 0 || cCount > 0) {
    return; // 이미 데이터 있음
  }

  const productRows = buildProductRows();
  const inventoryRows = buildInventoryRows();
  const codePartRows = buildCodePartRows();

  await db.transaction('rw', db.products, db.inventory, db.codeParts, async () => {
    if (codePartRows.length) await db.codeParts.bulkAdd(codePartRows);
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
