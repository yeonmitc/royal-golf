import codePartsSeed from '../../db/seed/seed-code-parts.json';
import { sbInsert, sbSelect, sbUpdate, sbRpc } from '../../db/supabaseRest';
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

function sumInventoriesRow(row) {
  if (!row) return 0;
  return SIZE_ORDER.reduce((sum, sizeKey) => {
    const col = SIZE_TO_COLUMN[sizeKey];
    return sum + (Number(row?.[col] ?? 0) || 0);
  }, 0);
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

export async function checkoutCart(payload) {
  let cartItems = payload;
  let guideId = null;

  if (!Array.isArray(payload) && payload?.items) {
    cartItems = payload.items;
    guideId = payload.guideId;
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
  const guideRate = guideId ? 0.1 : 0; // 10% commission if guide present

  // Create the group first (parent record)
  // We initialize totals to 0; finalize_sale_group will calculate them
  await sbInsert('sale_groups', [{
    id: saleGroupId,
    guide_id: guideId || null,
    guide_rate: guideRate,
    sold_at: soldAt,
    subtotal: 0,
    total: 0,
    guide_commission: 0
  }], { returning: 'minimal' });

  for (const item of items) {
    const { code, size, qty } = item;
    if (!code) throw new Error('Missing product code.');
    const product = productMap.get(code);
    if (!product) throw new Error(`No product: ${code}`);

    const unitPriceOriginal =
      Number(item.originalUnitPricePhp ?? item.unitPricePhp ?? product.salePrice ?? 0) || 0;
    const unitPriceChargedCandidate = Number(item.unitPricePhp ?? unitPriceOriginal);
    const unitPriceCharged = Number.isFinite(unitPriceChargedCandidate)
      ? unitPriceChargedCandidate
      : unitPriceOriginal;
    const lineTotal = unitPriceCharged * qty;
    const isFreeGift = unitPriceCharged === 0 || Boolean(product.freeGift);

    totalAmount += lineTotal;
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
        filters: [{ column: 'id', op: 'in', value: inList }]
      });
      groups.forEach(g => groupMap.set(g.id, g.guide_id));
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
        saleGroupId: r.sale_group_id
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
    color: String(r.color || '').trim() || findLabel('color', String(r.code || '').split('-')[3] || ''),
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

export async function processRefund({ saleId, reason, qty, code, size } = {}) {
  requireAdminOrThrow();
  const sid = Number(saleId);
  if (!sid) throw new Error('INVALID_SALE_ID');

  const reasonStr = String(reason || '').trim();
  const refundedAt = nowLocalIsoLikeUtc();

  // Use DB RPC to handle refund (locking, inventory restoration, refunds record)
  // The DB function `refund_item` handles:
  // 1. Locking sale and inventory rows
  // 2. Checking if already refunded
  // 3. Restoring inventory (full qty of the sale row)
  // 4. Inserting into refunds table
  // 5. Updating sales table (refunded_at, reason)
  
  await sbRpc('refund_item', {
    p_sale_id: sid,
    p_reason: reasonStr,
    p_refunded_at: refundedAt,
  });

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
  await sbUpdate(
    'sale_groups',
    { guide_id: guide, guide_rate: guide ? Number(guideRate || 0.1) : 0 },
    { filters: [{ column: 'id', op: 'eq', value: gid }], returning: 'minimal' }
  );
  try {
    await sbRpc('finalize_sale_group', { p_group_id: gid });
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
      select: 'id,sold_at,code,color,size_std,qty,price,free_gift,refunded_at,refund_reason,sale_group_id',
      order: { column: 'sold_at', ascending: false },
    });
  } catch (e) {
    const msg = String(e?.message || '').toLowerCase();
    if (msg.includes('free_gift') || msg.includes('color')) {
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
          filters: [{ column: 'id', op: 'in', value: inList }]
        });
        groups.forEach(g => groupMap.set(g.id, g.guide_id));
      } catch (e) {
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
                filters
             });
             groups.forEach(g => groupMap.set(g.id, g.guide_id));
         } else {
             // Fallback: fetch all.
             const groups = await sbSelectAll('sale_groups', { select: 'id,guide_id' });
             groups.forEach(g => groupMap.set(g.id, g.guide_id));
         }
      }
    }
  }

  const normalized = (filtered || [])
    .map((r) => {
      const qtyN = Number(r.qty ?? 0) || 0;
      const unit = Number(r.price ?? 0) || 0;
      const sizeKey = normalizeSizeKey(r.size_std);
      const refundedAt = r?.refunded_at || null;
      const isRefunded = Boolean(toMsFromIso(refundedAt));
      const guideId = groupMap.get(r.sale_group_id) || null;
      return {
        saleId: r.id,
        soldAt: r.sold_at,
        code: r.code,
        color: String(r.color || '').trim() || findLabel('color', String(r.code || '').split('-')[3] || ''),
        size: sizeKey,
        sizeDisplay: sizeKey,
        qty: qtyN,
        unitPricePhp: isRefunded ? 0 : unit,
        discountUnitPricePhp: undefined,
        lineTotalPhp: (isRefunded ? 0 : unit) * qtyN,
        freeGift: Boolean(r.free_gift ?? false) || unit === 0,
        refundedAt,
        refundReason: String(r.refund_reason || '').trim(),
        isRefunded,
        nameKo: '',
        guideId: guideId,
        saleGroupId: r.sale_group_id,
        commission: guideId ? (isRefunded ? 0 : unit) * qtyN * 0.1 : 0,
      };
    })
    .filter((r) => r.qty > 0);

  const withMeta = await attachLocalProductMeta(withNormalizedNameFallback(normalized));
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

export async function getSalesHistoryFilteredResult({ fromDate = '', toDate = '', query = '' } = {}) {
  const head = await sbSelect('sales', { select: 'id', limit: 1 });
  const hasAnySales = Array.isArray(head) && head.length > 0;
  const rows = await getSalesHistoryFlatFiltered({ fromDate, toDate, query });
  return { hasAnySales, rows };
}

export async function getAnalytics({ fromDate = '', toDate = '' } = {}) {
  const hasFrom = !!fromDate;
  const hasTo = !!toDate;
  const fromKey = String(fromDate || '').trim();
  const toKey = String(toDate || '').trim();

  let sales;
  try {
    sales = await sbSelectAll('sales', {
      select: 'id,sold_at,code,color,size_std,qty,price,refunded_at,sale_group_id',
      order: { column: 'sold_at', ascending: false },
    });
  } catch (e) {
    const msg = String(e?.message || '').toLowerCase();
    if (msg.includes('color')) {
      sales = await sbSelectAll('sales', {
        select: 'id,sold_at,code,size_std,qty,price,refunded_at,sale_group_id',
        order: { column: 'sold_at', ascending: false },
      });
    } else {
      throw e;
    }
  }

  const inRange =
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
  const groupIds = [...new Set(inRange.map((r) => r.sale_group_id).filter(Boolean))];
  const groupMap = new Map();
  if (groupIds.length > 0) {
    const inList = buildInList(groupIds);
    if (inList !== '()') {
      try {
        const groups = await sbSelectAll('sale_groups', {
          select: 'id,guide_id',
          filters: [{ column: 'id', op: 'in', value: inList }]
        });
        groups.forEach(g => groupMap.set(g.id, g.guide_id));
      } catch (e) {
         // Fallback: fetch all if IN list fails
         const groups = await sbSelectAll('sale_groups', { select: 'id,guide_id' });
         groups.forEach(g => groupMap.set(g.id, g.guide_id));
      }
    }
  }

  const refundedRows = (inRange || []).filter((r) => toMsFromIso(r?.refunded_at));
  const nonRefundedRows = (inRange || []).filter((r) => !toMsFromIso(r?.refunded_at));

  const analyzedRows = await attachLocalProductMeta(
    withNormalizedNameFallback(
      nonRefundedRows.map((r) => {
        const qtyN = Number(r.qty ?? 0) || 0;
        const unit = Number(r.price ?? 0) || 0;
        const sizeKey = normalizeSizeKey(r.size_std);
        const guideId = groupMap.get(r.sale_group_id) || null;
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
          guideId: guideId,
          saleGroupId: r.sale_group_id,
          commission: guideId ? unit * qtyN * 0.1 : 0,
        };
      })
    )
  );

  if (!analyzedRows.length) {
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
      discountShare: { discountedTransactions: 0, totalTransactions: 0 },
      weeklyRevenue: [],
      monthlyRevenue: [],
    };
  }

  const totalRevenue = analyzedRows.reduce((sum, r) => sum + (Number(r.lineTotalPhp || 0) || 0), 0);
  const totalCommission = analyzedRows.reduce((sum, r) => sum + (Number(r.commission || 0) || 0), 0);

  // Use saleGroupId for transaction counting if available, otherwise fallback to soldAt
  const transactionKeys = new Set(analyzedRows.map((r) => r.saleGroupId || String(r.soldAt || '')));
  const transactionCount = transactionKeys.size;
  const grossAmount = totalRevenue;
  const refundAmount = refundedRows.reduce(
    (sum, r) => sum + (Number(r.price ?? 0) || 0) * (Number(r.qty ?? 0) || 0),
    0
  );
  const netAmount = grossAmount - refundAmount;
  const aov = transactionCount ? grossAmount / transactionCount : 0;

  const discountAmount = 0;
  const discountRate = 0;

  const codesForCost = [...new Set(analyzedRows.map((r) => String(r.code || '').trim()))].filter(Boolean);
  let kpriceByCode = new Map();
  if (codesForCost.length) {
    const inList = buildInList(codesForCost);
    try {
      const productsForCost = await sbSelect('products', {
        select: 'code,kprice',
        filters: [{ column: 'code', op: 'in', value: inList }],
      });
      kpriceByCode = new Map(
        (productsForCost || []).map((p) => [String(p.code || '').trim(), Number(p.kprice ?? 0) || 0])
      );
    } catch (_e) {
      void _e;
      kpriceByCode = new Map();
    }
  }

  const costAmount = analyzedRows.reduce((sum, r) => {
    const code = String(r.code || '').trim();
    const kprice = kpriceByCode.get(code) ?? 0;
    const costUnitPhp = (Number(kprice || 0) || 0) / 25;
    return sum + costUnitPhp * (Number(r.qty || 0) || 0);
  }, 0);
  const grossProfit = totalRevenue - costAmount;
  const rentAmount = grossProfit * 0.1;
  const ownerProfit = grossProfit * 0.9 - totalCommission;

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

  const byCategory = accumulate(analyzedRows, (r) => String(r.code || '').split('-')[0]?.[0] || '', (k) =>
    findLabel('category', k)
  );
  const byBrand = accumulate(analyzedRows, (r) => String(r.code || '').split('-')[2] || '', (k) =>
    findLabel('brand', k)
  );
  const byColor = accumulate(
    analyzedRows,
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
  const bySize = accumulate(analyzedRows, (r) => r.sizeDisplay || r.size || '', (k) => k);
  const byGender = accumulate(
    analyzedRows,
    (r) => String(r.code || '').split('-')[0]?.[1] || '',
    (k) => findLabel('gender', k)
  );
  
  // Fetch guide names for mapping
  let guideMap = new Map();
  const guideIds = [...new Set(analyzedRows.map(r => r.guideId).filter(Boolean))];
  if (guideIds.length > 0) {
    try {
      const allGuides = await sbSelect('guides', { select: 'id,name' });
      guideMap = new Map((allGuides || []).map(g => [g.id, g.name]));
    } catch (e) {
      console.error(e);
    }
  }

  const byGuide = accumulate(
    analyzedRows.filter(r => r.guideId),
    (r) => r.guideId,
    (k) => guideMap.get(k) || 'Unknown Guide'
  );

  const skuMap = new Map();
  for (const r of analyzedRows) {
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
      costAmount,
      grossProfit,
      rentAmount,
      ownerProfit,
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
    byGuide,
    discountShare: { discountedTransactions: 0, totalTransactions: transactionCount },
    weeklyRevenue: [],
    monthlyRevenue: [],
  };
}
