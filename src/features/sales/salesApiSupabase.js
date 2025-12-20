import codePartsSeed from '../../db/seed/seed-code-parts.json';
import { sbInsert, sbSelect, sbUpdate } from '../../db/supabaseRest';
import { requireAdminOrThrow } from '../../utils/admin';

const SIZE_ORDER = ['S', 'M', 'L', 'XL', '2XL', '3XL', 'Free'];
const SIZE_TO_COLUMN = {
  S: 's',
  M: 'm',
  L: 'l',
  XL: 'xl',
  '2XL': '2xl',
  '3XL': '3xl',
  Free: 'free',
};

function toMsFromIso(iso) {
  const t = Date.parse(String(iso || ''));
  return Number.isFinite(t) ? t : 0;
}

function startOfDayMs(yyyyMmDd) {
  const s = String(yyyyMmDd || '').trim();
  if (!s) return -Infinity;
  return new Date(`${s}T00:00:00.000Z`).getTime();
}

function endOfDayMs(yyyyMmDd) {
  const s = String(yyyyMmDd || '').trim();
  if (!s) return Infinity;
  return new Date(`${s}T23:59:59.999Z`).getTime();
}

function includesIgnoreCase(hay, needle) {
  return String(hay || '').toLowerCase().includes(String(needle || '').toLowerCase());
}

function findLabel(group, c) {
  const arr = codePartsSeed[group] || [];
  const hit = arr.find((i) => i.code === (c || ''));
  return (hit?.label || '').trim();
}

function deriveNameFromCode(code) {
  const parts = String(code || '').split('-');
  if (parts.length < 4) return '';
  const category = findLabel('category', parts[0]?.[0]);
  const type = findLabel('type', parts[1]);
  const brand = findLabel('brand', parts[2]);
  const color = findLabel('color', parts[3]);
  const serial = parts[4] || '';
  return [category, type, brand, color, serial].filter(Boolean).join(' - ');
}

function normalizeSizeKey(size) {
  const s = String(size ?? '').trim();
  if (!s) return 'Free';
  const upper = s.toUpperCase();
  if (upper === 'FREE') return 'Free';
  if (upper === '2XL' || upper === '3XL') return upper;
  if (upper === 'XL') return 'XL';
  if (upper === 'S' || upper === 'M' || upper === 'L') return upper;
  return 'Free';
}

function buildInList(values) {
  const unique = [...new Set((values || []).map((v) => String(v ?? '').trim()).filter(Boolean))];
  return `(${unique.map((v) => `"${v.replace(/"/g, '\\"')}"`).join(',')})`;
}

async function attachLocalProductMeta(items) {
  const productCodes = [...new Set(items.map((i) => i.code))].filter(Boolean);
  if (!productCodes.length) return items;

  const inList = buildInList(productCodes);
  const products = await sbSelect('products', {
    select: 'code,name,sale_price,free_gift',
    filters: [{ column: 'code', op: 'in', value: inList }],
  });

  const productMap = new Map(
    (products || []).map((p) => [
      p.code,
      {
        code: p.code,
        nameKo: String(p.name || '').trim(),
        salePricePhp: Number(p.sale_price ?? 0) || 0,
        freeGift: Boolean(p.free_gift ?? false),
      },
    ])
  );

  return items.map((i) => {
    const product = productMap.get(i.code);
    return {
      ...i,
      nameKo: (product?.nameKo && String(product.nameKo).trim()) || deriveNameFromCode(i.code) || i.code,
      sizeDisplay: i.sizeDisplay ?? i.size,
      lineTotalPhp: Number(i.unitPricePhp || 0) * Number(i.qty || 0),
    };
  });
}

export async function checkoutCart(cartItems) {
  if (!Array.isArray(cartItems) || cartItems.length === 0) {
    throw new Error('Cart is empty.');
  }

  const items = cartItems.filter((i) => (i.qty ?? 0) > 0);
  if (items.length === 0) {
    throw new Error('No items with quantity > 0.');
  }

  const productCodes = [...new Set(items.map((i) => i.code))].filter(Boolean);
  const inList = buildInList(productCodes);
  const [products, inventories] = await Promise.all([
    productCodes.length
      ? sbSelect('products', {
          select: 'code,name,sale_price,free_gift',
          filters: [{ column: 'code', op: 'in', value: inList }],
        })
      : [],
    productCodes.length
      ? sbSelect('inventories', {
          select: '*',
          filters: [{ column: 'code', op: 'in', value: inList }],
        })
      : [],
  ]);

  const productMap = new Map(
    (products || []).map((p) => [
      p.code,
      {
        code: p.code,
        name: String(p.name || '').trim(),
        salePrice: Number(p.sale_price ?? 0) || 0,
        freeGift: Boolean(p.free_gift ?? false),
      },
    ])
  );
  const invByCode = new Map((inventories || []).map((r) => [String(r?.code || '').trim(), r]));

  for (const item of items) {
    const { code, size, qty } = item;
    if (!code) throw new Error('Missing product code.');
    const sizeKey = normalizeSizeKey(size ?? item.sizeDisplay);
    const col = SIZE_TO_COLUMN[sizeKey];
    const invRow = invByCode.get(String(code).trim());
    const currentQty = Number(invRow?.[col] ?? 0) || 0;
    if (!invRow) throw new Error(`No inventory info: ${code}`);
    if (currentQty < qty) {
      throw new Error(
        `Insufficient stock: ${code} / ${sizeKey} (Req ${qty}, Stock ${currentQty})`
      );
    }
  }

  let totalAmount = 0;
  let totalQty = 0;
  const soldAt = new Date().toISOString();
  const salesToInsert = [];
  const invUpdatesByCode = new Map();

  for (const item of items) {
    const { code, size, qty } = item;
    if (!code) throw new Error('Missing product code.');
    const product = productMap.get(code);
    if (!product) throw new Error(`No product: ${code}`);

    const unitPriceOriginal =
      Number(item.originalUnitPricePhp ?? item.unitPricePhp ?? product.salePrice ?? 0) || 0;
    const unitPriceCharged = Number(item.unitPricePhp ?? unitPriceOriginal) || unitPriceOriginal;
    const lineTotal = unitPriceCharged * qty;
    const isFreeGift = unitPriceCharged === 0 || Boolean(product.freeGift);

    totalAmount += lineTotal;
    totalQty += qty;

    const sizeKey = normalizeSizeKey(size ?? item.sizeDisplay);
    const col = SIZE_TO_COLUMN[sizeKey];
    const invRow = invByCode.get(String(code).trim());
    const currentQty = Number(invRow?.[col] ?? 0) || 0;
    const nextQty = Math.max(0, currentQty - Number(qty || 0));
    if (!invUpdatesByCode.has(code)) invUpdatesByCode.set(code, {});
    invUpdatesByCode.get(code)[col] = nextQty;

    salesToInsert.push({
      sold_at: soldAt,
      code_raw: String(code),
      code: String(code).trim(),
      size_raw: sizeKey,
      size_std: sizeKey,
      qty: Number(qty || 0) || 0,
      price: unitPriceCharged,
      free_gift: isFreeGift,
    });
  }

  for (const [code, updates] of invUpdatesByCode.entries()) {
    await sbUpdate(
      'inventories',
      updates,
      {
        filters: [{ column: 'code', op: 'eq', value: String(code).trim() }],
        returning: 'minimal',
      }
    );
  }
  let inserted;
  try {
    inserted = await sbInsert('sales', salesToInsert, { returning: 'representation' });
  } catch (e) {
    const msg = String(e?.message || '');
    if (msg.toLowerCase().includes('free_gift')) {
      const fallbackRows = salesToInsert.map(({ free_gift: _FREE_GIFT, ...rest }) => rest);
      inserted = await sbInsert('sales', fallbackRows, { returning: 'representation' });
    } else {
      throw e;
    }
  }
  const saleId = inserted?.[0]?.id ?? 0;
  return { saleId, soldAt, totalAmount, itemCount: totalQty };
}

export async function instantSale(payload) {
  return checkoutCart([payload]);
}

export async function getSalesList() {
  const rows = await sbSelect('sales', {
    select: 'id,sold_at,qty,price,refunded_at',
    order: { column: 'sold_at', ascending: false },
  });
  const map = new Map();
  for (const r of rows || []) {
    if (r?.refunded_at) continue;
    const key = String(r.sold_at || '');
    if (!key) continue;
    if (!map.has(key)) map.set(key, { id: r.id, soldAt: r.sold_at, totalAmount: 0, itemCount: 0 });
    const entry = map.get(key);
    entry.totalAmount += (Number(r.price ?? 0) || 0) * (Number(r.qty ?? 0) || 0);
    entry.itemCount += Number(r.qty ?? 0) || 0;
    entry.id = Math.min(entry.id ?? r.id, r.id);
  }
  return [...map.values()].sort((a, b) => toMsFromIso(b.soldAt) - toMsFromIso(a.soldAt));
}

export async function getSaleItemsBySaleId(saleId) {
  const sid = Number(saleId);
  if (!sid) return [];
  let rows;
  try {
    rows = await sbSelect('sales', {
      select: 'id,sold_at,code,size_std,qty,price,free_gift,refunded_at,refund_reason',
      filters: [{ column: 'id', op: 'eq', value: sid }],
      limit: 1,
    });
  } catch (e) {
    const msg = String(e?.message || '');
    if (msg.toLowerCase().includes('free_gift')) {
      rows = await sbSelect('sales', {
        select: 'id,sold_at,code,size_std,qty,price,refunded_at,refund_reason',
        filters: [{ column: 'id', op: 'eq', value: sid }],
        limit: 1,
      });
    } else {
      throw e;
    }
  }
  const r = rows?.[0];
  if (!r) return [];
  const item = {
    id: r.id,
    saleId: r.id,
    soldAt: r.sold_at,
    code: r.code,
    size: r.size_std ?? 'Free',
    sizeDisplay: r.size_std ?? 'Free',
    qty: Number(r.qty ?? 0) || 0,
    unitPricePhp: Number(r.price ?? 0) || 0,
    discountUnitPricePhp: undefined,
    lineTotalPhp: (Number(r.price ?? 0) || 0) * (Number(r.qty ?? 0) || 0),
    freeGift: Boolean(r.free_gift ?? false) || Number(r.price ?? 0) === 0,
  };
  const withMeta = await attachLocalProductMeta([item]);
  return withMeta;
}

export async function processRefund({ saleId, code, size, qty, reason }) {
  requireAdminOrThrow();
  const sid = Number(saleId);
  if (!sid || !code) throw new Error('INVALID_REFUND_PAYLOAD');
  const q = Number(qty || 0);
  if (q <= 0) throw new Error('INVALID_REFUND_QTY');
  const reasonStr = String(reason || '').trim();
  if (!reasonStr || reasonStr.length > 50) throw new Error('INVALID_REFUND_REASON');

  const rows = await sbSelect('sales', {
    select: 'id,code,size_std,qty,price,refunded_at',
    filters: [{ column: 'id', op: 'eq', value: sid }],
    limit: 1,
  });
  const row = rows?.[0];
  if (!row) throw new Error('SALE_ITEM_NOT_FOUND');
  if (row.refunded_at) throw new Error('ALREADY_REFUNDED');

  const soldQty = Number(row.qty ?? 0) || 0;
  if (q !== soldQty) throw new Error('PARTIAL_REFUND_NOT_SUPPORTED');

  const sizeKey = normalizeSizeKey(row.size_std ?? size);
  const col = SIZE_TO_COLUMN[sizeKey];

  const invRows = await sbSelect('inventories', {
    select: '*',
    filters: [{ column: 'code', op: 'eq', value: String(code).trim() }],
    limit: 1,
  });
  const invRow = invRows?.[0];
  const currentQty = Number(invRow?.[col] ?? 0) || 0;

  const refundedAt = new Date().toISOString();
  await sbUpdate(
    'sales',
    { refunded_at: refundedAt, refund_reason: reasonStr },
    { filters: [{ column: 'id', op: 'eq', value: sid }], returning: 'minimal' }
  );
  await sbUpdate(
    'inventories',
    { [col]: currentQty + q },
    { filters: [{ column: 'code', op: 'eq', value: String(code).trim() }], returning: 'minimal' }
  );

  const amountPhp = (Number(row.price ?? 0) || 0) * q;
  try {
    await sbInsert(
      'refunds',
      [
        {
          sale_id: sid,
          code: String(code).trim(),
          size: sizeKey,
          qty: q,
          amount_php: amountPhp,
          reason: reasonStr,
          time: refundedAt,
        },
      ],
      { returning: 'minimal' }
    );
  } catch (_err) {
    void _err;
    try {
      await sbInsert(
        'refunds',
        [
          {
            saleId: sid,
            code: String(code).trim(),
            size: sizeKey,
            qty: q,
            amountPhp,
            reason: reasonStr,
            time: refundedAt,
          },
        ],
        { returning: 'minimal' }
      );
    } catch (_err2) {
      void _err2;
    }
  }

  return { ok: true };
}

export async function setSaleFreeGift({ saleId, freeGift, code, size } = {}) {
  requireAdminOrThrow();
  const sid = Number(saleId);
  if (!sid) throw new Error('INVALID_SALE_ID');
  await sbUpdate(
    'sales',
    { free_gift: Boolean(freeGift) },
    { filters: [{ column: 'id', op: 'eq', value: sid }], returning: 'minimal' }
  );
  return { ok: true, saleId: sid, freeGift: Boolean(freeGift), code, size };
}

async function getSalesHistoryFlatFiltered({ fromDate = '', toDate = '', query = '' } = {}) {
  const hasFrom = !!fromDate;
  const hasTo = !!toDate;
  const fromMs = hasFrom ? startOfDayMs(fromDate) : -Infinity;
  const toMs = hasTo ? endOfDayMs(toDate) : Infinity;

  let sales;
  try {
    sales = await sbSelect('sales', {
      select: 'id,sold_at,code,size_std,qty,price,free_gift,refunded_at,refund_reason',
      order: { column: 'sold_at', ascending: false },
    });
  } catch (e) {
    const msg = String(e?.message || '');
    if (msg.toLowerCase().includes('free_gift')) {
      sales = await sbSelect('sales', {
        select: 'id,sold_at,code,size_std,qty,price,refunded_at,refund_reason',
        order: { column: 'sold_at', ascending: false },
      });
    } else {
      throw e;
    }
  }

  const filtered =
    hasFrom || hasTo
      ? (sales || []).filter((s) => {
          const t = toMsFromIso(s?.sold_at);
          return t >= fromMs && t <= toMs;
        })
      : sales || [];

  const normalized = (filtered || [])
    .filter((r) => !r?.refunded_at)
    .map((r) => {
      const qtyN = Number(r.qty ?? 0) || 0;
      const unit = Number(r.price ?? 0) || 0;
      const sizeKey = normalizeSizeKey(r.size_std);
      return {
        saleId: r.id,
        soldAt: r.sold_at,
        code: r.code,
        size: sizeKey,
        sizeDisplay: sizeKey,
        qty: qtyN,
        unitPricePhp: unit,
        discountUnitPricePhp: undefined,
        lineTotalPhp: unit * qtyN,
        freeGift: Boolean(r.free_gift ?? false) || unit === 0,
        nameKo: '',
      };
    })
    .filter((r) => r.qty > 0);

  const withMeta = await attachLocalProductMeta(withNormalizedNameFallback(normalized));
  const q = String(query || '').trim();
  if (!q) return withMeta;
  return withMeta.filter((r) => {
    return includesIgnoreCase(r.code, q) || includesIgnoreCase(r.nameKo, q) || includesIgnoreCase(r.sizeDisplay, q);
  });
}

function withNormalizedNameFallback(rows) {
  return rows.map((r) => ({
    ...r,
    nameKo: r.nameKo || deriveNameFromCode(r.code) || r.code,
  }));
}

export async function getSalesHistoryFilteredResult({ fromDate = '', toDate = '', query = '' } = {}) {
  const head = await sbSelect('sales', { select: 'id', limit: 1 });
  const hasAnySales = Array.isArray(head) && head.length > 0;
  const rows = await getSalesHistoryFlatFiltered({ fromDate, toDate, query });
  return { hasAnySales, rows };
}

export async function getAnalytics({ fromDate = '', toDate = '' } = {}) {
  const hasFrom = !!fromDate;
  const hasTo = !!toDate;
  const fromMs = hasFrom ? startOfDayMs(fromDate) : -Infinity;
  const toMs = hasTo ? endOfDayMs(toDate) : Infinity;

  const sales = await sbSelect('sales', {
    select: 'id,sold_at,code,size_std,qty,price,refunded_at',
    order: { column: 'sold_at', ascending: false },
  });

  const inRange =
    hasFrom || hasTo
      ? (sales || []).filter((s) => {
          const t = toMsFromIso(s?.sold_at);
          return t >= fromMs && t <= toMs;
        })
      : sales || [];

  const refundedRows = (inRange || []).filter((r) => r?.refunded_at);
  const nonRefundedRows = (inRange || []).filter((r) => !r?.refunded_at);

  const rows = await attachLocalProductMeta(
    withNormalizedNameFallback(
      nonRefundedRows.map((r) => {
        const qtyN = Number(r.qty ?? 0) || 0;
        const unit = Number(r.price ?? 0) || 0;
        const sizeKey = normalizeSizeKey(r.size_std);
        return {
          saleId: r.id,
          soldAt: r.sold_at,
          code: r.code,
          size: sizeKey,
          sizeDisplay: sizeKey,
          qty: qtyN,
          unitPricePhp: unit,
          discountUnitPricePhp: undefined,
          lineTotalPhp: unit * qtyN,
          nameKo: '',
        };
      })
    )
  );

  if (!rows.length) {
    return {
      summary: {
        grossAmount: 0,
        netAmount: 0,
        transactionCount: 0,
        aov: 0,
        discountAmount: 0,
        discountRate: 0,
        refundCount: refundedRows.length,
        refundAmount: refundedRows.reduce(
          (sum, r) => sum + (Number(r.price ?? 0) || 0) * (Number(r.qty ?? 0) || 0),
          0
        ),
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
  const soldAtKeys = [...new Set(rows.map((r) => String(r.soldAt || '')))].filter(Boolean);
  const transactionCount = soldAtKeys.length;
  const grossAmount = totalRevenue;
  const refundAmount = refundedRows.reduce(
    (sum, r) => sum + (Number(r.price ?? 0) || 0) * (Number(r.qty ?? 0) || 0),
    0
  );
  const netAmount = grossAmount - refundAmount;
  const aov = transactionCount ? grossAmount / transactionCount : 0;

  const discountAmount = 0;
  const discountRate = 0;

  function accumulate(list, keyFn, labelFn) {
    const map = new Map();
    for (const row of list) {
      const key = keyFn(row);
      if (!map.has(key)) {
        map.set(key, { key, label: labelFn(key), qty: 0, revenue: 0 });
      }
      const entry = map.get(key);
      entry.qty += Number(row.qty || 0);
      entry.revenue += Number(row.lineTotalPhp || 0);
    }
    return [...map.values()].sort((a, b) => b.revenue - a.revenue);
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

  const skuMap = new Map();
  for (const r of rows) {
    const key = String(r.code || '');
    if (!key) continue;
    const prev = skuMap.get(key) || { code: key, nameKo: r.nameKo, qty: 0, revenue: 0 };
    prev.qty += Number(r.qty || 0) || 0;
    prev.revenue += Number(r.lineTotalPhp || 0) || 0;
    if (!prev.nameKo) prev.nameKo = r.nameKo;
    skuMap.set(key, prev);
  }
  const sku = [...skuMap.values()].sort((a, b) => b.revenue - a.revenue);
  const best = sku.slice(0, 10);
  const worst = sku.slice().reverse().slice(0, 10);

  return {
    summary: {
      grossAmount,
      netAmount,
      transactionCount,
      aov,
      discountAmount,
      discountRate,
      refundCount: refundedRows.length,
      refundAmount,
    },
    best,
    worst,
    sku,
    byCategory,
    byBrand,
    byGender,
    bySize,
    byColor,
    discountShare: { discountedTransactions: 0, totalTransactions: transactionCount },
    weeklyRevenue: [],
    monthlyRevenue: [],
  };
}
