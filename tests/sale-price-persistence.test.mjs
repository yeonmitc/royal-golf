import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import { parse } from 'espree';

const source = readFileSync(new URL('../src/features/sales/salesApiSupabase.js', import.meta.url), 'utf8');
const ast = parse(source, { ecmaVersion: 'latest', sourceType: 'module', range: true });
function functionSource(name) {
  const fn = ast.body.map((node) => node.declaration || node).find((node) => node.id?.name === name);
  return source.slice(...fn.range);
}

function fixture() {
  const row = { id: 1, sale_group_id: 'group', code: 'TEST', size_std: 'M', qty: 2,
    list_price: 2000, price: 1600, free_gift: false, sold_at: '2026-09-28T10:00:00Z' };
  const writes = [];
  const context = vm.createContext({
    console, KAKAO_FRIEND_ID: 'kakao',
    sbUpdate: async (table, patch, options) => {
      writes.push({ table, patch, options });
      Object.assign(row, patch);
      return [{ ...row }];
    },
    sbSelectAll: async (table) => table === 'sales' ? [{ ...row }] : [{ id: 'group', guide_id: 10 }],
    sbSelect: async (table) => table === 'guides' ? [{ id: 10, name: 'Peter' }] : [{ ...row }],
    sbRpc: async () => null,
    buildInList: () => '(group)', normalizeSizeKey: (s) => s,
    toMsFromIso: (s) => Date.parse(s) || 0, findLabel: () => '',
    attachLocalProductMeta: async (rows) => rows, withNormalizedNameFallback: (rows) => rows,
  });
  vm.runInContext(functionSource('updateSalePrice') + '\n' + functionSource('getSalesHistoryFlatFiltered'), context);
  return { row, writes, context };
}

test('Peter administrator price survives repeated history reads with consistent totals', async () => {
  const { row, writes, context } = fixture();
  for (const price of [2000, 1750, 0]) {
    await context.updateSalePrice({ saleId: 1, price });
    const count = writes.length;
    for (let reload = 0; reload < 2; reload++) {
      const [saved] = await context.getSalesHistoryFlatFiltered();
      assert.equal(saved.discountUnitPricePhp ?? saved.unitPricePhp, price);
      assert.equal(saved.lineTotalPhp, price * 2);
      assert.equal(row.price, price);
      assert.equal(writes.length, count, 'reading history must not write prices');
    }
  }
});

test('zero affected rows and unexpected stored prices cannot report success', async () => {
  for (const response of [[], null, [{ price: 1600 }], [{ price: null }]]) {
    const { context } = fixture();
    context.sbUpdate = async () => response;
    await assert.rejects(context.updateSalePrice({ saleId: 1, price: 2000 }), /could not be confirmed/);
  }
});

test('exchange compatibility fallback also validates the saved row', async () => {
  const { context } = fixture();
  let calls = 0;
  context.sbUpdate = async () => {
    if (++calls === 1) throw new Error('is_exchanged column missing');
    return [];
  };
  await assert.rejects(context.updateSalePrice({ saleId: 1, price: -100, markExchanged: true }), /could not be confirmed/);
  assert.equal(calls, 2);
});
