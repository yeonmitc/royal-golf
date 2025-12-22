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

/**
 * =========================
 * 날짜/검색 필터 유틸
 * soldAt는 ISO string: "2025-12-14T10:23:11.123Z"
 * =========================
 */
function toMsFromIso(iso) {
  if (!iso) return 0;
  const t = Date.parse(String(iso));
  return Number.isNaN(t) ? 0 : t;
}

function startOfDayMs(dateStr) {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
}

function endOfDayMs(dateStr) {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  return new Date(y, m - 1, d, 23, 59, 59, 999).getTime();
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

      const unitPriceOriginal = Number(item.originalUnitPricePhp ?? item.unitPricePhp ?? product.salePricePhp ?? 0) || 0;
      const unitPriceCharged = Number(item.unitPricePhp ?? unitPriceOriginal) || unitPriceOriginal;
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

    return {
      ...i,
      nameKo:
        (product?.nameKo && String(product.nameKo).trim()) || deriveNameFromCode(i.code) || i.code,
      sizeDisplay: inv?.sizeDisplay ?? i.size,
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

    return {
      saleId: i.saleId,
      soldAt: sale?.soldAt,
      code: i.code,
      nameKo:
        (product?.nameKo && String(product.nameKo).trim()) || deriveNameFromCode(i.code) || i.code,
      sizeDisplay: inv?.sizeDisplay ?? i.size,
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
  const fromMs = hasFrom ? startOfDayMs(fromDate) : -Infinity;
  const toMs = hasTo ? endOfDayMs(toDate) : Infinity;

  const sales =
    hasFrom || hasTo
      ? salesAll.filter((s) => {
          const t = toMsFromIso(s?.soldAt);
          return t >= fromMs && t <= toMs;
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
  const allRefunds = await db.refunds.toArray();
  for (const rf of allRefunds) {
    const key = `${rf.saleId}-${rf.code}-${rf.size}`;
    const prev = refundMap.get(key) || 0;
    refundMap.set(key, prev + rf.qty);
  }

  const flat = allItems.map((i) => {
    const product = productMap.get(i.code);
    const inv = inventoryMap.get(`${i.code}|${i.size ?? ''}`);
    const sale = saleMap.get(i.saleId);

    const nameKo =
      (product?.nameKo && String(product.nameKo).trim()) || deriveNameFromCode(i.code) || i.code;

    const sizeDisplay = inv?.sizeDisplay ?? i.size;

    const refundedQty = refundMap.get(`${i.saleId}-${i.code}-${i.size}`) || 0;
    const remainingQty = Math.max(0, i.qty - refundedQty);

    const finalUnit = i.discountUnitPricePhp ?? i.unitPricePhp;
    const freeGift = Boolean(i.freeGift ?? false) || finalUnit === 0;

    return {
      saleId: i.saleId,
      soldAt: sale?.soldAt,
      code: i.code,
      size: i.size ?? '',
      nameKo,
      sizeDisplay,
      qty: remainingQty, // Show only remaining quantity
      originalQty: i.qty,
      refundedQty,
      unitPricePhp: i.unitPricePhp,
      discountUnitPricePhp: i.discountUnitPricePhp,
      lineTotalPhp: finalUnit * remainingQty,
      freeGift,
    };
  }).filter(r => r.qty > 0); // Filter out fully refunded items

  const q = String(query || '').trim();
  if (!q) return flat;

  return flat.filter((r) => {
    return (
      includesIgnoreCase(r.code, q) ||
      includesIgnoreCase(r.nameKo, q) ||
      includesIgnoreCase(r.sizeDisplay, q)
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
  const fromMs = hasFrom ? startOfDayMs(fromDate) : -Infinity;
  const toMs = hasTo ? endOfDayMs(toDate) : Infinity;
  const refundsAll = await db.refunds.orderBy('time').toArray();
  const refunds =
    hasFrom || hasTo
      ? refundsAll.filter((r) => {
          const t = toMsFromIso(r?.time);
          return t >= fromMs && t <= toMs;
        })
      : refundsAll;
  if (!rows.length) {
    return {
      summary: {
        grossAmount: 0,
        netAmount: 0,
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

  const summary = {
    grossAmount: totalRevenue,
    netAmount: totalRevenue - refundAmount,
    transactionCount,
    aov,
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

  const byCategory = accumulate(rows, (r) => String(r.code || '').split('-')[0]?.[0] || '', (k) =>
    findLabel('category', k)
  );
  const byBrand = accumulate(rows, (r) => String(r.code || '').split('-')[2] || '', (k) =>
    findLabel('brand', k)
  );
  const byColor = accumulate(rows, (r) => String(r.code || '').split('-')[3] || '', (k) =>
    findLabel('color', k)
  );
  const bySize = accumulate(rows, (r) => r.sizeDisplay || r.size || '', (k) => k);
  const byGender = accumulate(
    rows,
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

  return {
    summary,
    best,
    worst,
    sku,
    byCategory,
    byBrand,
    byGender,
    bySize,
    byColor,
    weeklyRevenue,
    monthlyRevenue,
  };
}
