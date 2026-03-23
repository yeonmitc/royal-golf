export const RENTAL_CODE = 'GA-GC-RT-BK-01';

export function dateKeyFromIso(iso) {
  const s = String(iso || '').trim();
  const m = s.match(/\d{4}-\d{2}-\d{2}/);
  return m ? m[0] : '';
}

export function timeKeyFromIso(iso) {
  const s = String(iso || '').trim();
  const m = s.match(/[T\s](\d{2}:\d{2})/);
  return m ? m[1] : '';
}

export function buildRentalSig({ soldAt, code, size, qty, unitPrice }) {
  const d = dateKeyFromIso(soldAt);
  const c = String(code || '').trim();
  const sz = String(size || '').trim();
  const q = Number(qty || 0) || 0;
  const u = Number(unitPrice || 0) || 0;
  return [d, soldAt || '', c, sz, q, u].join('|');
}

function storageKey(dateKey) {
  return `rental_meta_v1:${dateKey}`;
}

function readJson(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    void 0;
  }
}

function pruneOtherDays(keepDateKey) {
  try {
    const prefix = 'rental_meta_v1:';
    for (let i = localStorage.length - 1; i >= 0; i -= 1) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(prefix)) continue;
      if (k === storageKey(keepDateKey)) continue;
      localStorage.removeItem(k);
    }
  } catch {
    void 0;
  }
}

export function saveRentalMetaForDay(dateKey, entries) {
  const dk = String(dateKey || '').trim();
  if (!dk) return;
  pruneOtherDays(dk);
  const key = storageKey(dk);
  const prev = readJson(key);
  const itemsBySig =
    prev && typeof prev === 'object' && prev.itemsBySig && typeof prev.itemsBySig === 'object'
      ? prev.itemsBySig
      : prev && typeof prev === 'object' && prev.items && typeof prev.items === 'object'
        ? prev.items
        : {};
  const byTime =
    prev && typeof prev === 'object' && prev.byTime && typeof prev.byTime === 'object'
      ? prev.byTime
      : {};

  (entries || []).forEach((e) => {
    const sig = String(e?.sig || '').trim();
    const timeKey = String(e?.timeKey || '').trim();
    const payload = {
      rentalNo: e?.rentalNo != null ? String(e.rentalNo).trim() : '',
      customerName: String(e?.customerName || '').trim(),
      customerContact: String(e?.customerContact || '').trim(),
    };
    if (sig) {
      itemsBySig[sig] = payload;
    }
    if (timeKey) {
      const arr = Array.isArray(byTime[timeKey]) ? byTime[timeKey] : [];
      const rn = String(payload.rentalNo || '').trim();
      const nextArr = rn
        ? arr.some((x) => String(x?.rentalNo || '').trim() === rn)
          ? arr.map((x) => (String(x?.rentalNo || '').trim() === rn ? payload : x))
          : [...arr, payload]
        : [...arr, payload];
      byTime[timeKey] = nextArr;
    }
  });
  writeJson(key, { itemsBySig, byTime, updatedAt: new Date().toISOString() });
}

export function saveRentalMetaForSoldAt(soldAt, entries) {
  const dk = dateKeyFromIso(soldAt);
  const tk = timeKeyFromIso(soldAt);
  if (!dk || !tk) return;
  const enriched = (entries || []).map((e) => ({ ...e, timeKey: tk }));
  saveRentalMetaForDay(dk, enriched);
}

export function getRentalMetaForRow(row, { timeIndex } = {}) {
  const soldAt = row?.soldAt;
  const dk = dateKeyFromIso(soldAt);
  if (!dk) return null;
  const key = storageKey(dk);
  const data = readJson(key);
  const byTime = data && typeof data === 'object' ? data.byTime : null;
  const itemsBySig =
    data && typeof data === 'object'
      ? data.itemsBySig || data.items
      : null;

  const tk = timeKeyFromIso(soldAt);
  const idx = Number.isFinite(Number(timeIndex)) ? Number(timeIndex) : null;
  if (tk && byTime && typeof byTime === 'object' && idx != null && idx >= 0) {
    const arr = byTime[tk];
    if (Array.isArray(arr) && arr[idx]) {
      const hit = arr[idx];
      return {
        rentalNo: String(hit?.rentalNo || '').trim(),
        customerName: String(hit?.customerName || '').trim(),
        customerContact: String(hit?.customerContact || '').trim(),
      };
    }
  }

  if (!itemsBySig || typeof itemsBySig !== 'object') return null;
  const unitPrice = row?.discountUnitPricePhp != null ? row.discountUnitPricePhp : row?.unitPricePhp;
  const sig = buildRentalSig({
    soldAt,
    code: row?.code,
    size: row?.sizeDisplay,
    qty: row?.qty,
    unitPrice,
  });
  const hit = itemsBySig[sig];
  if (!hit) return null;
  return {
    rentalNo: String(hit?.rentalNo || '').trim(),
    customerName: String(hit?.customerName || '').trim(),
    customerContact: String(hit?.customerContact || '').trim(),
  };
}

function hasHangul(s) {
  return /[가-힣]/.test(String(s || ''));
}

function toTitleWords(s) {
  return String(s || '')
    .split(/\s+/g)
    .filter(Boolean)
    .map((w) => {
      const parts = w.split('-');
      const t = parts
        .map((p) => (p ? p[0].toUpperCase() + p.slice(1).toLowerCase() : ''))
        .filter(Boolean)
        .join('-');
      return t;
    })
    .join(' ');
}

function romanizeHangul(text) {
  const s = String(text || '');
  const L = [
    'g',
    'kk',
    'n',
    'd',
    'tt',
    'r',
    'm',
    'b',
    'pp',
    's',
    'ss',
    '',
    'j',
    'jj',
    'ch',
    'k',
    't',
    'p',
    'h',
  ];
  const V = [
    'a',
    'ae',
    'ya',
    'yae',
    'eo',
    'e',
    'yeo',
    'ye',
    'o',
    'wa',
    'wae',
    'oe',
    'yo',
    'u',
    'wo',
    'we',
    'wi',
    'yu',
    'eu',
    'ui',
    'i',
  ];
  const T = [
    '',
    'k',
    'k',
    'ks',
    'n',
    'nj',
    'nh',
    't',
    'l',
    'lk',
    'lm',
    'lb',
    'ls',
    'lt',
    'lp',
    'lh',
    'm',
    'p',
    'ps',
    't',
    't',
    'ng',
    't',
    't',
    'k',
    't',
    'p',
    'h',
  ];

  let out = '';
  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i];
    const code = s.charCodeAt(i);
    if (code >= 0xac00 && code <= 0xd7a3) {
      const n = code - 0xac00;
      const li = Math.floor(n / 588);
      const vi = Math.floor((n % 588) / 28);
      const ti = n % 28;
      out += `${L[li] || ''}${V[vi] || ''}${T[ti] || ''}`;
    } else {
      out += ch;
    }
  }
  return out.replace(/\s+/g, ' ').trim();
}

function formatCustomerName(raw) {
  const v = String(raw || '').trim();
  if (!v) return '';
  if (!hasHangul(v)) return v;
  const hangul = v.replace(/[^가-힣\s]/g, '').replace(/\s+/g, ' ').trim();
  const latin = v.replace(/[가-힣]/g, '').replace(/\s+/g, ' ').trim();
  const hasLatin = /[A-Za-z]/.test(latin);
  if (hangul && hasLatin) return `${latin} / ${hangul}`;
  if (!hangul) return v;
  const rom = toTitleWords(romanizeHangul(hangul));
  if (!rom) return hangul;
  return `${rom} / ${hangul}`;
}

export function formatRentalName(meta) {
  if (!meta) return '';
  return formatCustomerName(meta.customerName);
}

export function formatRentalLabel(meta) {
  if (!meta) return '';
  const parts = [];
  const rn = String(meta.rentalNo || '').trim();
  const nm = formatCustomerName(meta.customerName);
  const ct = String(meta.customerContact || '').trim();
  if (rn) parts.push(`#${rn}`);
  if (nm) parts.push(nm);
  if (ct) parts.push(ct);
  return parts.join(' / ');
}
