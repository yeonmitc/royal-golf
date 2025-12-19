// src/features/products/productApi.js
import db from '../../db/dexieClient';
import { requireAdminOrThrow } from '../../utils/admin';

/**
 * 단일 상품 마스터
 */
export async function getProductByCode(code) {
  if (!code) return null;
  return db.products.get(code);
}

/**
 * 단일 상품의 사이즈별 재고 목록
 */
export async function getInventoryByCode(code) {
  if (!code) return [];
  return db.inventory.where('code').equals(code).toArray();
}

/**
 * 상품 + 재고를 합쳐서 반환
 */
export async function getProductWithInventory(code) {
  const [product, inventory] = await Promise.all([
    getProductByCode(code),
    getInventoryByCode(code),
  ]);

  if (!product) return null;

  // 재고 합계가 DB totalStock과 다르면 다시 계산
  const computedTotal = inventory.reduce((sum, r) => sum + (Number(r.stockQty) || 0), 0);

  // If we have inventory records, trust the computed total (even if 0).
  // Otherwise, fall back to product.totalStock.
  const totalStock = inventory.length > 0 ? computedTotal : product.totalStock || 0;

  return {
    ...product,
    totalStock,
    inventory, // [{ id, code, size, sizeDisplay, stockQty, location }]
  };
}

/**
 * 전체 상품 목록 + 각 상품의 사이즈별 재고/합계
 * - ProductListTable 용
 */
export async function getProductInventoryList() {
  const [products, inventoryRows] = await Promise.all([
    db.products.orderBy('code').toArray(),
    db.inventory.toArray(),
  ]);

  const map = new Map();

  inventoryRows.forEach((row) => {
    const code = row.code;
    if (!map.has(code)) {
      map.set(code, { totalStock: 0, sizes: [] });
    }
    const entry = map.get(code);
    entry.totalStock += Number(row.stockQty ?? 0);
    entry.sizes.push(row);
  });

  return products.map((p) => {
    const entry = map.get(p.code) || { totalStock: 0, sizes: [] };
    // If we have sizes (inventory records), trust the sum. Otherwise fall back to p.totalStock.
    const totalStock = entry.sizes.length > 0 ? entry.totalStock : p.totalStock || 0;

    return {
      ...p,
      totalStock,
      sizes: entry.sizes,
    };
  });
}

/**
 * 단순 검색 (코드 or 이름에 keyword 포함)
 */
export async function searchProducts(keyword) {
  const kw = String(keyword || '').trim();
  if (!kw) {
    return getProductInventoryList();
  }

  const lc = kw.toLowerCase();

  const list = await getProductInventoryList();
  return list.filter((p) => {
    const inCode = p.code.toLowerCase().includes(lc);
    const inName = (p.nameKo || '').toLowerCase().includes(lc);
    return inCode || inName;
  });
}

/**
 * 상품 저장(추가/수정)
 * - inventory는 건드리지 않고 products만 수정
 * - 새로운 코드면 insert, 기존이면 update
 *
 * payload: { code, nameKo?, salePricePhp?, priceCny?, totalStock? ... }
 */
export async function upsertProduct(payload) {
  requireAdminOrThrow();
  const code = String(payload.code || '').trim();
  if (!code) throw new Error('Product code is required.');

  return db.transaction('rw', db.products, db.logs, async () => {
    const existing = await db.products.get(code);

    if (existing) {
      const { priceCny: _omit1, ...existingFiltered } = existing || {};
      const { priceCny: _omit2, ...payloadFiltered } = payload || {};
      const nextRow = { ...existingFiltered, ...payloadFiltered, code };
      await db.products.put(nextRow);
      // 로그: 제품 업데이트
      await db.logs
        .add({
          type: 'PRODUCT_UPDATE',
          time: new Date().toISOString(),
          code,
          data: JSON.stringify({ payload: nextRow }),
        })
        .catch(() => null);
      return code;
    }

    // 새 상품: 코드 파싱해서 기본 필드 채우기
    const [cg, typeCode, brandCode, colorCode, modelNo] = code.split('-');
    const categoryCode = cg?.[0] ?? null;
    const genderCode = cg?.[1] ?? null;

    const row = {
      code,
      nameKo: payload.nameKo ?? '',
      categoryCode,
      genderCode,
      typeCode,
      brandCode,
      colorCode,
      modelNo,
      basePricePhp: Number(payload.basePricePhp ?? 0) || 0,
      salePricePhp: Number(payload.salePricePhp ?? 0) || 0,
      totalStock: Number(payload.totalStock ?? 0) || 0,
    };

    await db.products.add(row);
    // 로그: 제품 추가
    await db.logs
      .add({
        type: 'PRODUCT_ADD',
        time: new Date().toISOString(),
        code,
        data: JSON.stringify({ payload: row }),
      })
      .catch(() => null);
    return code;
  });
}

/**
 * 상품 삭제
 * - products + inventory 모두 제거
 * - 판매 이력은 남겨둔다 (history 보존)
 */
export async function deleteProduct(code) {
  requireAdminOrThrow();
  if (!code) return;
  await db.transaction('rw', db.products, db.inventory, db.logs, async () => {
    await db.products.delete(code);
    await db.inventory.where('code').equals(code).delete();
    await db.logs
      .add({
        type: 'PRODUCT_DELETE',
        time: new Date().toISOString(),
        code,
      })
      .catch(() => null);
  });
}

/**
 * 코드 중복 여부 확인
 */
export async function isProductCodeExists(code) {
  if (!code) return false;
  const row = await db.products.get(code);
  return !!row;
}

export async function updateInventoryQuantities(code, sizeQtyMap) {
  requireAdminOrThrow();
  if (!code) throw new Error('Code is required.');
  const entries = Object.entries(sizeQtyMap || {});
  return db.transaction('rw', db.products, db.inventory, db.logs, async () => {
    for (const [size, qty] of entries) {
      const invRow = await db.inventory
        .where('[code+size]')
        .equals([code, size || ''])
        .first();
      if (invRow) {
        await db.inventory.update(invRow.id, { stockQty: Number(qty) || 0 });
      } else {
        await db.inventory.add({
          code,
          size,
          stockQty: Number(qty) || 0,
          sizeDisplay: size || 'Free',
        });
      }
    }
    const rows = await db.inventory.where('code').equals(code).toArray();
    const total = rows.reduce((s, r) => s + (Number(r.stockQty) || 0), 0);
    const product = await db.products.get(code);
    if (product) await db.products.update(code, { totalStock: total });
    await db.logs
      .add({
        type: 'INVENTORY_UPDATE',
        time: new Date().toISOString(),
        code,
        data: JSON.stringify({ changes: entries }),
      })
      .catch(() => null);
    return { code, totalStock: total };
  });
}
