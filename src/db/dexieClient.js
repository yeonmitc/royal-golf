// src/db/dexieClient.js
import Dexie from 'dexie';

const DB_NAME = 'royalInventoryDB';
const GLOBAL_SINGLETON_KEY = '__ROYAL_INVENTORY_DEXIE_SINGLETON__';

// Prevent duplicate Dexie instances under Vite HMR or multiple imports.
// NOTE: we intentionally keep schema registration identical; Dexie will
// re-use existing open connections.
function buildDbInstance() {
  const dexieDb = new Dexie(DB_NAME);

  dexieDb.version(1).stores({
    products: [
      '&code',
      'nameKo',
      'categoryCode',
      'genderCode',
      'typeCode',
      'brandCode',
      'colorCode',
      'modelNo',
      'priceCny',
      'basePricePhp',
      'salePricePhp',
      'totalStock',
    ].join(','),
    inventory: ['++id', 'code', 'size', '[code+size]', 'sizeDisplay', 'stockQty', 'location'].join(
      ','
    ),
    codeParts: ['++id', 'group', 'code', 'labelKo'].join(','),
    sales: ['++id', 'soldAt', 'totalAmount', 'itemCount'].join(','),
    saleItems: ['++id', 'saleId', 'code', 'size', 'qty', 'unitPricePhp'].join(','),
  });

  dexieDb.version(2).stores({
    logs: ['++id', 'type', 'time', 'code'].join(','),
  });

  dexieDb.version(3).stores({
    saleItems: [
      '++id',
      'saleId',
      'code',
      'size',
      'qty',
      'unitPricePhp',
      'discountUnitPricePhp',
    ].join(','),
  });

  dexieDb.version(4).stores({
    refunds: ['++id', 'saleId', 'code', 'size', 'qty', 'amountPhp', 'reason', 'time'].join(','),
  });

  dexieDb.version(5).stores({
    saleItems: [
      '++id',
      'saleId',
      'code',
      'size',
      'qty',
      'unitPricePhp',
      'discountUnitPricePhp',
      'isExchanged',
    ].join(','),
  });

  dexieDb.version(6).stores({
    product_cache: [
      '&code',
      'name',
      'sale_price',
      'free_gift',
      'brand',
      'color',
      'sizes_json',
      'updated_at',
    ].join(','),
    offline_sales: [
      '&local_id',
      'sync_status',
      'offline_group_id',
      'sold_at',
      'code',
      'guide_id',
      'guide_name_snapshot',
      'guide_rate_snapshot',
      'guide_commission_snapshot',
      'is_mr_moon_snapshot',
      'is_peter_snapshot',
      'is_kakao_snapshot',
      'local_guide_name_snapshot',
      'sync_error',
      'created_at',
    ].join(','),
    app_meta: ['&key'].join(','),
  });

  // Lifecycle events (CRITICAL: never leave a DB open with a pending upgrade)
  dexieDb.on('blocked', () => {
    console.error('[Dexie] Database update is blocked. Please close other tabs and refresh.');
    if (typeof window !== 'undefined' && window.dispatchEvent) {
      try {
        window.dispatchEvent(
          new CustomEvent('royal-inventory-db-blocked', {
            detail: { message: 'Please close other shop tabs and refresh this page.' },
          })
        );
      } catch {
        /* ignore */
      }
    }
  });

  dexieDb.on('versionchange', () => {
    console.warn('[Dexie] versionchange received — closing local connection and signalling UI.');
    try {
      dexieDb.close();
    } catch {
      /* ignore */
    }
    if (typeof window !== 'undefined' && window.dispatchEvent) {
      try {
        window.dispatchEvent(
          new CustomEvent('royal-inventory-db-update-required', {
            detail: {
              message:
                'An app update is ready. Please close other shop tabs and refresh this page.',
            },
          })
        );
      } catch {
        /* ignore */
      }
    }
  });

  dexieDb.on('populate', () => {
    // v1 populate intentionally left empty; data is seeded via product API.
  });

  return dexieDb;
}

function getSingletonDb() {
  const g =
    typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : {};
  if (!g[GLOBAL_SINGLETON_KEY] || !(g[GLOBAL_SINGLETON_KEY] instanceof Dexie)) {
    g[GLOBAL_SINGLETON_KEY] = buildDbInstance();
  }
  return g[GLOBAL_SINGLETON_KEY];
}

export const db = getSingletonDb();

export default db;
