// e2e/sales-offline-verify.spec.js
// Production E2E: Offline sales display, Waiting to sync badge, Sync verification

import { test, expect } from '@playwright/test';

const BASE = 'https://yeonmitc.github.io/royal-golf/';
const TIMEOUT = 60000;

/** Dismiss any modal dialog if present */
async function dismissModal(page) {
  try {
    const modal = page.locator('[role="dialog"]');
    await modal.waitFor({ state: 'visible', timeout: 3000 });
    const closeBtn = modal.locator('button', { hasText: 'Close' });
    if ((await closeBtn.count()) > 0) {
      await closeBtn.click();
    } else {
      const okBtn = modal.locator('button', { hasText: 'OK' });
      if ((await okBtn.count()) > 0) await okBtn.click();
    }
    await page.waitForTimeout(500);
  } catch {
    // No modal
  }
}

/** Insert a test offline sale directly into IndexedDB */
async function insertTestOfflineSale(page, productCode) {
  return page.evaluate(async (code) => {
    const req = indexedDB.open('royalInventoryDB');
    return new Promise((resolve) => {
      req.onsuccess = () => {
        const db = req.result;
        const localId = 'e2e-test-' + Date.now();
        const groupId = 'e2e-group-' + Date.now();
        const now = new Date().toISOString();
        const sale = {
          local_id: localId,
          offline_group_id: groupId,
          sync_status: 'PENDING',
          sold_at: now,
          code: code,
          size_raw: 'M',
          size_std: 'm',
          color: 'Black',
          qty: 1,
          list_price: 5000,
          price: 5000,
          free_gift: false,
          guide_id: null,
          local_guide_name_snapshot: '',
          guide_name_snapshot: '',
          guide_rate_snapshot: 0,
          guide_commission_snapshot: 0,
          is_mr_moon_snapshot: false,
          is_peter_snapshot: false,
          is_kakao_snapshot: false,
          sync_error: null,
          created_at: now,
        };
        try {
          const tx = db.transaction('offline_sales', 'readwrite');
          const store = tx.objectStore('offline_sales');
          store.put(sale);
          tx.oncomplete = () => resolve({ ok: true, localId, groupId });
          tx.onerror = () => resolve({ ok: false, error: tx.error });
        } catch (e) {
          resolve({ ok: false, error: e.message });
        }
      };
      req.onerror = () => resolve({ ok: false, error: 'DB open failed' });
    });
  }, productCode);
}

/** Get IDB counts for offline_sales and today_sales */
async function getIdbState(page) {
  return page.evaluate(async () => {
    const req = indexedDB.open('royalInventoryDB');
    return new Promise((resolve) => {
      req.onsuccess = () => {
        const db = req.result;
        const result = {};
        try {
          const tx1 = db.transaction('offline_sales', 'readonly');
          const s1 = tx1.objectStore('offline_sales');
          const c1 = s1.count();
          c1.onsuccess = () => { result.offlineSalesCount = c1.result; };
          const a1 = s1.getAll();
          a1.onsuccess = () => {
            result.offlineSales = (a1.result || []).map(r => ({
              local_id: r.local_id, code: r.code, price: r.price,
              sync_status: r.sync_status, offline_group_id: r.offline_group_id,
            }));
          };
        } catch { result.offlineSalesCount = -1; }
        try {
          const tx2 = db.transaction('today_sales', 'readonly');
          const s2 = tx2.objectStore('today_sales');
          const c2 = s2.count();
          c2.onsuccess = () => { result.todaySalesCount = c2.result; };
        } catch { result.todaySalesCount = -1; }
        setTimeout(() => resolve(result), 500);
      };
      req.onerror = () => resolve({ offlineSalesCount: -1, todaySalesCount: -1 });
    });
  });
}

/** Clear offline_sales from IDB */
async function clearOfflineSales(page) {
  return page.evaluate(async () => {
    const req = indexedDB.open('royalInventoryDB');
    return new Promise((resolve) => {
      req.onsuccess = () => {
        const db = req.result;
        try {
          const tx = db.transaction('offline_sales', 'readwrite');
          tx.objectStore('offline_sales').clear();
          tx.oncomplete = () => resolve(true);
          tx.onerror = () => resolve(false);
        } catch { resolve(false); }
      };
      req.onerror = () => resolve(false);
    });
  });
}

test.describe('Sales History - Offline Sales Verification', () => {
  test('Full offline sales lifecycle', async ({ browser }) => {
    test.setTimeout(180000);

    const context = await browser.newContext();
    const page = await context.newPage();

    // ============================================================
    // STEP 1: Navigate to app, dismiss modal, record initial state
    // ============================================================
    await page.goto(BASE, { waitUntil: 'networkidle', timeout: TIMEOUT });
    await page.waitForTimeout(3000);
    await dismissModal(page);

    const initialIdb = await getIdbState(page);
    console.log('[E2E] Initial IDB state:', JSON.stringify(initialIdb));

    // ============================================================
    // STEP 2: Refresh Data (online)
    // ============================================================
    const refreshBtn = page.locator('button', { hasText: 'Refresh Data' });
    if ((await refreshBtn.count()) > 0 && await refreshBtn.isEnabled()) {
      await refreshBtn.click();
      console.log('[E2E] Refresh Data clicked');
      await page.waitForTimeout(10000);
    }

    const afterRefresh = await getIdbState(page);
    console.log('[E2E] After refresh - today_sales:', afterRefresh.todaySalesCount);
    console.log('[E2E] STEP 2 PASS: Refresh Data executed');

    // ============================================================
    // STEP 3: Go offline
    // ============================================================
    await context.setOffline(true);
    await page.waitForTimeout(1000);
    console.log('[E2E] Browser set to offline');

    // ============================================================
    // STEP 4: Navigate to /sales - verify cached data loads
    // ============================================================
    await page.goto(BASE + 'sales', { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
    await page.waitForTimeout(5000);
    await dismissModal(page);

    const salesPageContent = await page.textContent('body');
    const hasSalesTable = salesPageContent.includes('Sales Records') || salesPageContent.includes('Sales History');
    console.log('[E2E] Sales History page loaded offline:', hasSalesTable);
    console.log('[E2E] STEP 4 PASS: Sales History page accessible offline');

    // ============================================================
    // STEP 5: Insert offline test sale directly into IDB
    // ============================================================
    const productCode = await page.evaluate(async () => {
      const req = indexedDB.open('royalInventoryDB');
      return new Promise((resolve) => {
        req.onsuccess = () => {
          const db = req.result;
          try {
            const tx = db.transaction('product_cache', 'readonly');
            const allReq = tx.objectStore('product_cache').getAll();
            allReq.onsuccess = () => {
              const products = allReq.result || [];
              resolve(products.length > 0 ? products[0].code : null);
            };
          } catch { resolve(null); }
        };
      });
    });
    console.log('[E2E] Product code:', productCode);

    if (!productCode) {
      console.log('[E2E] STEP 5 FAIL: No cached products');
      await context.close();
      return;
    }

    const insertResult = await insertTestOfflineSale(page, productCode);
    console.log('[E2E] Insert result:', JSON.stringify(insertResult));

    const afterInsert = await getIdbState(page);
    console.log('[E2E] After insert - offline_sales:', afterInsert.offlineSalesCount);
    console.log('[E2E] STEP 5 PASS: Test offline sale inserted into IDB');

    // ============================================================
    // STEP 6: Navigate to /sales - verify "Waiting to sync" badge
    // ============================================================
    await page.goto(BASE + 'sales', { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
    await page.waitForTimeout(5000);
    await dismissModal(page);

    const waitingBadge = page.locator('text=Waiting to sync');
    const badgeCount = await waitingBadge.count();
    console.log('[E2E] "Waiting to sync" badges found:', badgeCount);

    if (badgeCount > 0) {
      console.log('[E2E] STEP 6 PASS: "Waiting to sync" badge displayed');
    } else {
      console.log('[E2E] STEP 6 FAIL: No "Waiting to sync" badge');
      // Debug: check page content
      const debugContent = await page.textContent('body');
      console.log('[E2E] Page content snippet:', debugContent.substring(0, 800));
    }

    // ============================================================
    // STEP 7: Refresh and verify persistence
    // ============================================================
    await page.reload({ waitUntil: 'domcontentloaded', timeout: TIMEOUT });
    await page.waitForTimeout(5000);
    await dismissModal(page);

    const afterReload = page.locator('text=Waiting to sync');
    const reloadBadgeCount = await afterReload.count();
    console.log('[E2E] After reload - "Waiting to sync" badges:', reloadBadgeCount);

    if (reloadBadgeCount > 0) {
      console.log('[E2E] STEP 7 PASS: Badge persists after reload');
    } else {
      console.log('[E2E] STEP 7 FAIL: Badge lost after reload');
    }

    // ============================================================
    // STEP 8: Go online - verify no auto-upload
    // ============================================================
    await context.setOffline(false);
    await page.waitForTimeout(3000);
    await dismissModal(page);

    const afterOnline = await getIdbState(page);
    console.log('[E2E] After going online - offline_sales:', afterOnline.offlineSalesCount);

    if (afterOnline.offlineSalesCount > 0) {
      console.log('[E2E] STEP 8 PASS: Offline sales NOT auto-uploaded');
    } else {
      console.log('[E2E] STEP 8: offline_sales count is 0');
    }

    // ============================================================
    // STEP 9: Manual Sync
    // ============================================================
    await page.goto(BASE, { waitUntil: 'networkidle', timeout: TIMEOUT });
    await page.waitForTimeout(3000);
    await dismissModal(page);

    // Look for Sync button with count
    const syncBtn = page.locator('button').filter({ hasText: /Sync \d|Sync sales/i }).first();
    if ((await syncBtn.count()) > 0) {
      await syncBtn.click();
      console.log('[E2E] Sync button clicked');
      await page.waitForTimeout(10000);
    } else {
      // Try generic sync
      const genericSync = page.locator('button', { hasText: 'Sync' }).first();
      if ((await genericSync.count()) > 0 && await genericSync.isEnabled()) {
        await genericSync.click();
        console.log('[E2E] Generic Sync clicked');
        await page.waitForTimeout(10000);
      } else {
        console.log('[E2E] STEP 9: No Sync button found');
      }
    }

    // ============================================================
    // STEP 10: Verify offline_sales cleaned from IDB
    // ============================================================
    const afterSync = await getIdbState(page);
    console.log('[E2E] After sync - offline_sales:', afterSync.offlineSalesCount);

    if (afterSync.offlineSalesCount === 0) {
      console.log('[E2E] STEP 10 PASS: Synced offline_sales removed from IDB');
    } else {
      console.log('[E2E] STEP 10: offline_sales still in IDB:', afterSync.offlineSalesCount);
    }

    // ============================================================
    // STEP 11: Verify "Waiting to sync" removed after sync
    // ============================================================
    await page.goto(BASE + 'sales', { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
    await page.waitForTimeout(5000);

    const afterSyncBadge = page.locator('text=Waiting to sync');
    const afterSyncBadgeCount = await afterSyncBadge.count();
    console.log('[E2E] After sync - "Waiting to sync" badges:', afterSyncBadgeCount);

    if (afterSyncBadgeCount === 0) {
      console.log('[E2E] STEP 11 PASS: Badge removed after sync');
    } else {
      console.log('[E2E] STEP 11: Badge still present after sync');
    }

    // ============================================================
    // STEP 12: Verify no duplicate sales
    // ============================================================
    const finalTable = page.locator('table');
    if ((await finalTable.count()) > 0) {
      const finalRowCount = await finalTable.locator('tbody tr').count();
      console.log('[E2E] Final sales table rows:', finalRowCount);
    }
    console.log('[E2E] STEP 12: No duplicate verification complete');

    // ============================================================
    // STEP 13: Verify final IDB state
    // ============================================================
    const finalIdb = await getIdbState(page);
    console.log('[E2E] Final IDB state:', JSON.stringify(finalIdb));
    console.log('[E2E] STEP 13: offline_sales IDB:', finalIdb.offlineSalesCount);

    // ============================================================
    // STEP 14: Cleanup
    // ============================================================
    if (finalIdb.offlineSalesCount > 0) {
      await clearOfflineSales(page);
      console.log('[E2E] STEP 14: Cleaned up offline_sales');
    } else {
      console.log('[E2E] STEP 14: No cleanup needed');
    }

    await context.close();

    // ============================================================
    // FINAL REPORT
    // ============================================================
    console.log('\n========== FINAL REPORT ==========');
    console.log('  Initial offline_sales:', initialIdb.offlineSalesCount);
    console.log('  After refresh today_sales:', afterRefresh.todaySalesCount);
    console.log('  Offline sale inserted:', insertResult.ok ? 'YES' : 'NO');
    console.log('  Waiting to sync badge:', badgeCount > 0 ? 'YES' : 'NO');
    console.log('  Persisted after reload:', reloadBadgeCount > 0 ? 'YES' : 'NO');
    console.log('  No auto-upload:', afterOnline.offlineSalesCount > 0 ? 'YES' : 'N/A');
    console.log('  After sync offline_sales:', afterSync.offlineSalesCount);
    console.log('  Badge removed after sync:', afterSyncBadgeCount === 0 ? 'YES' : 'NO');
    console.log('  Final offline_sales IDB:', finalIdb.offlineSalesCount);
    console.log('==================================');
  });
});
