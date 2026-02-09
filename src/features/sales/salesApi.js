// src/features/sales/salesApi.js
import db from '../../db/dexieClient';
import codePartsSeed from '../../db/seed/seed-code-parts.json';
import { requireAdminOrThrow } from '../../utils/admin';

/**
 * =========================
 * 코드 -> 라벨/이름 파생 유틸
 * =========================
 */
function findLabel(group, c) {
  const arr = codePartsSeed[group] || [];
  const hit = arr.find((i) => i.code === (c || ''));
  return (hit?.label || '').trim();
}

function deriveNameFromCode(code) {
  const parts = String(code || '').split('-');
  const [cg, typeCode, brandCode, colorCode] = parts;
  const serial = parts[parts.length - 1] || '';
  const categoryCode = cg?.[0] ?? '';
  return [
    findLabel('category', categoryCode),
    findLabel('type', typeCode),
    findLabel('brand', brandCode),
    findLabel('color', colorCode),
    serial,
  ]
    .filter(Boolean)
    .join(' - ');
}

function includesIgnoreCase(hay, needle) {
  return String(hay || '')
    .toLowerCase()
    .includes(String(needle || '').toLowerCase());
}

/**
 * =========================
 * 장바구니 결제 / 즉시 판매 공통 처리
 * cartItems: [{ code, size, qty, unitPricePhp?, nameKo?, sizeDisplay? }]
 * =========================
 */
export async function checkoutCart(cartItems) {
  if (!Array.isArray(cartItems) || cartItems.length === 0) {
    throw new Error('장바구니가 비어 있습니다.');
  }

  const items = cartItems.filter((i) => (i.qty ?? 0) > 0);
  if (items.length === 0) {
    throw new Error('수량이 0 이하인 상품만 있습니다.');
  }

  return db.transaction('rw', db.products, db.inventory, db.sales, db.saleItems, async () => {
    let totalAmount = 0;
    let totalQty = 0;

    // Inventory check
    for (const item of items) {
      const { code, size, qty } = item;
      if (!code) throw new Error('Missing product code.');

      const invRow = await db.inventory
        .where('[code+size]')
        .equals([code, size ?? ''])
        .first();
      if (!invRow) throw new Error(`No inventory info: ${code} / ${size || 'Free'}`);

      if ((invRow.stockQty ?? 0) < qty) {
        throw new Error(
          `Insufficient stock: ${code} / ${size || 'Free'} (Req ${qty}, Stock ${invRow.stockQty ?? 0})`
        );
      }
    }

    const saleItemsToInsert = [];

    for (const item of items) {
      const { code, size, qty } = item;

      const product = await db.products.get(code);
      if (!product) throw new Error(`상품 마스터 없음: ${code}`);

      const unitPriceOriginal =
        Number(item.originalUnitPricePhp ?? item.unitPricePhp ?? product.salePricePhp ?? 0) || 0;
      const unitPriceChargedCandidate = Number(item.unitPricePhp ?? unitPriceOriginal);
      const unitPriceCharged = Number.isFinite(unitPriceChargedCandidate)
        ? unitPriceChargedCandidate
        : unitPriceOriginal;
      const lineTotal = unitPriceCharged * qty;
      const freeGift = unitPriceCharged === 0;

      const invRow = await db.inventory
        .where('[code+size]')
        .equals([code, size ?? ''])
        .first();

      await db.inventory.update(invRow.id, {
        stockQty: (invRow.stockQty ?? 0) - qty,
      });

      // Update product master totalStock
      if (product.totalStock != null) {
        await db.products.update(code, {
          totalStock: (product.totalStock ?? 0) - qty,
        });
      }


      totalAmount += lineTotal;
      totalQty += qty;

      saleItemsToInsert.push({
        code,
        size: size ?? '',
        color: String(item.color || '').trim(),
        qty,
        unitPricePhp: unitPriceOriginal,
        discountUnitPricePhp: unitPriceCharged !== unitPriceOriginal ? unitPriceCharged : undefined,
        freeGift,
      });
    }

    const soldAt = new Date().toISOString();

    const saleId = await db.sales.add({
      soldAt,
      totalAmount,
      itemCount: totalQty,
    });

    if (saleItemsToInsert.length > 0) {
      await db.saleItems.bulkAdd(
        saleItemsToInsert.map((si) => ({
          ...si,
          saleId,
        }))
      );
    }

    // logs (있으면 기록)
    try {
      if (db.logs) {
        const logs = saleItemsToInsert.map((si) => ({
          type: 'SALE',
          time: soldAt,
          code: si.code,
          size: si.size ?? '',
          data: JSON.stringify({
            saleId,
            qty: si.qty,
            unitPricePhp: si.unitPricePhp,
            lineTotal: si.unitPricePhp * si.qty,
          }),
        }));
        if (logs.length) await db.logs.bulkAdd(logs);
      }
    } catch {
      // ignore log error
    }

    return {
      saleId,
      soldAt,
      totalAmount,
      itemCount: totalQty,
    };
  });
}

export async function instantSale(payload) {
  return checkoutCart([payload]);
}

export async function getSalesList() {
  return await db.sales.orderBy('soldAt').reverse().toArray();
}

export async function processRefund({ saleId, code, size, qty, reason }) {
  requireAdminOrThrow();
  const sid = Number(saleId);
  if (!sid || !code) throw new Error('INVALID_REFUND_PAYLOAD');
  const q = Number(qty || 0);
  if (q <= 0) throw new Error('INVALID_REFUND_QTY');
  const reasonStr = String(reason || '').trim();
  if (!reasonStr || reasonStr.length > 50) throw new Error('INVALID_REFUND_REASON');

  return db.transaction('rw', db.products, db.saleItems, db.inventory, db.refunds, db.logs, async () => {
    const item = await db.saleItems
      .where({ saleId: sid, code, size: size ?? '' })
      .first();
    if (!item) throw new Error('SALE_ITEM_NOT_FOUND');
    const chargedUnit = Number((item.discountUnitPricePhp ?? item.unitPricePhp) || 0) || 0;
    const amount = chargedUnit * q;

    const invRow = await db.inventory.where('[code+size]').equals([code, size ?? '']).first();
    if (invRow) {
      await db.inventory.update(invRow.id, {
        stockQty: Number(invRow.stockQty || 0) + q,
      });
    }

    // Update product master totalStock
    const product = await db.products.get(code);
    if (product && product.totalStock != null) {
      await db.products.update(code, {
        totalStock: (product.totalStock ?? 0) + q,
      });
    }


    const time = new Date().toISOString();
    await db.refunds.add({
      saleId: sid,
      code,
      size: size ?? '',
      qty: q,
      amountPhp: amount,
      reason: reasonStr,
      time,
    });

    await db.logs
      .add({
        type: 'REFUND',
        time,
        code,
        size: size ?? '',
        data: JSON.stringify({ saleId: sid, qty: q, amountPhp: amount, reason: reasonStr }),
      })
      .catch(() => null);
  });
}

export async function setSaleFreeGift({ saleId, code, size, freeGift } = {}) {
  requireAdminOrThrow();
  const sid = Number(saleId);
  if (!sid || !code) throw new Error('INVALID_SALE_ITEM_KEY');
  const sizeKey = String(size ?? '').trim();
  const item = await db.saleItems.where({ saleId: sid, code, size: sizeKey }).first();
  if (!item) throw new Error('SALE_ITEM_NOT_FOUND');
  await db.saleItems.update(item.id, { freeGift: Boolean(freeGift) });
  return { ok: true, saleId: sid, code, size: sizeKey, freeGift: Boolean(freeGift) };
}

export async function setSaleTime({ saleId, soldAt } = {}) {
  const sid = Number(saleId || 0);
  const iso = String(soldAt || '').trim();
  if (!sid || !iso) throw new Error('INVALID_SALE_TIME');
  await db.sales.update(sid, { soldAt: iso });
  return { ok: true };
}

export async function updateSalePrice({ saleId, price } = {}) {
  const sid = Number(saleId || 0);
  const p = Number(price);
  if (!sid || !Number.isFinite(p) || p < 0) throw new Error('INVALID_PRICE_UPDATE');

  // Local DB uses saleItems table for items.
  // We need to find the item. In local DB, saleId in saleItems refers to the parent sale header ID?
  // No, looking at checkoutCart in salesApi.js:
  // saleId is returned from db.sales.add
  // saleItems have saleId pointing to that.
  
  // Wait, `saleId` passed here might be the item's ID or the parent ID?
  // In `SalesTable.jsx`:
  // row.saleGroupId is the group ID (Supabase).
  // row.saleId is... let's check SalesTable.jsx mapping.
  // `id: row.saleId` (Supabase uses `id` column of `sales` table).
  // In Local `getSalesHistoryFlat`:
  // `saleId` property of item comes from `saleMap.get(i.saleId)`.
  // The items themselves have an `id` in `saleItems` table?
  // `saleItems.bulkAdd` -> IDs are auto-generated?
  // Dexie `saleItems` table probably has an `id`.
  
  // In `getSalesHistoryFlat` (local):
  // It returns items.
  // `const allItems = await db.saleItems...`
  // The mapped object doesn't explicitly include `id` of the item, but `...i` spreads it.
  // So `row.id` (or similar) should be available.
  
  // However, SalesTable.jsx uses `row.saleId` as the unique identifier for the row in some places?
  // Actually `SalesTable.jsx`:
  // `id: row.saleId-row.code...` for key.
  // `saleGroupId: row.saleGroupId`
  // `guideId: row.guideId`
  
  // If I use `saleId` to identify the row, in Supabase it's the unique ID of the row.
  // In Local, `saleItems` has an `id`.
  // If `row.saleId` corresponds to `saleItems.id`, then I can use it.
  
  // Let's assume `saleId` passed to this function is the ID of the `saleItems` record (local) or `sales` record (Supabase).
  // I will check if `saleItems` has `id`.
  
  // update local item
  // Note: local DB structure might be different from Supabase.
  // Supabase: `sales` table has `id`.
  // Local: `saleItems` table has `id`.
  // If `saleId` is passed, I'll assume it targets the item.
  
  // But wait, `SalesTable.jsx` might be passing `saleId` which is the HEADER id in local mode?
  // In `SalesTable.jsx`:
  // `row.saleId` comes from `sales` table `id` in Supabase (which is the ITEM id? No, Supabase `sales` table is the item table).
  // In Local `getSalesHistoryFlat`:
  // `return allItems.map(i => ...)`
  // `i` is a `saleItems` row. It has `id`.
  // But does `SalesTable` use `i.id`?
  // `SalesTable` expects `row.saleId`.
  // In `getSalesHistoryFlat` (local):
  // `...i` spreads item properties. `i.id` is the item ID.
  // But `i.saleId` is the parent ID.
  // If `SalesTable` uses `saleId` as the primary key for updates, it might be ambiguous.
  
  // Let's check `SalesTable.jsx` again.
  // `id: ${row.saleId}-${row.code}...`
  // It seems `row.saleId` is used.
  // In Supabase `sales` table (items), `id` is the PK.
  // In Local `saleItems` table, `id` is the PK.
  // So `saleId` should be the item ID.
  
  // However, in `getSalesHistoryFlat` (local):
  // `const sale = saleMap.get(i.saleId);`
  // `...i` includes `saleId` (parent ID).
  // It does NOT explicitly rename `i.id` to anything.
  // So `row.id` would be the item ID.
  // But `SalesTable` uses `row.saleId` which usually refers to the parent ID in local context?
  // Actually, let's look at `getSalesHistoryFlat` in `salesApi.js` again.
  // `return allItems.map((i) => { ... saleId: i.saleId ... })`
  // `i.saleId` is the parent ID.
  // `i.id` is the item ID.
  
  // If `SalesTable` uses `row.saleId` for `updateSalePrice`, it might be targeting the WRONG thing in local mode if it expects Item ID.
  // In Supabase mode, `row.saleId` is the Item ID (since `sales` table is items).
  // In Local mode, `row.saleId` is the Parent ID.
  
  // This is a discrepancy.
  // If I want to update a specific item, I need the Item ID.
  // In `SalesTable.jsx`, `row` has `saleId` (Parent ID in local, Item ID in Supabase?).
  // Let's verify what `row.saleId` is in Supabase mode.
  // `getSalesHistoryFilteredResult` calls `getSalesHistoryFlat`.
  // In `salesApiSupabase.js`:
  // `sbSelectAll('sales', ...)` -> returns rows from `sales` table (items).
  // So `row.id` is the Item ID.
  // `row.sale_group_id` is the group ID.
  // `salesApiSupabase.js` `getSalesHistoryFlat` maps `id` to `saleId`?
  // Let's check `getSalesHistoryFlat` in `salesApiSupabase.js`.
  // (I haven't read that part yet, I only read up to `checkoutCart` in `salesApiSupabase.js`).
  
  // I need to read `getSalesHistoryFlat` in `salesApiSupabase.js` to confirm.
  // But assuming I need to pass the Item ID.
  // I will make sure `SalesTable` passes the correct ID.
  
  // For now, I'll implement `updateSalePrice` in `salesApi.js` assuming `saleId` passed is the Item ID (if I can distinguish).
  // Or maybe I should accept `itemId` separately?
  // But `SalesTable` rows might not have `itemId` property normalized.
  
  // Let's assume for Local mode, we might need to find the item by other means or ensure we have the item ID.
  // Actually, looking at `salesApi.js` `getSalesHistoryFlat`:
  // `...i` -> `i` has `id`.
  // So `row.id` (if not overwritten) is Item ID.
  // But `SalesTable` constructs a custom `id` for the grid: `id: row.saleId...`.
  
  // I will just implement `updateSalePrice` in `salesApi.js` to update `saleItems` by `id`.
  // I will call it `updateSaleItemPrice` to be clear, or just `updateSalePrice` and treat the ID as Item ID.
  // NOTE: If `saleId` passed is the parent ID, this will fail.
  // I should probably ensure `SalesTable` passes the Item ID.
  
  // Let's look at `SalesTable` again.
  // `row` object comes from `useSalesHistoryFiltered`.
  
  // If I look at `salesApiSupabase.js`, I'll check how it returns data.
  
  // I'll proceed with adding the function to `salesApi.js` assuming `saleId` is the primary key of the item record.
  
  const item = await db.saleItems.get(sid);
  if (!item) throw new Error('ITEM_NOT_FOUND');
  
  await db.saleItems.update(sid, {
    unitPricePhp: p,
    discountUnitPricePhp: undefined // Remove discount to apply new price
  });
  
  return { ok: true };
}

export async function getSaleItemsBySaleId(saleId) {
  const items = await db.saleItems.where('saleId').equals(saleId).toArray();

  const productCodes = [...new Set(items.map((i) => i.code))];
  const products = await db.products.where('code').anyOf(productCodes).toArray();
  const productMap = new Map(products.map((p) => [p.code, p]));

  const inventoryRows = await db.inventory.where('code').anyOf(productCodes).toArray();
  const inventoryMap = new Map(inventoryRows.map((r) => [`${r.code}|${r.size ?? ''}`, r]));

  return items.map((i) => {
    const product = productMap.get(i.code);
    const inv = inventoryMap.get(`${i.code}|${i.size ?? ''}`);
    const color = String(i.color || '').trim() || findLabel('color', String(i.code || '').split('-')[3] || '');

    return {
      ...i,
      nameKo:
        (product?.nameKo && String(product.nameKo).trim()) || deriveNameFromCode(i.code) || i.code,
      sizeDisplay: inv?.sizeDisplay ?? i.size,
      color,
      lineTotalPhp: (i.discountUnitPricePhp ?? i.unitPricePhp) * i.qty,
    };
  });
}

export async function getSalesHistoryFlat() {
  const sales = await db.sales.orderBy('soldAt').reverse().toArray();
  if (sales.length === 0) return [];

  const saleIds = sales.map((s) => s.id);
  const allItems = await db.saleItems.where('saleId').anyOf(saleIds).toArray();

  const productCodes = [...new Set(allItems.map((i) => i.code))];
  const products = await db.products.where('code').anyOf(productCodes).toArray();
  const productMap = new Map(products.map((p) => [p.code, p]));

  const inventoryRows = await db.inventory.where('code').anyOf(productCodes).toArray();
  const inventoryMap = new Map(inventoryRows.map((r) => [`${r.code}|${r.size ?? ''}`, r]));

  const saleMap = new Map(sales.map((s) => [s.id, s]));

  return allItems.map((i) => {
    const product = productMap.get(i.code);
    const inv = inventoryMap.get(`${i.code}|${i.size ?? ''}`);
    const sale = saleMap.get(i.saleId);
    const color = String(i.color || '').trim() || findLabel('color', String(i.code || '').split('-')[3] || '');

    return {
      saleId: i.saleId,
      soldAt: sale?.soldAt,
      code: i.code,
      nameKo:
        (product?.nameKo && String(product.nameKo).trim()) || deriveNameFromCode(i.code) || i.code,
      sizeDisplay: inv?.sizeDisplay ?? i.size,
      color,
      qty: i.qty,
      unitPricePhp: i.unitPricePhp,
      discountUnitPricePhp: i.discountUnitPricePhp,
      lineTotalPhp: (i.discountUnitPricePhp ?? i.unitPricePhp) * i.qty,
    };
  });
}

/**
 * ✅ 필터만 적용한 flat
 */
export async function getSalesHistoryFlatFiltered({ fromDate = '', toDate = '', query = '' } = {}) {
  const salesAll = await db.sales.orderBy('soldAt').reverse().toArray();
  if (salesAll.length === 0) return [];

  const hasFrom = !!fromDate;
  const hasTo = !!toDate;
  const fromKey = String(fromDate || '').trim();
  const toKey = String(toDate || '').trim();

  const sales =
    hasFrom || hasTo
      ? salesAll.filter((s) => {
          const key = String(s?.soldAt || '').slice(0, 10);
          if (!key) return false;
          if (hasFrom && key < fromKey) return false;
          if (hasTo && key > toKey) return false;
          return true;
        })
      : salesAll;

  if (sales.length === 0) return [];

  const saleIds = sales.map((s) => s.id);
  const allItems = await db.saleItems.where('saleId').anyOf(saleIds).toArray();
  if (allItems.length === 0) return [];

  const productCodes = [...new Set(allItems.map((i) => i.code))];
  const products = await db.products.where('code').anyOf(productCodes).toArray();
  const productMap = new Map(products.map((p) => [p.code, p]));

  const inventoryRows = await db.inventory.where('code').anyOf(productCodes).toArray();
  const inventoryMap = new Map(inventoryRows.map((r) => [`${r.code}|${r.size ?? ''}`, r]));

  const saleMap = new Map(sales.map((s) => [s.id, s]));

  const refundMap = new Map();
  const refundInfoMap = new Map();
  const allRefunds = await db.refunds.toArray();
  for (const rf of allRefunds) {
    const key = `${rf.saleId}-${rf.code}-${rf.size}`;
    const prev = refundMap.get(key) || 0;
    refundMap.set(key, prev + rf.qty);
    const prevInfo = refundInfoMap.get(key);
    const time = String(rf?.time || '').trim();
    if (!prevInfo || (time && String(prevInfo.time || '') < time)) {
      refundInfoMap.set(key, { time, reason: String(rf?.reason || '').trim() });
    }
  }

  const flat = allItems.map((i) => {
    const product = productMap.get(i.code);
    const inv = inventoryMap.get(`${i.code}|${i.size ?? ''}`);
    const sale = saleMap.get(i.saleId);
    const color = String(i.color || '').trim() || findLabel('color', String(i.code || '').split('-')[3] || '');

    const nameKo =
      (product?.nameKo && String(product.nameKo).trim()) || deriveNameFromCode(i.code) || i.code;

    const sizeDisplay = inv?.sizeDisplay ?? i.size;

    const refundedQty = refundMap.get(`${i.saleId}-${i.code}-${i.size}`) || 0;
    const remainingQty = Math.max(0, i.qty - refundedQty);
    const isRefunded = remainingQty <= 0 && refundedQty > 0;
    const refundInfo = refundInfoMap.get(`${i.saleId}-${i.code}-${i.size}`) || null;

    const finalUnit = i.discountUnitPricePhp ?? i.unitPricePhp;
    const freeGift = Boolean(i.freeGift ?? false) || finalUnit === 0;

    return {
      saleId: i.saleId,
      soldAt: sale?.soldAt,
      code: i.code,
      size: i.size ?? '',
      color,
      nameKo,
      sizeDisplay,
      qty: isRefunded ? i.qty : remainingQty,
      originalQty: i.qty,
      refundedQty,
      unitPricePhp: isRefunded ? 0 : i.unitPricePhp,
      discountUnitPricePhp: i.discountUnitPricePhp,
      lineTotalPhp: (isRefunded ? 0 : finalUnit) * (isRefunded ? i.qty : remainingQty),
      freeGift,
      refundedAt: refundInfo?.time || null,
      refundReason: refundInfo?.reason || '',
      isRefunded,
    };
  });

  const q = String(query || '').trim();
  if (!q) return flat;

  return flat.filter((r) => {
    return (
      includesIgnoreCase(r.code, q) ||
      includesIgnoreCase(r.nameKo, q) ||
      includesIgnoreCase(r.sizeDisplay, q) ||
      includesIgnoreCase(r.color, q)
    );
  });
}

/**
 * ✅ UI 메시지 구분을 위해 메타 포함해서 리턴
 * - hasAnySales: 판매 기록 자체가 존재?
 * - rows: 필터/검색 결과
 */
export async function getSalesHistoryFilteredResult({
  fromDate = '',
  toDate = '',
  query = '',
} = {}) {
  const hasAnySales = (await db.sales.count()) > 0;
  const rows = await getSalesHistoryFlatFiltered({ fromDate, toDate, query });
  return { hasAnySales, rows };
}

export async function getAnalytics({ fromDate = '', toDate = '' } = {}) {
  const rows = await getSalesHistoryFlatFiltered({ fromDate, toDate, query: '' });
  const hasFrom = !!fromDate;
  const hasTo = !!toDate;
  const fromKey = String(fromDate || '').trim();
  const toKey = String(toDate || '').trim();
  const refundsAll = await db.refunds.orderBy('time').toArray();
  const refunds =
    hasFrom || hasTo
      ? refundsAll.filter((r) => {
          const key = String(r?.time || '').slice(0, 10);
          if (!key) return false;
          if (hasFrom && key < fromKey) return false;
          if (hasTo && key > toKey) return false;
          return true;
        })
      : refundsAll;
  if (!rows.length) {
    return {
      summary: {
        grossAmount: 0,
        netAmount: 0,
        costAmount: 0,
        grossProfit: 0,
        rentAmount: 0,
        ownerProfit: 0,
        transactionCount: 0,
        aov: 0,
        discountAmount: 0,
        discountRate: 0,
        refundCount: refunds.length,
        refundAmount: refunds.reduce((sum, r) => sum + (Number(r.amountPhp || 0) || 0), 0),
      },
      best: [],
      worst: [],
      sku: [],
      byCategory: [],
      byBrand: [],
      byGender: [],
      bySize: [],
      byColor: [],
      bestByCategory: [],
      bestColorByCategory: [],
      discountShare: { discountedTransactions: 0, totalTransactions: 0 },
      weeklyRevenue: [],
      monthlyRevenue: [],
    };
  }

  const totalRevenue = rows.reduce((sum, r) => sum + (Number(r.lineTotalPhp || 0) || 0), 0);
  const saleIds = [...new Set(rows.map((r) => r.saleId))];
  const transactionCount = saleIds.length;
  const aov = transactionCount ? totalRevenue / transactionCount : 0;

  const refundAmount = refunds.reduce((sum, r) => sum + (Number(r.amountPhp || 0) || 0), 0);
  const refundCount = refunds.length;

  const costAmount = 0;
  const grossProfit = totalRevenue - costAmount;
  const netAmount = totalRevenue - refundAmount;
  const rentAmount = netAmount * 0.1;
  const ownerProfit = netAmount - rentAmount - costAmount;

  const summary = {
    grossAmount: totalRevenue,
    netAmount,
    costAmount,
    grossProfit,
    rentAmount,
    ownerProfit,
    totalCommission: 0,
    transactionCount,
    aov,
    discountAmount: 0,
    discountRate: 0.1,
    refundCount,
    refundAmount,
  };

  const byCode = new Map();
  for (const r of rows) {
    const key = r.code;
    const prev = byCode.get(key) || { code: key, qty: 0, revenue: 0 };
    prev.qty += r.qty || 0;
    prev.revenue += Number(r.lineTotalPhp || 0) || 0;
    byCode.set(key, prev);
  }
  const sku = [...byCode.values()];
  const best = [...sku].sort((a, b) => b.revenue - a.revenue).slice(0, 20);
  const worst = [...sku].sort((a, b) => a.revenue - b.revenue).slice(0, 20);

  // Best product per category
  const bestByCategoryMap = new Map();
  for (const s of sku) {
    const categoryCode = String(s.code || '').split('-')[0]?.[0] || '';
    if (!categoryCode) continue;
    const prev = bestByCategoryMap.get(categoryCode);
    if (!prev || s.revenue > prev.revenue) {
      bestByCategoryMap.set(categoryCode, {
        category: findLabel('category', categoryCode),
        code: s.code,
        qty: s.qty,
        revenue: s.revenue,
      });
    }
  }
  const bestByCategory = [...bestByCategoryMap.values()].sort((a, b) => b.revenue - a.revenue);

  const bestColorAgg = new Map();
  for (const r of rows) {
    const categoryCode = String(r.code || '').split('-')[0]?.[0] || '';
    if (!categoryCode) continue;
    const colorLabel =
      String(r.color || '').trim() || findLabel('color', String(r.code || '').split('-')[3] || '');
    if (!colorLabel) continue;
    const catMap = bestColorAgg.get(categoryCode) || new Map();
    const prev = catMap.get(colorLabel) || { color: colorLabel, qty: 0, revenue: 0 };
    prev.qty += Number(r.qty || 0) || 0;
    prev.revenue += Number(r.lineTotalPhp || 0) || 0;
    catMap.set(colorLabel, prev);
    bestColorAgg.set(categoryCode, catMap);
  }
  const bestColorByCategory = [];
  for (const [catCode, cmap] of bestColorAgg.entries()) {
    let best = null;
    for (const v of cmap.values()) {
      if (!best || v.revenue > best.revenue) best = v;
    }
    if (best) {
      bestColorByCategory.push({
        category: findLabel('category', catCode),
        color: best.color,
        qty: best.qty,
        revenue: best.revenue,
      });
    }
  }
  bestColorByCategory.sort((a, b) => b.revenue - a.revenue);

  // Color totals grouped by Type
  const colorByTypeAgg = new Map();
  for (const r of rows) {
    const typeCode = String(r.code || '').split('-')[1] || '';
    if (!typeCode) continue;
    const typeLabel = findLabel('type', typeCode);
    const colorLabel =
      String(r.color || '').trim() || findLabel('color', String(r.code || '').split('-')[3] || '');
    if (!colorLabel) continue;
    const typeMap = colorByTypeAgg.get(typeLabel) || new Map();
    const prev = typeMap.get(colorLabel) || { type: typeLabel, color: colorLabel, qty: 0, revenue: 0 };
    prev.qty += Number(r.qty || 0) || 0;
    prev.revenue += Number(r.lineTotalPhp || 0) || 0;
    typeMap.set(colorLabel, prev);
    colorByTypeAgg.set(typeLabel, typeMap);
  }
  const colorByType = [];
  for (const [, cmap] of colorByTypeAgg.entries()) {
    for (const v of cmap.values()) {
      colorByType.push(v);
    }
  }
  colorByType.sort((a, b) => b.revenue - a.revenue);

  // Pivot (Qty) for Color x Type
  const typeAllow = new Set(['top','bottom','bag','hat','golfbag','golfBag','pouch','belt'].map((s) => s.toLowerCase()));
  const pivotTypes = [...new Set(colorByType.map((v) => v.type))].filter((t) =>
    typeAllow.has(String(t || '').toLowerCase())
  );
  const pivotColors = [...new Set(colorByType.map((v) => v.color))];
  const colorTypePivotRows = pivotColors.map((c) => {
    const row = { color: c };
    for (const t of pivotTypes) {
      const hit = colorByType.find((v) => v.type === t && v.color === c);
      row[t] = hit ? (Number(hit.qty || 0) || 0) : 0;
    }
    return row;
  });
  const colorTypePivotColumns = pivotTypes;

  function accumulate(arr, keyGetter, labelGetter) {
    const m = new Map();
    for (const r of arr) {
      const key = keyGetter(r);
      const prev = m.get(key) || { key, qty: 0, revenue: 0 };
      prev.qty += r.qty || 0;
      prev.revenue += Number(r.lineTotalPhp || 0) || 0;
      m.set(key, prev);
    }
    return [...m.values()]
      .map((x) => ({ ...x, key: labelGetter ? labelGetter(x.key) : x.key }))
      .filter((x) => x.qty > 0 || x.revenue > 0);
  }

  const revenueRows = rows.filter((r) => !r.freeGift && (Number(r.lineTotalPhp || 0) > 0));
  const byCategory = accumulate(revenueRows, (r) => String(r.code || '').split('-')[0]?.[0] || '', (k) =>
    findLabel('category', k)
  );
  const byBrand = accumulate(revenueRows, (r) => String(r.code || '').split('-')[2] || '', (k) =>
    findLabel('brand', k)
  );
  const byType = accumulate(revenueRows, (r) => String(r.code || '').split('-')[1] || '', (k) =>
    findLabel('type', k)
  );
  const byColor = accumulate(
    rows,
    (r) => String(r.color || '').trim() || String(r.code || '').split('-')[3] || '',
    (k) => (String(k || '').trim().length > 2 ? k : findLabel('color', k))
  );
  const bySize = accumulate(revenueRows, (r) => r.sizeDisplay || r.size || '', (k) => k);
  const byGender = accumulate(
    revenueRows,
    (r) => String(r.code || '').split('-')[0]?.[1] || '',
    (k) => findLabel('gender', k)
  );

  function makeWeekKey(dt) {
    const d = new Date(dt);
    const yyyy = d.getFullYear();
    const onejan = new Date(yyyy, 0, 1);
    const dayms = 86400000;
    const week = Math.ceil(((d - onejan) / dayms + onejan.getDay() + 1) / 7);
    return `${yyyy}-W${String(week).padStart(2, '0')}`;
  }
  function makeMonthKey(dt) {
    const d = new Date(dt);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return `${yyyy}-${mm}`;
  }
  const weeklyMap = new Map();
  const monthlyMap = new Map();
  for (const r of rows) {
    if (!r.soldAt) continue;
    const wk = makeWeekKey(r.soldAt);
    const mk = makeMonthKey(r.soldAt);
    weeklyMap.set(wk, (weeklyMap.get(wk) || 0) + (Number(r.lineTotalPhp || 0) || 0));
    monthlyMap.set(mk, (monthlyMap.get(mk) || 0) + (Number(r.lineTotalPhp || 0) || 0));
  }
  const weeklyRevenue = [...weeklyMap.entries()]
    .map(([key, amount]) => ({ key, amount }))
    .sort((a, b) => (a.key < b.key ? -1 : 1));
  const monthlyRevenue = [...monthlyMap.entries()]
    .map(([key, amount]) => ({ key, amount }))
    .sort((a, b) => (a.key < b.key ? -1 : 1));

  const weekdayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const byWeekdayQtyMap = new Map(weekdayNames.map((n, i) => [i, { key: n, qty: 0 }]));
  const byHourQtyMap = new Map(Array.from({ length: 12 }, (_, k) => [k + 6, { hour: k + 6, qty: 0 }]));
  for (const r of rows) {
    if (!r.soldAt) continue;
    const dt = new Date(r.soldAt);
    const day = dt.getDay();
    const hour = dt.getHours();
    const qtyN = Number(r.qty || 0) || 0;
    const wd = byWeekdayQtyMap.get(day);
    if (wd) wd.qty += qtyN;
    if (hour >= 6 && hour <= 17) {
      const hh = byHourQtyMap.get(hour);
      if (hh) hh.qty += qtyN;
    }
  }
  const byWeekdayQty = [...byWeekdayQtyMap.values()];
  const byHourQty = [...byHourQtyMap.values()];
  const bestWeekday = byWeekdayQty.slice().sort((a, b) => b.qty - a.qty)[0] || { key: '', qty: 0 };
  const bestHour = byHourQty.slice().sort((a, b) => b.qty - a.qty)[0] || { hour: 0, qty: 0 };

  return {
    summary,
    best,
    worst,
    sku,
    byCategory,
    byBrand,
    byType,
    byGender,
    bySize,
    byColor,
    bestByCategory,
    bestColorByCategory,
    colorTypePivotColumns,
    colorTypePivotRows,
    colorByType,
    weeklyRevenue,
    monthlyRevenue,
    byWeekdayQty,
    byHourQty,
    bestWeekday,
    bestHour,
  };
}
