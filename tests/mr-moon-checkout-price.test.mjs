import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import { parse } from 'espree';

const source = readFileSync(new URL('../src/features/sales/salesApiSupabase.js', import.meta.url), 'utf8');
const ast = parse(source, { ecmaVersion: 'latest', sourceType: 'module', range: true });
const declaration = ast.body.find((node) => node.declaration?.id?.name === 'checkoutCartWithOfflineFallback');
const checkoutSource = source.slice(...declaration.declaration.range);

function fixture(online) {
  const writes = [];
  const context = vm.createContext({
    console,
    crypto: { randomUUID: () => 'test-group' },
    nowLocalIsoLikeUtc: () => '2026-10-30T09:52:00',
    isBrowserOnline: () => online,
    getAllCachedProducts: async () => [{ code: 'GA-HT-MB-GE-01', sale_price: 1300 }],
    fallbackSaveOfflineCart: async (params) => {
      writes.push(...params.saleRows);
      return { isOffline: true };
    },
    sbSelect: async (table) => table === 'guides'
      ? [{ id: 1, name: 'MR.MOON' }]
      : [{ code: 'GA-HT-MB-GE-01', sale_price: 1300 }],
    sbInsert: async (table, rows) => {
      if (table === 'sales') writes.push(...rows);
      return [{ id: 1 }];
    },
    sbRpc: async () => null,
    buildInList: () => '(GA-HT-MB-GE-01)',
    normalizeSizeKey: (size) => size,
    findLabel: () => '',
    setTimeout,
  });
  vm.runInContext(checkoutSource, context);
  return { writes, checkout: context.checkoutCartWithOfflineFallback };
}

for (const online of [true, false]) {
  test(`Mr. Moon checkout uses the displayed cart price (${online ? 'online' : 'offline'})`, async () => {
    const { writes, checkout } = fixture(online);
    await checkout({
      items: [{
        code: 'GA-HT-MB-GE-01', size: 'Free', qty: 1,
        unitPricePhp: 1300, originalUnitPricePhp: 1400,
      }],
      guideId: 1,
      isMrMoon: true,
      isNowtravel: false,
    });
    assert.equal(writes.length, 1);
    assert.equal(writes[0].list_price, 1300);
    assert.equal(writes[0].price, 1200);
  });
}
