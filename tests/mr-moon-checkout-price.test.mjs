import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import { parse } from 'espree';

const source = readFileSync(new URL('../src/features/sales/salesApiSupabase.js', import.meta.url), 'utf8');
const ast = parse(source, { ecmaVersion: 'latest', sourceType: 'module', range: true });
const declaration = ast.body.find((node) => node.declaration?.id?.name === 'checkoutCartWithOfflineFallback');
const checkoutSource = source.slice(...declaration.declaration.range);
const assignment = ast.body.find((node) => node.declaration?.id?.name === 'setSaleGroupGuide');
const assignmentSource = source.slice(...assignment.declaration.range);

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
  return { writes, context, checkout: context.checkoutCartWithOfflineFallback };
}

test('online checkout stops before inserting when the selected guide cannot be verified', async () => {
  const { writes, context, checkout } = fixture(true);
  context.sbSelect = async () => { throw new Error('Guide lookup failed'); };
  await assert.rejects(checkout({
    items: [{ code: 'GA-HT-MB-GE-01', size: 'Free', qty: 1, unitPricePhp: 1300 }],
    guideId: 1,
    isMrMoon: false,
  }), /Guide lookup failed/);
  assert.equal(writes.length, 0);
});

test('assigning Mr. Moon reprices the sale and reports a price update failure', async () => {
  for (const failPriceUpdate of [false, true]) {
    const updates = [];
    const context = vm.createContext({
      requireAdminOrThrow: () => {},
      sbSelect: async (table) => table === 'guides'
        ? [{ id: 7, name: 'MR.MOON' }]
        : [{ id: 42, price: 4900, list_price: 4900, free_gift: false }],
      sbUpdate: async (table, patch) => {
        if (failPriceUpdate && table === 'sales') throw new Error('Price update failed');
        updates.push({ table, patch });
      },
      sbRpc: async () => null,
    });
    vm.runInContext(assignmentSource, context);
    const operation = context.setSaleGroupGuide({ saleGroupId: 'group', guideId: 7 });
    if (failPriceUpdate) {
      await assert.rejects(operation, /Price update failed/);
    } else {
      await operation;
      assert.equal(updates.find((entry) => entry.table === 'sales').patch.price, 4500);
    }
  }
});

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
