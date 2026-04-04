import codePartsSeed from '../../db/seed/seed-code-parts.json';
import { sbInsert, sbRpc, sbSelect, sbUpdate } from '../../db/supabaseRest';
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

function nowLocalIsoLikeUtc() {
  const d = new Date();
  const yyyy = String(d.getFullYear());
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  const ms = String(d.getMilliseconds()).padStart(3, '0');
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}.${ms}Z`;
}

function toMsFromIso(iso) {
  const s = String(iso || '').trim();
  if (!s) return 0;

  let t = Date.parse(s);
  if (Number.isFinite(t)) return t;

  const dateHit = s.match(/(\d{4}-\d{2}-\d{2})/);
  if (dateHit) {
    const date = dateHit[1];
    const timeHit = s.match(/(\d{2}):(\d{2})(?::(\d{2}))?/);
    if (timeHit) {
      const hh = timeHit[1];
      const mm = timeHit[2];
      const ss = timeHit[3] || '00';
      t = new Date(`${date}T${hh}:${mm}:${ss}`).getTime();
      if (Number.isFinite(t)) return t;
      t = Date.parse(`${date}T${hh}:${mm}:${ss}Z`);
      if (Number.isFinite(t)) return t;
    }
    t = new Date(`${date}T00:00:00`).getTime();
    if (Number.isFinite(t)) return t;
    t = Date.parse(`${date}T00:00:00Z`);
    if (Number.isFinite(t)) return t;
  }

  t = Date.parse(s.replace(' ', 'T'));
  return Number.isFinite(t) ? t : 0;
}

function includesIgnoreCase(hay, needle) {
  return String(hay || '')
    .toLowerCase()
    .includes(String(needle || '').toLowerCase());
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

async function sbSelectAll(table, { select = '*', filters = [], order } = {}) {
  const batchSize = 1000;
  const maxBatches = 1000;
  const out = [];

  for (let batch = 0; batch < maxBatches; batch += 1) {
    const page = await sbSelect(table, {
      select,
      filters,
      order,
      limit: batchSize,
      offset: batch * batchSize,
    });

    if (!Array.isArray(page) || page.length === 0) break;
    out.push(...page);
    if (page.length < batchSize) break;
  }

  return out;
}

async function attachLocalProductMeta(items) {
  const productCodes = [...new Set(items.map((i) => i.code))].filter(Boolean);
  if (!productCodes.length) return items;

  const products = [];
  const chunkSize = 200;
  for (let i = 0; i < productCodes.length; i += chunkSize) {
    const chunk = productCodes.slice(i, i + chunkSize);
    const inList = buildInList(chunk);
    if (inList === '()') continue;
    const page = await sbSelect('products', {
      select: 'code,name,sale_price,free_gift,no,kprice,p1price',
      filters: [{ column: 'code', op: 'in', value: inList }],
    });
    if (Array.isArray(page) && page.length) products.push(...page);
  }

  const productMap = new Map(
    (products || []).map((p) => [
      p.code,
      {
        code: p.code,
        no: Number(p.no ?? 0) || 0,
        nameKo: String(p.name || '').trim(),
        salePricePhp: Number(p.sale_price ?? 0) || 0,
        kprice: Number(p.kprice ?? 0) || 0,
        p1price: Number(p.p1price ?? 0) || 0,
        freeGift: Boolean(p.free_gift ?? false),
      },
    ])
  );

  return items.map((i) => {
    const product = productMap.get(i.code);
    const qtyN = Number(i.qty || 0) || 0;
    const listUnit = Number((i.listPricePhp ?? product?.salePricePhp ?? i.unitPricePhp) || 0) || 0;
    const isFreeGift = Boolean(i.freeGift ?? false) || i.unitPricePhp === 0;
    const commission = i.guideId && !isFreeGift ? listUnit * qtyN * 0.1 : 0;
    const unitForTotal = Number(i.discountUnitPricePhp ?? i.unitPricePhp ?? 0) || 0;
    return {
      ...i,
      productNo: product?.no ?? i.productNo ?? 0,
      kprice: product?.kprice ?? i.kprice ?? 0,
      p1price: product?.p1price ?? i.p1price ?? 0,
      nameKo:
        (product?.nameKo && String(product.nameKo).trim()) || deriveNameFromCode(i.code) || i.code,
      sizeDisplay: i.sizeDisplay ?? i.size,
      commission,
      listPrice: listUnit,
      lineTotalPhp: unitForTotal * qtyN,
    };
  });
}

export async function checkoutCart(payload) {
  let cartItems = payload;
  let guideId = null;
  let isMrMoon = false;
  let isPeter = false;

  if (!Array.isArray(payload) && payload?.items) {
    cartItems = payload.items;
    guideId = payload.guideId;
    isMrMoon = payload.isMrMoon;
    isPeter = Boolean(payload.isPeter);
  }

  if (guideId) {
    try {
      const gids = await sbSelect('guides', {
        select: 'id,name',
        filters: [{ column: 'id', op: 'eq', value: guideId }],
        limit: 1,
      });
      const g = Array.isArray(gids) && gids.length ? gids[0] : null;
      const norm = String(g?.name || '')
        .toLowerCase()
        .replace(/[\s.]/g, '');
      if (norm.includes('mrmoon')) isMrMoon = true;
      if (norm.includes('peter')) isPeter = true;
    } catch {
      // ignore
    }
  }

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
          select: 'code,name,sale_price,free_gift,no,kprice',
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
    const { code } = item;
    if (!code) throw new Error('Missing product code.');
    invByCode.get(String(code).trim());
    // We no longer manually check stock here because:
    // 1. The user believes the client check is seeing stale/incorrect data ("phantom deduction").
    // 2. The database trigger `trg_sales_apply_stock_on_insert` handles inventory deduction.
    // 3. If the DB enforces non-negative stock, the insert will fail, which is safer than a potentially buggy client check.
    // if (!invRow) throw new Error(`No inventory info: ${code}`);
    // if (currentQty < qty) {
    //   throw new Error(
    //     `Insufficient stock: ${code} / ${sizeKey} (Req ${qty}, Stock ${currentQty})`
    //   );
    // }
  }

  let totalAmount = 0;
  let totalQty = 0;
  const soldAt = nowLocalIsoLikeUtc();
  const salesToInsert = [];

  // 1. Create a sale group for this transaction
  const saleGroupId = crypto.randomUUID();
  const guideRate = guideId ? (isPeter || isMrMoon ? 0 : 0.1) : 0; // Mr.Moon/Peter have 0% commission

  // Create the group first (parent record)
  // We initialize totals to 0; finalize_sale_group will calculate them
  await sbInsert(
    'sale_groups',
    [
      {
        id: saleGroupId,
        guide_id: guideId || null,
        guide_rate: guideRate,
        sold_at: soldAt,
        subtotal: 0,
        total: 0,
        guide_commission: 0,
      },
    ],
    { returning: 'minimal' }
  );

  for (const item of items) {
    const { code, size, qty } = item;
    if (!code) throw new Error('Missing product code.');
    const product = productMap.get(code);
    if (!product) throw new Error(`No product: ${code}`);

    const unitPriceOriginal =
      Number(item.originalUnitPricePhp ?? item.unitPricePhp ?? product.salePrice ?? 0) || 0;

    // Apply Mr. Moon/Peter discount logic (Ceiling to nearest 100) if applicable
    let calculatedPrice = unitPriceOriginal;
    if (isPeter && unitPriceOriginal > 1000) {
      calculatedPrice = Math.ceil((unitPriceOriginal * 0.8) / 100) * 100;
    } else
    if (isMrMoon && unitPriceOriginal > 1000) {
      calculatedPrice = Math.ceil((unitPriceOriginal * 0.9) / 100) * 100;
    }

    const unitPriceChargedCandidate = Number(item.unitPricePhp ?? calculatedPrice);
    // If item.unitPricePhp matches original, we use calculatedPrice.
    // If it was manually overridden (different from original), we might want to keep it?
    // Assuming standard flow: item.unitPricePhp is original.
    // If we want to FORCE the calculated price:

    const isExplicitlyFree = item.unitPricePhp === 0 || Boolean(product.freeGift);

    const unitPriceCharged = isExplicitlyFree
      ? 0
      : (isPeter || isMrMoon)
        ? calculatedPrice
        : Number.isFinite(unitPriceChargedCandidate)
          ? unitPriceChargedCandidate
          : unitPriceOriginal;

    const lineTotal = unitPriceCharged * qty;
    const isFreeGift = unitPriceCharged === 0;

    totalAmount += lineTotal;
    // const ellaRevenue = 0; // Unused
    totalQty += qty;

    const sizeKey = normalizeSizeKey(size ?? item.sizeDisplay);
    const colorFromItem = String(item.color || '').trim();
    const colorFromCode = findLabel('color', String(code || '').split('-')[3] || '');
    const colorLabel = colorFromItem || colorFromCode;
    const sizeRaw = String(item.sizeDisplay ?? item.size ?? '').trim() || sizeKey;

    salesToInsert.push({
      sold_at: soldAt,
      code: String(code).trim(),
      size_raw: sizeRaw,
      size_std: sizeKey,
      color: colorLabel,
      qty: Number(qty || 0) || 0,
      list_price: unitPriceOriginal,
      price: unitPriceCharged,
      free_gift: isFreeGift,
      // guide_id removed as it's now in sale_groups
      sale_group_id: saleGroupId, // Link to the group
    });
  }

  // Inventory updates are handled by DB trigger `trg_sales_apply_stock_on_insert`
  // We just insert the sales rows.

  let inserted;
  const removed = new Set();
  let rowsToInsert = salesToInsert;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      inserted = await sbInsert('sales', rowsToInsert, { returning: 'representation' });
      break;
    } catch (e) {
      const msg = String(e?.message || '').toLowerCase();
      const before = removed.size;
      if (msg.includes('free_gift')) removed.add('free_gift');
      if (msg.includes('color')) removed.add('color');
      if (msg.includes('list_price')) removed.add('list_price');
      if (removed.size === before) throw e;
      rowsToInsert = salesToInsert.map((row) => {
        const next = { ...row };
        for (const k of removed) delete next[k];
        return next;
      });
    }
  }
  if (!inserted) throw new Error('Failed to insert sales rows.');
  const saleId = inserted?.[0]?.id ?? 0;

  // Finalize the group (calculate totals and commissions via DB function)
  try {
    await sbRpc('finalize_sale_group', { p_group_id: saleGroupId });
  } catch (e) {
    console.error('Failed to finalize sale group:', e);
    // Non-fatal, but admin should check.
  }

  return { saleId, soldAt, totalAmount, itemCount: totalQty };
}

export async function instantSale(payload) {
  return checkoutCart([payload]);
}

export async function getSalesList() {
  const rows = await sbSelect('sales', {
    select: 'id,sold_at,qty,price,refunded_at,sale_group_id',
    order: { column: 'sold_at', ascending: false },
  });

  // Manual join to get guide_id from sale_groups
  const groupIds = [...new Set((rows || []).map((r) => r.sale_group_id).filter(Boolean))];
  const groupMap = new Map();
  if (groupIds.length > 0) {
    // We fetch all relevant sale_groups. Since getSalesList defaults to 1000 rows,
    // we can use IN clause if list is small, or just fetch needed ones.
    // For simplicity and safety with URL length, we'll fetch in chunks or just fetch matching by ID if possible.
    // Given the constraints and typical page size, we'll try fetching with IN clause for now,
    // but if it's too large, we might need another strategy.
    // However, for "Sales History" page which uses getSalesHistoryFilteredResult, we handle it there separately.
    // This function is likely for "Recent Sales" or similar.

    // To be safe against URL length limits with many IDs, we will just fetch the sale_groups
    // that match the time range of the fetched sales?
    // Or just use the IDs if < 100.
    // Let's implement a safe chunked fetch or just fetch all if needed?
    // For now, let's assume specific IDs are needed.

    // Actually, simpler: just fetch the sale_groups for these IDs.
    // If there are many, we might split. But let's try the simple approach first.
    const inList = buildInList(groupIds);
    if (inList !== '()') {
      const groups = await sbSelectAll('sale_groups', {
        select: 'id,guide_id',
        filters: [{ column: 'id', op: 'in', value: inList }],
      });
      groups.forEach((g) => groupMap.set(g.id, g.guide_id));
    }
  }

  const map = new Map();
  for (const r of rows || []) {
    if (toMsFromIso(r?.refunded_at)) continue;
    const key = String(r.sale_group_id || r.sold_at || '');
    if (!key) continue;
    if (!map.has(key)) {
      map.set(key, {
        id: r.id,
        soldAt: r.sold_at,
        totalAmount: 0,
        itemCount: 0,
        guideId: groupMap.get(r.sale_group_id) || null,
        saleGroupId: r.sale_group_id,
      });
    }
    const entry = map.get(key);
    entry.totalAmount += (Number(r.price ?? 0) || 0) * (Number(r.qty ?? 0) || 0);
    entry.itemCount += Number(r.qty ?? 0) || 0;
    entry.id = Math.min(entry.id ?? r.id, r.id);
    // Prefer non-null guideId if mixed (shouldn't be mixed in same batch usually)
    const gid = groupMap.get(r.sale_group_id);
    if (gid) entry.guideId = gid;
  }
  return [...map.values()].sort((a, b) => toMsFromIso(b.soldAt) - toMsFromIso(a.soldAt));
}

export async function getSaleItemsBySaleId(saleId) {
  const sid = Number(saleId);
  if (!sid) return [];
  let rows;
  try {
    rows = await sbSelect('sales', {
      select: 'id,sold_at,code,color,size_std,qty,price,free_gift,refunded_at,refund_reason',
      filters: [{ column: 'id', op: 'eq', value: sid }],
      limit: 1,
    });
  } catch (e) {
    const msg = String(e?.message || '').toLowerCase();
    if (msg.includes('free_gift') || msg.includes('color')) {
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
    color:
      String(r.color || '').trim() || findLabel('color', String(r.code || '').split('-')[3] || ''),
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

export async function processRefund({ saleId, reason, qty: _qty, code: _code, size: _size } = {}) {
  requireAdminOrThrow();
  const sid = Number(saleId);
  if (!sid) throw new Error('INVALID_SALE_ID');

  const reasonStr = String(reason || '').trim();
  if (!reasonStr) throw new Error('INVALID_REFUND_REASON');
  const refundedAt = nowLocalIsoLikeUtc();

  const saleRows = await sbSelect('sales', {
    select: 'id,code,size_std,qty,refunded_at',
    filters: [{ column: 'id', op: 'eq', value: sid }],
    limit: 1,
  });
  const sale = saleRows?.[0];
  if (!sale) throw new Error('SALE_NOT_FOUND');
  if (sale.refunded_at) throw new Error('SALE_ALREADY_REFUNDED');

  const code = String(_code || sale.code || '').trim();
  const qty = Number(sale.qty ?? _qty ?? 0) || 0;
  if (!code || qty <= 0) throw new Error('INVALID_REFUND_PAYLOAD');

  const sizeKey = normalizeSizeKey(sale.size_std);
  const col = SIZE_TO_COLUMN[sizeKey];
  if (!col) throw new Error('UNSUPPORTED_SIZE_STD');

  const invRows = await sbSelect('inventories', {
    select: `code,${col}`,
    filters: [{ column: 'code', op: 'eq', value: code }],
    limit: 1,
  });
  const inv = invRows?.[0];
  if (!inv) throw new Error('INVENTORY_NOT_FOUND');

  const currentStock = Number(inv[col] ?? 0) || 0;
  const newStock = currentStock + qty;

  await sbUpdate(
    'inventories',
    { [col]: newStock },
    { filters: [{ column: 'code', op: 'eq', value: code }], returning: 'minimal' }
  );

  await sbInsert('refunds', [{ sale_id: sid, refunded_at: refundedAt, reason: reasonStr }], {
    returning: 'minimal',
  });

  await sbUpdate(
    'sales',
    { refunded_at: refundedAt, refund_reason: reasonStr },
    { filters: [{ column: 'id', op: 'eq', value: sid }], returning: 'minimal' }
  );

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

export async function setSaleGroupGuide({ saleGroupId, guideId, guideRate = 0.1 } = {}) {
  requireAdminOrThrow();
  const gid = String(saleGroupId || '').trim();
  if (!gid) throw new Error('INVALID_SALE_GROUP_ID');
  const guide = guideId ? Number(guideId) : null;

  let guideNameNorm = '';
  if (guide) {
    try {
      const rows = await sbSelect('guides', {
        select: 'id,name',
        filters: [{ column: 'id', op: 'eq', value: guide }],
        limit: 1,
      });
      const g = Array.isArray(rows) && rows.length ? rows[0] : null;
      guideNameNorm = String(g?.name || '')
        .toLowerCase()
        .replace(/[\s.]/g, '');
    } catch {
      guideNameNorm = '';
    }
  }

  const isPeter = guideNameNorm.includes('peter');
  const isMrMoon = guideNameNorm.includes('mrmoon');
  const finalGuideRate = guide ? (isPeter || isMrMoon ? 0 : Number(guideRate || 0.1)) : 0;
  await sbUpdate(
    'sale_groups',
    { guide_id: guide, guide_rate: finalGuideRate },
    { filters: [{ column: 'id', op: 'eq', value: gid }], returning: 'minimal' }
  );

  try {
    const sales = await sbSelect('sales', {
      select: 'id,price,list_price,free_gift',
      filters: [{ column: 'sale_group_id', op: 'eq', value: gid }],
      order: { column: 'id', ascending: true },
      limit: 1000,
    });

    for (const s of sales || []) {
      const sid = Number(s?.id || 0);
      if (!sid) continue;
      const isFreeGift = Boolean(s?.free_gift);
      const storedList = Number(s?.list_price ?? 0) || 0;
      const currentPrice = Number(s?.price ?? 0) || 0;
      const base = storedList > 0 ? storedList : currentPrice;

      let nextList = storedList;
      if (!nextList && base > 0) nextList = base;

      let nextPrice = base;
      if (!isFreeGift && base > 0) {
        if (isPeter) {
          if (base > 1000) nextPrice = Math.ceil((base * 0.8) / 100) * 100;
        } else if (isMrMoon && base > 1000) {
          nextPrice = Math.ceil((base * 0.9) / 100) * 100;
        }
      }

      const patch = {};
      if (nextList > 0 && storedList !== nextList) patch.list_price = nextList;
      if (currentPrice !== nextPrice) patch.price = nextPrice;
      if (Object.keys(patch).length === 0) continue;

      await sbUpdate('sales', patch, {
        filters: [{ column: 'id', op: 'eq', value: sid }],
        returning: 'minimal',
      });
    }
  } catch {
    // ignore
  }

  try {
    await sbRpc('finalize_sale_group', { p_group_id: gid });
  } catch {
    // ignore
  }
  return { ok: true };
}

export async function setSaleTime({ saleGroupId, saleId, soldAt } = {}) {
  const iso = String(soldAt || '').trim();
  if (!iso) throw new Error('INVALID_SOLD_AT');

  const filters = [];
  const gid = String(saleGroupId || '').trim();
  const sid = Number(saleId || 0);

  if (gid) {
    filters.push({ column: 'sale_group_id', op: 'eq', value: gid });
  } else if (sid) {
    filters.push({ column: 'id', op: 'eq', value: sid });
  } else {
    throw new Error('INVALID_SALE_KEY');
  }

  await sbUpdate('sales', { sold_at: iso }, { filters, returning: 'minimal' });

  if (gid) {
    try {
      await sbUpdate(
        'sale_groups',
        { sold_at: iso },
        { filters: [{ column: 'id', op: 'eq', value: gid }], returning: 'minimal' }
      );
    } catch (e) {
      void e;
    }
  }

  return { ok: true };
}

export async function updateSaleItemColor({ saleId, color } = {}) {
  const sid = Number(saleId || 0);
  const colorVal = String(color || '').trim();
  if (!sid) throw new Error('INVALID_ITEM_ID');

  await sbUpdate(
    'sales',
    { color: colorVal },
    { filters: [{ column: 'id', op: 'eq', value: sid }], returning: 'minimal' }
  );
  return { ok: true };
}

export async function updateSalePrice({ saleGroupId, saleId, price } = {}) {
  const p = Number(price);
  if (!Number.isFinite(p) || p < 0) throw new Error('INVALID_PRICE');

  const filters = [];
  const gid = String(saleGroupId || '').trim();
  const sid = Number(saleId || 0);

  if (gid) {
    filters.push({ column: 'sale_group_id', op: 'eq', value: gid });
  } else if (sid) {
    filters.push({ column: 'id', op: 'eq', value: sid });
  } else {
    throw new Error('INVALID_SALE_KEY');
  }

  // Update price (unit price)
  // We remove unit_price_php and discount_unit_price_php as they seem to cause schema errors
  // and are not used in the main checkoutCart flow (which uses 'price').
  await sbUpdate('sales', { price: p }, { filters, returning: 'minimal' });

  try {
    let groupId = gid;
    if (!groupId && sid) {
      const rows = await sbSelect('sales', {
        select: 'sale_group_id',
        filters: [{ column: 'id', op: 'eq', value: sid }],
        limit: 1,
      });
      groupId = String(rows?.[0]?.sale_group_id || '').trim();
    }
    if (groupId) {
      await sbRpc('finalize_sale_group', { p_group_id: groupId });
    }
  } catch {
    // ignore
  }

  return { ok: true };
}

async function getSalesHistoryFlatFiltered({ fromDate = '', toDate = '', query = '' } = {}) {
  const hasFrom = !!fromDate;
  const hasTo = !!toDate;
  const fromKey = String(fromDate || '').trim();
  const toKey = String(toDate || '').trim();

  let sales;
  try {
    sales = await sbSelectAll('sales', {
      select:
        'id,sold_at,code,color,size_std,qty,list_price,price,free_gift,refunded_at,refund_reason,sale_group_id',
      order: { column: 'sold_at', ascending: false },
    });
  } catch (e) {
    const msg = String(e?.message || '').toLowerCase();
    if (msg.includes('free_gift') || msg.includes('color') || msg.includes('list_price')) {
      sales = await sbSelectAll('sales', {
        select: 'id,sold_at,code,size_std,qty,price,refunded_at,refund_reason,sale_group_id',
        order: { column: 'sold_at', ascending: false },
      });
    } else {
      throw e;
    }
  }

  const filtered =
    hasFrom || hasTo
      ? (sales || []).filter((s) => {
          const key = String(s?.sold_at || '').slice(0, 10);
          if (!key) return false;
          if (hasFrom && key < fromKey) return false;
          if (hasTo && key > toKey) return false;
          return true;
        })
      : sales || [];

  // Manual join for sale_groups
  const groupIds = [...new Set(filtered.map((r) => r.sale_group_id).filter(Boolean))];
  const groupMap = new Map();
  if (groupIds.length > 0) {
    // If we have many groups, fetching by ID list might be too long for URL.
    // If we have filtered by date, we can fetch sale_groups by the same date range?
    // sale_groups has sold_at.
    // However, here we just use sbSelectAll with IN list if reasonable size, or ALL if huge?
    // Let's use IN list. If it fails, we catch and fetch all?
    // Or just fetch all if count > 500?
    // If we fetch all sale_groups (id, guide_id), it might be heavy but safe.
    // Given current usage, let's try fetching with IN list first.

    // Note: buildInList handles quotes.
    const inList = buildInList(groupIds);
    if (inList !== '()') {
      try {
        const groups = await sbSelectAll('sale_groups', {
          select: 'id,guide_id',
          filters: [{ column: 'id', op: 'in', value: inList }],
        });
        groups.forEach((g) => groupMap.set(g.id, g.guide_id));
      } catch {
        // If IN list is too long, fallback to fetching all sale_groups (lightweight select)
        // filtering by date if possible would be better, but we lack easy access to date range here if we used 'all'.
        // If hasFrom/hasTo, we can filter sale_groups by date.
        if (hasFrom || hasTo) {
          const filters = [];
          // rough filter: string comparison on sold_at
          if (hasFrom) filters.push({ column: 'sold_at', op: 'gte', value: fromKey });
          // Note: fromKey is YYYY-MM-DD, sold_at is ISO. This string compare works for >=.
          if (hasTo) filters.push({ column: 'sold_at', op: 'lte', value: toKey + 'T23:59:59' });

          const groups = await sbSelectAll('sale_groups', {
            select: 'id,guide_id',
            filters,
          });
          groups.forEach((g) => groupMap.set(g.id, g.guide_id));
        } else {
          // Fallback: fetch all.
          const groups = await sbSelectAll('sale_groups', { select: 'id,guide_id' });
          groups.forEach((g) => groupMap.set(g.id, g.guide_id));
        }
      }
    }
  }

  // Fetch guide names for mapping (to exclude Mr.Moon from commission)
  let guideNameMap = new Map();
  const allGuideIds = [...new Set([...groupMap.values()].filter(Boolean))];
  if (allGuideIds.length > 0) {
    try {
      // Fetch all guides to map ID -> Name
      const allGuides = await sbSelect('guides', { select: 'id,name' });
      guideNameMap = new Map((allGuides || []).map((g) => [String(g.id), g.name]));
    } catch (e) {
      console.error('Failed to fetch guides for history:', e);
    }
  }

  const normalized = (filtered || [])
    .map((r) => {
      const qtyN = Number(r.qty ?? 0) || 0;
      const unit = Number(r.price ?? 0) || 0;
      const listUnit = Number(r.list_price ?? 0) || 0;
      const sizeKey = normalizeSizeKey(r.size_std);
      const refundedAt = r?.refunded_at || null;
      const isRefunded = Boolean(toMsFromIso(refundedAt));
      const guideId = groupMap.get(r.sale_group_id) || null;
      const guideName = guideId ? String(guideNameMap.get(String(guideId)) || '').trim() : '';
      const nameLower = guideName.toLowerCase().replace(/[\s.]/g, '');
      const isMrMoon = nameLower.includes('mrmoon');
      const isElla = nameLower.includes('ella');
      const isPeter = nameLower.includes('peter');
      const isFreeGift = Boolean(r.free_gift ?? false) || unit === 0;
      const finalUnit = isRefunded || isFreeGift ? 0 : unit;

      return {
        saleId: r.id,
        soldAt: r.sold_at,
        code: r.code,
        color:
          String(r.color || '').trim() ||
          findLabel('color', String(r.code || '').split('-')[3] || ''),
        size: sizeKey,
        sizeDisplay: sizeKey,
        qty: qtyN,
        listPricePhp: listUnit || undefined,
        unitPricePhp: isRefunded || isFreeGift ? 0 : listUnit || unit,
        discountUnitPricePhp:
          !isRefunded && !isFreeGift && listUnit > 0 && unit > 0 && unit !== listUnit ? unit : undefined,
        lineTotalPhp: finalUnit * qtyN,
        freeGift: isFreeGift,
        refundedAt,
        refundReason: String(r.refund_reason || '').trim(),
        isRefunded,
        nameKo: '',
        guideId: guideId,
        saleGroupId: r.sale_group_id,
        isMrMoon,
        isElla,
        isPeter,
        // If Mr. Moon or Peter, commission is 0. Otherwise 10%.
        // FIX: Explicitly exclude free gifts from commission display for all guides
        commission:
          guideId && !isMrMoon && !isElla && !isPeter && !isFreeGift
            ? finalUnit * qtyN * 0.1
            : 0,
      };
    })
    .filter((r) => r.qty > 0);

  try {
    const toFix = normalized
      .filter((n) => n.isPeter && !n.isRefunded)
      .filter((n) => {
        const listUnit = Number(n.listPricePhp || 0) || 0;
        const unit = Number(n.discountUnitPricePhp != null ? n.discountUnitPricePhp : n.unitPricePhp || 0) || 0;
        return listUnit > 1000 && unit === listUnit;
      });
    for (const n of toFix) {
      const base = Number(n.listPricePhp || 0) || 0;
      const next = Math.ceil((base * 0.8) / 100) * 100;
      if (next && next !== base) {
        await sbUpdate(
          'sales',
          { price: next, list_price: base },
          { filters: [{ column: 'id', op: 'eq', value: n.saleId }], returning: 'minimal' }
        );
        n.discountUnitPricePhp = next;
      }
    }
  } catch (e) {
    console.warn('Auto-enforce Peter discount failed:', e?.message || e);
  }

  const withMetaRaw = await attachLocalProductMeta(withNormalizedNameFallback(normalized));
  const withMeta = withMetaRaw.map((r) => ({
    ...r,
    commission: r.isMrMoon || r.isPeter || r.isElla ? 0 : r.commission,
  }));
  const q = String(query || '').trim();
  if (!q) return withMeta;
  return withMeta.filter((r) => {
    return (
      includesIgnoreCase(r.code, q) ||
      includesIgnoreCase(r.nameKo, q) ||
      includesIgnoreCase(r.sizeDisplay, q) ||
      includesIgnoreCase(r.color, q)
    );
  });
}

function withNormalizedNameFallback(rows) {
  return rows.map((r) => ({
    ...r,
    nameKo: r.nameKo || deriveNameFromCode(r.code) || r.code,
  }));
}

export async function getSalesHistoryFilteredResult({
  fromDate = '',
  toDate = '',
  query = '',
} = {}) {
  const head = await sbSelect('sales', { select: 'id', limit: 1 });
  const hasAnySales = Array.isArray(head) && head.length > 0;
  const rows = await getSalesHistoryFlatFiltered({ fromDate, toDate, query });
  return { hasAnySales, rows };
}

export async function getAnalytics({ fromDate = '', toDate = '', onProgress, onSummary, mode = 'full' } = {}) {
  const report =
    typeof onProgress === 'function'
      ? (pct, label) => onProgress({ pct, label })
      : () => {};
  const hasFrom = !!fromDate;
  const hasTo = !!toDate;
  const fromKey = String(fromDate || '').trim();
  const toKey = String(toDate || '').trim();

  let sales;
  try {
    const filters = [];
    if (hasFrom) filters.push({ column: 'sold_at', op: 'gte', value: fromKey });
    if (hasTo) filters.push({ column: 'sold_at', op: 'lte', value: `${toKey}T23:59:59.999Z` });
    report(10, '판매 데이터 조회 중…');
    sales = await sbSelectAll('sales', {
      select: 'id,sold_at,code,color,size_std,qty,list_price,price,refunded_at,sale_group_id',
      filters,
      order: { column: 'sold_at', ascending: false },
    });
  } catch (e) {
    const msg = String(e?.message || '').toLowerCase();
    if (msg.includes('color')) {
      const filters = [];
      if (hasFrom) filters.push({ column: 'sold_at', op: 'gte', value: fromKey });
      if (hasTo) filters.push({ column: 'sold_at', op: 'lte', value: `${toKey}T23:59:59.999Z` });
      report(10, '판매 데이터 조회 중…');
      sales = await sbSelectAll('sales', {
        select: 'id,sold_at,code,size_std,qty,price,refunded_at,sale_group_id',
        filters,
        order: { column: 'sold_at', ascending: false },
      });
    } else {
      throw e;
    }
  }

  const inRange = sales || [];

  // Manual join for sale_groups
  report(25, '영수증/가이드 매핑 중…');
  const groupIds = [...new Set(inRange.map((r) => r.sale_group_id).filter(Boolean))];
  const groupMap = new Map();
  if (groupIds.length > 0) {
    const chunkSize = 200;
    const groups = [];
    for (let i = 0; i < groupIds.length; i += chunkSize) {
      const chunk = groupIds.slice(i, i + chunkSize);
      const inList = buildInList(chunk);
      if (inList === '()') continue;
      const page = await sbSelect('sale_groups', {
        select: 'id,guide_id,guide_commission',
        filters: [{ column: 'id', op: 'in', value: inList }],
      });
      if (Array.isArray(page) && page.length) groups.push(...page);
    }
    groups.forEach((g) =>
      groupMap.set(String(g.id), {
        guideId: g.guide_id ?? null,
        guideCommission: Number(g.guide_commission ?? 0) || 0,
      })
    );
  }

  const refundedRows = (inRange || []).filter((r) => toMsFromIso(r?.refunded_at));
  const nonRefundedRows = (inRange || []).filter((r) => !toMsFromIso(r?.refunded_at));

  report(45, '상품 메타 결합 중…');
  const analyzedRows = await attachLocalProductMeta(
    withNormalizedNameFallback(
      nonRefundedRows.map((r) => {
        const qtyN = Number(r.qty ?? 0) || 0;
        const unit = Number(r.price ?? 0) || 0;
        const listUnit = Number(r.list_price ?? 0) || 0;
        const sizeKey = normalizeSizeKey(r.size_std);
        const g = groupMap.get(String(r.sale_group_id));
        const guideId = g?.guideId ?? null;
        return {
          saleId: r.id,
          soldAt: r.sold_at,
          code: r.code,
          color: String(r.color || '').trim(),
          size: sizeKey,
          sizeDisplay: sizeKey,
          qty: qtyN,
          unitPricePhp: unit,
          listPricePhp: listUnit || undefined,
          discountUnitPricePhp: undefined,
          lineTotalPhp: unit * qtyN,
          freeGift: Boolean(r.free_gift ?? false) || unit === 0,
          nameKo: '',
          guideId: guideId,
          saleGroupId: r.sale_group_id,
          commission: guideId ? unit * qtyN * 0.1 : 0,
        };
      })
    )
  );

  if (!analyzedRows.length) {
    report(100, '완료');
    return {
      __partial: false,
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
        refundCount: refundedRows.length,
        refundAmount: refundedRows.reduce(
          (sum, r) => sum + (Number(r.price ?? 0) || 0) * (Number(r.qty ?? 0) || 0),
          0
        ),
        totalCommission: 0,
      },
      best: [],
      worst: [],
      sku: [],
      byCategory: [],
      byBrand: [],
      byGender: [],
      bySize: [],
      byColor: [],
      byGuide: [],
      bestByCategory: [],
      bestColorByCategory: [],
      discountShare: { discountedTransactions: 0, totalTransactions: 0 },
      weeklyRevenue: [],
      monthlyRevenue: [],
    };
  }

  // Fetch guide names for mapping
  report(60, '가이드 이름 매핑 중…');
  let guideMap = new Map();
  const guideIds = [...new Set(analyzedRows.map((r) => r.guideId).filter(Boolean))];
  if (guideIds.length > 0) {
    try {
      const allGuides = await sbSelect('guides', { select: 'id,name' });
      guideMap = new Map((allGuides || []).map((g) => [String(g.id), g.name]));
    } catch (e) {
      console.error(e);
    }
  }

  // Annotate rows and EXCLUDE Ella from all profit/revenue metrics
  const withGuideFlags = analyzedRows.map((r) => {
    const raw = r.guideId ? String(guideMap.get(String(r.guideId)) || '') : '';
    const norm = raw.toLowerCase().replace(/[\s.]/g, '');
    const isMrMoon = norm.includes('mrmoon');
    const isElla = norm.includes('ella');
    const isPeter = norm.includes('peter');
    return { ...r, isMrMoon, isElla, isPeter };
  });
  let rows = withGuideFlags.filter((r) => !r.isElla);

  const groupSubtotalMap = new Map();
  const groupCommissionMap = new Map();
  for (const r of rows) {
    const gid = String(r.saleGroupId || '').trim();
    if (!gid) continue;
    if (r.freeGift) continue;
    const prev = groupSubtotalMap.get(gid) || 0;
    groupSubtotalMap.set(gid, prev + (Number(r.lineTotalPhp || 0) || 0));
  }
  for (const [gid, subtotal] of groupSubtotalMap.entries()) {
    const info = groupMap.get(gid);
    const guideId = info?.guideId ?? null;
    const rawName = guideId ? String(guideMap.get(String(guideId)) || '') : '';
    const norm = rawName.toLowerCase().replace(/[\s.]/g, '');
    const isMrMoon = norm.includes('mrmoon');
    const isPeter = norm.includes('peter');
    const isElla = norm.includes('ella');
    if (!guideId || isMrMoon || isPeter || isElla) {
      groupCommissionMap.set(gid, 0);
      continue;
    }
    const stored = Number(info?.guideCommission ?? 0) || 0;
    const fallback = subtotal * 0.1;
    groupCommissionMap.set(gid, stored > 0 ? stored : fallback);
  }
  const rowsWithCommission = rows.map((r) => {
    const gid = String(r.saleGroupId || '').trim();
    if (!gid || r.freeGift) return { ...r, commission: 0 };
    const subtotal = Number(groupSubtotalMap.get(gid) || 0) || 0;
    const gcomm = Number(groupCommissionMap.get(gid) || 0) || 0;
    if (!subtotal || !gcomm) return { ...r, commission: 0 };
    const share = (Number(r.lineTotalPhp || 0) || 0) / subtotal;
    return { ...r, commission: gcomm * share };
  });
  rows = rowsWithCommission;

  const totalRevenue = rows.reduce((sum, r) => sum + (Number(r.lineTotalPhp || 0) || 0), 0);
  const totalCommission = [...new Set(rows.map((r) => String(r.saleGroupId || '').trim()))]
    .filter(Boolean)
    .reduce((sum, gid) => sum + (Number(groupCommissionMap.get(gid) || 0) || 0), 0);
  let mrMoonCommission = 0;
  let mrMoonRevenue = 0;
  let mrMoonListRevenue = 0;
  let ellaCommission = 0;
  // let ellaRevenue = 0;
  try {
    rows.forEach((r) => {
      if (r.isMrMoon) {
        mrMoonCommission += Number(r.commission || 0) || 0;
        mrMoonRevenue += Number(r.lineTotalPhp || 0) || 0;
        mrMoonListRevenue += (Number(r.listPrice || 0) || 0) * (Number(r.qty || 0) || 0);
      }
      // rows excludes Ella entries by design
    });
  } catch {
    mrMoonCommission = 0;
    mrMoonRevenue = 0;
    mrMoonListRevenue = 0;
    ellaCommission = 0;
    // ellaRevenue = 0;
  }

  // Use saleGroupId for transaction counting if available, otherwise fallback to soldAt
  const transactionKeys = new Set(rows.map((r) => r.saleGroupId || String(r.soldAt || '')));
  const transactionCount = transactionKeys.size;

  const refundedNonElla = refundedRows.filter((r) => {
    const gid = String(r.sale_group_id || '').trim();
    const info = gid ? groupMap.get(gid) : null;
    const guideId = info?.guideId ?? null;
    if (!guideId) return true;
    const raw = String(guideMap.get(String(guideId)) || '');
    const norm = raw.toLowerCase().replace(/[\s.]/g, '');
    return !norm.includes('ella');
  });

  const refundAmount = refundedNonElla.reduce(
    (sum, r) => sum + (Number(r.price ?? 0) || 0) * (Number(r.qty ?? 0) || 0),
    0
  );

  const realTotalSales = totalRevenue - ellaCommission;

  const grossAmount =
    rows.reduce(
      (sum, r) => sum + (Number(r.price ?? 0) || 0) * (Number(r.qty ?? 0) || 0),
      0
    ) - ellaCommission;

  // Mr. Moon commission is actually the discount amount (already deducted from price),
  // so we should NOT deduct it again from Net Sales.
  const realTotalCommission = totalCommission - mrMoonCommission - ellaCommission;
  const netAmount = realTotalSales - realTotalCommission;

  const aov = transactionCount ? grossAmount / transactionCount : 0;

  const discountRate = 0.1;

  const codesForCost = [...new Set(rows.map((r) => String(r.code || '').trim()))].filter(
    Boolean
  );
  let kpriceByCode = new Map();
  let p1priceByCode = new Map();
  if (codesForCost.length) {
    try {
      const productsForCost = [];
      const chunkSize = 200;
      for (let i = 0; i < codesForCost.length; i += chunkSize) {
        const chunk = codesForCost.slice(i, i + chunkSize);
        const inList = buildInList(chunk);
        if (inList === '()') continue;
        const page = await sbSelect('products', {
          select: 'code,kprice,p1price',
          filters: [{ column: 'code', op: 'in', value: inList }],
        });
        if (Array.isArray(page) && page.length) productsForCost.push(...page);
      }
      kpriceByCode = new Map(
        productsForCost.map((p) => [String(p.code || '').trim(), Number(p.kprice ?? 0) || 0])
      );
      p1priceByCode = new Map(
        productsForCost.map((p) => [String(p.code || '').trim(), Number(p.p1price ?? 0) || 0])
      );
    } catch (_e) {
      void _e;
      kpriceByCode = new Map();
      p1priceByCode = new Map();
    }
  }

  const costAmount = rows.reduce((sum, r) => {
    const code = String(r.code || '').trim();
    const p1price = p1priceByCode.get(code) ?? 0;
    const kprice = kpriceByCode.get(code) ?? 0;
    const costUnitPhp =
      (Number(p1price || 0) || 0) > 0 ? Number(p1price || 0) || 0 : (Number(kprice || 0) || 0) / 25;
    return sum + costUnitPhp * (Number(r.qty || 0) || 0);
  }, 0);

  // Gross Profit is now based on Real Total Sales
  const grossProfit = realTotalSales - costAmount;

  const netTotalSales = realTotalSales - realTotalCommission;
  report(70, '지출 합산 중…');
  let expenseAmount = 0;
  try {
    const expenseFilters = [];
    if (hasFrom) expenseFilters.push({ column: 'expense_date', op: 'gte', value: fromKey });
    if (hasTo) expenseFilters.push({ column: 'expense_date', op: 'lte', value: toKey });
    const expenses = await sbSelectAll('expenses', {
      select: 'amount_php,amount_krw,expense_date',
      filters: expenseFilters,
      order: { column: 'expense_date', ascending: false },
    });
    expenseAmount =
      (expenses || []).reduce((sum, e) => {
        const php = Number(e?.amount_php || 0) || 0;
        const krw = Number(e?.amount_krw || 0) || 0;
        const krwPhp = krw > 0 ? Math.ceil(krw / 25) : 0;
        return sum + php + krwPhp;
      }, 0) || 0;
  } catch {
    expenseAmount = 0;
  }

  const mrMoonDiscount = mrMoonListRevenue * 0.1;

  const ownerProfit = netTotalSales - expenseAmount - costAmount;

  const summary = {
    grossAmount,
    realTotalSales,
    netAmount,
    costAmount,
    grossProfit,
    expenseAmount,
    ownerProfit,
    totalCommission: realTotalCommission,
    transactionCount,
    aov,
    discountAmount: mrMoonDiscount,
    mrMoonRevenue,
    discountRate,
    refundCount: refundedNonElla.length,
    refundAmount,
  };

  if (typeof onSummary === 'function') {
    onSummary({
      __partial: true,
      summary,
      best: [],
      worst: [],
      sku: [],
      byCategory: [],
      byBrand: [],
      byType: [],
      byGender: [],
      bySize: [],
      byColor: [],
      byGuide: [],
      bestByCategory: [],
      bestColorByCategory: [],
      colorByType: [],
      colorTypePivotColumns: [],
      colorTypePivotRows: [],
      byWeekdayQty: [],
      byHourQty: [],
      bestWeekday: { key: '', qty: 0 },
      bestHour: { hour: 0, qty: 0 },
      discountShare: { discountedTransactions: 0, totalTransactions: transactionCount },
      weeklyRevenue: [],
      monthlyRevenue: [],
    });
  }

  if (String(mode || 'full').toLowerCase() === 'summary') {
    report(100, '완료');
    return {
      __partial: false,
      summary,
      best: [],
      worst: [],
      sku: [],
      byCategory: [],
      byBrand: [],
      byType: [],
      byGender: [],
      bySize: [],
      byColor: [],
      byGuide: [],
      bestByCategory: [],
      bestColorByCategory: [],
      colorByType: [],
      colorTypePivotColumns: [],
      colorTypePivotRows: [],
      byWeekdayQty: [],
      byHourQty: [],
      bestWeekday: { key: '', qty: 0 },
      bestHour: { hour: 0, qty: 0 },
      discountShare: { discountedTransactions: 0, totalTransactions: transactionCount },
      weeklyRevenue: [],
      monthlyRevenue: [],
    };
  }

  function accumulate(list, keyFn, labelFn) {
    const map = new Map();
    for (const row of list) {
      const key = keyFn(row);
      if (!map.has(key)) {
        map.set(key, { key, label: labelFn(key), qty: 0, revenue: 0, commission: 0 });
      }
      const entry = map.get(key);
      entry.qty += Number(row.qty || 0);
      entry.revenue += Number(row.lineTotalPhp || 0);
      entry.commission += Number(row.commission || 0);
    }
    return [...map.values()].sort((a, b) => b.revenue - a.revenue);
  }

  const revenueRows = rows.filter(
    (r) => !r.freeGift && Number(r.unitPricePhp || 0) > 0 && Number(r.lineTotalPhp || 0) > 0
  );
  const byCategory = accumulate(
    revenueRows,
    (r) => String(r.code || '').split('-')[0]?.[0] || '',
    (k) => findLabel('category', k)
  );
  const byBrand = accumulate(
    revenueRows,
    (r) => String(r.code || '').split('-')[2] || '',
    (k) => findLabel('brand', k)
  );
  const byType = accumulate(
    revenueRows,
    (r) => String(r.code || '').split('-')[1] || '',
    (k) => findLabel('type', k)
  );
  const byColor = accumulate(
    rows,
    (r) => {
      const label = String(r.color || '').trim();
      if (label) return `label:${label}`;
      const codePart = String(r.code || '').split('-')[3] || '';
      return `code:${codePart}`;
    },
    (k) => {
      const key = String(k || '');
      if (key.startsWith('label:')) return key.slice('label:'.length);
      if (key.startsWith('code:')) return findLabel('color', key.slice('code:'.length));
      return '';
    }
  );
  const bySize = accumulate(
    revenueRows,
    (r) => r.sizeDisplay || r.size || '',
    (k) => k
  );
  const byGender = accumulate(
    revenueRows,
    (r) => String(r.code || '').split('-')[0]?.[1] || '',
    (k) => findLabel('gender', k)
  );

  // Fetch guide names for mapping
  const byGuide = accumulate(
    rows.filter((r) => r.guideId && !r.isPeter),
    (r) => r.guideId,
    (k) => guideMap.get(String(k)) || 'Unknown Guide'
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
    const prev = typeMap.get(colorLabel) || {
      type: typeLabel,
      color: colorLabel,
      qty: 0,
      revenue: 0,
    };
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
  const typeAllow = new Set(
    ['top', 'bottom', 'bag', 'hat', 'golfbag', 'golfBag', 'pouch', 'belt'].map((s) =>
      s.toLowerCase()
    )
  );
  const pivotTypes = [...new Set(colorByType.map((v) => v.type))].filter((t) =>
    typeAllow.has(String(t || '').toLowerCase())
  );
  const pivotColors = [...new Set(colorByType.map((v) => v.color))];
  const colorTypePivotRows = pivotColors.map((c) => {
    const row = { color: c };
    for (const t of pivotTypes) {
      const hit = colorByType.find((v) => v.type === t && v.color === c);
      row[t] = hit ? Number(hit.qty || 0) || 0 : 0;
    }
    return row;
  });
  const colorTypePivotColumns = pivotTypes;

  const weekdayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const byWeekdayQtyMap = new Map(weekdayNames.map((n, i) => [i, { key: n, qty: 0 }]));
  const byHourQtyMap = new Map(
    Array.from({ length: 12 }, (_, k) => [k + 6, { hour: k + 6, qty: 0 }])
  );
  for (const r of rows) {
    const dt = new Date(r.soldAt);
    const day = dt.getUTCDay();
    const hour = dt.getUTCHours();
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

  report(95, '테이블 생성 중…');
  report(100, '완료');
  return {
    __partial: false,
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
    byGuide,
    bestByCategory,
    bestColorByCategory,
    colorByType,
    colorTypePivotColumns,
    colorTypePivotRows,
    byWeekdayQty,
    byHourQty,
    bestWeekday,
    bestHour,
    discountShare: { discountedTransactions: 0, totalTransactions: transactionCount },
    weeklyRevenue: [],
    monthlyRevenue: [],
  };
}
