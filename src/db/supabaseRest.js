const SUPABASE_URL = String(
  import.meta.env.VITE_SUPABASE_URL ||
    import.meta.env.NEXT_PUBLIC_SUPABASE_URL ||
    ''
).replace(/\/+$/, '');
const SUPABASE_ANON_KEY = String(
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
    import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||
    ''
).trim();

function hasSupabaseConfig() {
  return !!(SUPABASE_URL && SUPABASE_ANON_KEY);
}

function buildUrl(path, query) {
  const u = new URL(SUPABASE_URL + path);
  if (query) {
    Object.entries(query).forEach(([k, v]) => {
      if (v === undefined || v === null || v === '') return;
      u.searchParams.set(k, String(v));
    });
  }
  return u.toString();
}

async function request(path, { method = 'GET', query, body, headers } = {}) {
  if (!hasSupabaseConfig()) {
    throw new Error('SUPABASE_CONFIG_MISSING');
  }

  const res = await fetch(buildUrl(path, query), {
    method,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': body ? 'application/json' : undefined,
      ...(headers || {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    let msg = `SUPABASE_HTTP_${res.status}`;
    try {
      const data = await res.json();
      if (data?.message) msg = String(data.message);
      else if (data?.error) msg = String(data.error);
      else if (data) msg = JSON.stringify(data);
    } catch {
      try {
        const text = await res.text();
        if (text) msg = text;
      } catch {
        // ignore
      }
    }
    throw new Error(msg);
  }

  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function sbSelect(table, { select = '*', filters = [], order, limit, offset } = {}) {
  const query = { select };
  if (order?.column) {
    query.order = `${order.column}.${order.ascending ? 'asc' : 'desc'}`;
  }
  if (limit != null) query.limit = limit;
  if (offset != null) query.offset = offset;

  const path = `/rest/v1/${table}`;
  const url = new URL(buildUrl(path, query));
  (filters || []).forEach(({ column, op, value }) => {
    url.searchParams.set(column, `${op}.${value}`);
  });
  return request(url.pathname + url.search, { method: 'GET' });
}

export async function sbInsert(table, rows, { returning = 'representation' } = {}) {
  return request(`/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      Prefer: `return=${returning}`,
    },
    body: rows,
  });
}

export async function sbUpsert(
  table,
  rows,
  { onConflict, returning = 'representation', ignoreDuplicates = false } = {}
) {
  const query = onConflict ? { on_conflict: onConflict } : undefined;
  const preferParts = [`return=${returning}`, ignoreDuplicates ? 'resolution=ignore-duplicates' : 'resolution=merge-duplicates'];
  return request(buildUrl(`/rest/v1/${table}`, query), {
    method: 'POST',
    headers: {
      Prefer: preferParts.join(','),
    },
    body: rows,
  });
}

export async function sbUpdate(table, values, { filters = [], returning = 'representation' } = {}) {
  const path = `/rest/v1/${table}`;
  const url = new URL(buildUrl(path, {}));
  (filters || []).forEach(({ column, op, value }) => {
    url.searchParams.set(column, `${op}.${value}`);
  });
  return request(url.pathname + url.search, {
    method: 'PATCH',
    headers: {
      Prefer: `return=${returning}`,
    },
    body: values,
  });
}

export async function sbDelete(table, { filters = [], returning = 'minimal' } = {}) {
  const path = `/rest/v1/${table}`;
  const url = new URL(buildUrl(path, {}));
  (filters || []).forEach(({ column, op, value }) => {
    url.searchParams.set(column, `${op}.${value}`);
  });
  return request(url.pathname + url.search, {
    method: 'DELETE',
    headers: {
      Prefer: `return=${returning}`,
    },
  });
}
