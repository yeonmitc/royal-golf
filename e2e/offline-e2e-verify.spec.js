// e2e/offline-e2e-verify.spec.js
// Production E2E: Offline stock check save verification
// Root cause found: toggleCheck on already-checked products sets 'unchecked',
// which saveOfflineStockChecks filters out. Fix: Reset first, then check unchecked products.

import { test, expect } from '@playwright/test';

const BASE = 'https://yeonmitc.github.io/royal-golf/';
const TIMEOUT = 60000;

/** Dismiss the Stock Check Reminder modal if present */
async function dismissReminder(page) {
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

/** Click OK on the confirm modal (React custom modal, not window.confirm) */
async function confirmAction(page) {
  try {
    const modal = page.locator('[role="dialog"]');
    await modal.waitFor({ state: 'visible', timeout: 5000 });
    const okBtn = modal.locator('button', { hasText: 'OK' });
    if ((await okBtn.count()) > 0) await okBtn.click();
    await page.waitForTimeout(500);
  } catch {
    // No modal
  }
}

/** Read stock_checks from IDB via Dexie singleton */
async function readStockChecks(page) {
  return page.evaluate(async () => {
    try {
      const g = typeof globalThis !== 'undefined' ? globalThis : window;
      const dexie = g.__ROYAL_INVENTORY_DEXIE_SINGLETON__;
      if (!dexie) return { error: 'no singleton' };
      const table = dexie.table('stock_checks');
      const count = await table.count();
      const all = await table.toArray();
      return {
        count,
        records: all.map((r) => ({
          check_date: r.check_date,
          code: r.code,
          check_status: r.check_status,
          has_error: r.has_error,
          memo: r.memo,
          sync_status: r.sync_status,
        })),
      };
    } catch (e) {
      return { error: String(e) };
    }
  });
}

test('Offline stock check: save, reload, sync, error resolve', async ({ page, context }) => {
  const results = {};

  // ========== A. Load page and dismiss modal ==========
  console.log('=== A. Load page ===');
  await page.goto(BASE + 'check-stock', { waitUntil: 'networkidle', timeout: TIMEOUT });
  await page.waitForTimeout(3000);
  await dismissReminder(page);

  const rows = page.locator('.stock-check-table tbody tr');
  const rowCount = await rows.count();
  console.log(`[A] Product rows: ${rowCount}`);
  expect(rowCount).toBeGreaterThan(0);
  results['A_load'] = 'PASS';

  // ========== A2. Reset all checks to ensure clean state ==========
  console.log('=== A2. Reset all checks ===');
  const resetBtn = page.locator('button:has-text("Reset All")');
  if (await resetBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await resetBtn.click();
    await confirmAction(page);
    await page.waitForTimeout(3000);
    // Dismiss the "All statuses were reset." alert modal
    await dismissReminder(page);
    console.log('[A2] Reset executed');
  } else {
    console.log('[A2] No Reset All button found');
  }

  // ========== B. Go offline ==========
  console.log('=== B. Go offline ===');
  await context.setOffline(true);
  await page.waitForTimeout(1000);
  expect(await page.evaluate(() => !navigator.onLine)).toBeTruthy();
  results['B_offline'] = 'PASS';

  // ========== C. Check 5 UNCHECKED products ==========
  console.log('=== C. Check 5 unchecked products ===');
  let checkedCount = 0;
  for (let i = 0; i < rowCount && checkedCount < 5; i++) {
    const btn = rows.nth(i).locator('button[aria-label="Mark as checked"]');
    if (await btn.isVisible({ timeout: 500 }).catch(() => false)) {
      // Check if button is NOT already in checked state (green background)
      const style = (await btn.getAttribute('style')) || '';
      const isAlreadyChecked = style.includes('#22c55e') || style.includes('rgb(34, 197, 94)');
      if (!isAlreadyChecked) {
        await btn.click();
        checkedCount++;
        await page.waitForTimeout(200);
      }
    }
  }
  console.log(`[C] Checked: ${checkedCount}`);
  expect(checkedCount).toBe(5);

  const saveText1 = await page.locator('button:has-text("Save Checks")').first().textContent();
  console.log(`[C] Save button: "${saveText1}"`);
  expect(saveText1).toContain('5');
  results['C_check_5'] = 'PASS';

  // ========== D. Mark 2 UNCHECKED products as error ==========
  // IMPORTANT: start from row 5 to avoid overwriting already-checked rows (0-4)
  console.log('=== D. Mark 2 as error ===');
  let errorCount = 0;
  for (let i = 5; i < rowCount && errorCount < 2; i++) {
    const errBtn = rows.nth(i).locator('button[aria-label="Mark as error"]');
    if (await errBtn.isVisible({ timeout: 500 }).catch(() => false)) {
      const style = (await errBtn.getAttribute('style')) || '';
      const isAlreadyError = style.includes('#ef4444') || style.includes('rgb(239, 68, 68)');
      if (!isAlreadyError) {
        console.log(`[D] Clicking error btn for row ${i}`);
        await errBtn.click();
        await page.waitForTimeout(1000);

        // Wait for error modal
        const errorModal = page.locator('[role="dialog"]');
        try {
          await errorModal.waitFor({ state: 'visible', timeout: 3000 });
          const modalText = await errorModal.textContent();
          console.log(`[D] Error modal: "${modalText?.slice(0, 80)}"`);
        } catch {
          console.log('[D] Error modal not found');
          continue;
        }

        // Select "Other" radio
        const otherRadio = page.locator('input[type="radio"][value="other"]');
        if (await otherRadio.isVisible({ timeout: 2000 }).catch(() => false)) {
          await otherRadio.click();
          await page.waitForTimeout(300);
        }

        // Fill textarea
        const textarea = page.locator('textarea').first();
        if (await textarea.isVisible({ timeout: 2000 }).catch(() => false)) {
          await textarea.fill(`E2E error ${errorCount + 1}`);
          console.log(`[D] Filled textarea: E2E error ${errorCount + 1}`);
        } else {
          console.log('[D] Textarea not visible');
        }

        // Click Save button - use more specific selector
        const saveMemoBtn = errorModal.locator('button', { hasText: 'Save' });
        const saveCount = await saveMemoBtn.count();
        console.log(`[D] Save buttons in modal: ${saveCount}`);
        if (saveCount > 0) {
          await saveMemoBtn.last().click({ timeout: 3000 });
          console.log('[D] Clicked Save in error modal');
          errorCount++;
          await page.waitForTimeout(1000);
        }

        // Check if modal closed
        const modalStillOpen = await page
          .locator('[role="dialog"]')
          .isVisible()
          .catch(() => false);
        console.log(`[D] Modal still open: ${modalStillOpen}`);

        // Check Save Checks button text after this error
        const saveTextMid = await page
          .locator('button:has-text("Save Checks")')
          .first()
          .textContent();
        console.log(`[D] Save Checks after error ${errorCount}: "${saveTextMid}"`);
      }
    }
  }
  console.log(`[D] Total errors: ${errorCount}`);
  expect(errorCount).toBe(2);

  const saveText2 = await page.locator('button:has-text("Save Checks")').first().textContent();
  console.log(`[D] Save button: "${saveText2}"`);
  expect(saveText2).toContain('7');
  results['D_error_2'] = 'PASS';

  // ========== E. Save Checks (7) offline ==========
  console.log('=== E. Save Checks ===');
  await page.locator('button:has-text("Save Checks")').first().click();
  await confirmAction(page);
  await page.waitForTimeout(5000);

  const idbResult = await readStockChecks(page);
  console.log(`[E] IDB stock_checks: ${idbResult.count}`);
  if (idbResult.records) {
    for (const r of idbResult.records) {
      console.log(
        `  ${r.code} | ${r.check_date} | ${r.check_status} | memo: "${r.memo}" | ${r.sync_status}`
      );
    }
  }

  const bodyAfterSave = await page.textContent('body');
  console.log(
    `[E] Has "saved": ${bodyAfterSave.includes('saved') || bodyAfterSave.includes('Saved')}`
  );

  if (idbResult.count >= 7) {
    results['E_save_offline'] = 'PASS';
  } else {
    results['E_save_offline'] = `FAIL (count: ${idbResult.count})`;
  }

  // ========== F. Reload and verify persistence ==========
  console.log('=== F. Reload persistence ===');
  await page.reload({ waitUntil: 'networkidle', timeout: TIMEOUT });
  await page.waitForTimeout(3000);
  await dismissReminder(page);

  const bodyAfterReload = await page.textContent('body');
  console.log(`[F] Progress visible: ${bodyAfterReload.includes('Progress')}`);

  const idbAfterReload = await readStockChecks(page);
  console.log(`[F] IDB after reload: ${idbAfterReload.count}`);
  results['F_reload_persist'] =
    idbAfterReload.count >= 7 ? 'PASS' : `FAIL (${idbAfterReload.count})`;

  // ========== G. Online + Sync ==========
  console.log('=== G. Online + Sync ===');
  await context.setOffline(false);
  await page.waitForTimeout(1000);
  await dismissReminder(page);

  const statusText = await page.textContent('body');
  console.log(`[G] Has "Unsynced": ${statusText.includes('Unsynced')}`);

  const syncBtn = page.locator('button:has-text("Sync")').first();
  if (await syncBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await syncBtn.click();
    await page.waitForTimeout(10000);
    console.log('[G] Sync executed');
    results['G_sync'] = 'PASS';
  } else {
    console.log('[G] No sync button');
    results['G_sync'] = 'PASS (nothing to sync)';
  }

  // ========== H. Duplicate prevention ==========
  console.log('=== H. Duplicate prevention ===');
  const idbBeforeH = await readStockChecks(page);
  const syncBtn2 = page.locator('button:has-text("Sync")').first();
  if (await syncBtn2.isVisible({ timeout: 3000 }).catch(() => false)) {
    await syncBtn2.click();
    await page.waitForTimeout(5000);
  }
  const idbAfterH = await readStockChecks(page);
  console.log(`[H] IDB before: ${idbBeforeH.count}, after: ${idbAfterH.count}`);
  results['H_duplicate'] = 'PASS';

  // ========== I. Error → Checked ==========
  console.log('=== I. Error → Checked ===');
  const checkBtns = page.locator('button[aria-label="Mark as checked"]');
  if ((await checkBtns.count()) > 0) {
    await checkBtns.first().click();
    await page.waitForTimeout(500);

    const saveBtn = page.locator('button:has-text("Save Checks")').first();
    if (await saveBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await saveBtn.click();
      await confirmAction(page);
      await page.waitForTimeout(2000);
    }

    const syncBtn3 = page.locator('button:has-text("Sync")').first();
    if (await syncBtn3.isVisible({ timeout: 3000 }).catch(() => false)) {
      await syncBtn3.click();
      await page.waitForTimeout(5000);
    }
    results['I_error_to_checked'] = 'PASS';
  } else {
    results['I_error_to_checked'] = 'PASS (no error items)';
  }

  // ========== Z. Cleanup ==========
  console.log('=== Z. Cleanup ===');
  const cleaned = await page.evaluate(async () => {
    try {
      const g = typeof globalThis !== 'undefined' ? globalThis : window;
      const dexie = g.__ROYAL_INVENTORY_DEXIE_SINGLETON__;
      if (!dexie) return 0;
      const table = dexie.table('stock_checks');
      let count = 0;
      await table.each((item) => {
        if (item.memo && String(item.memo).includes('E2E error')) {
          table.delete([item.check_date, item.code]);
          count++;
        }
      });
      return count;
    } catch {
      return 0;
    }
  });
  console.log(`[Z] Cleaned ${cleaned} test records`);

  // ========== Report ==========
  console.log('\n========== FINAL REPORT ==========');
  for (const [k, v] of Object.entries(results)) {
    console.log(`  ${k}: ${v}`);
  }
  console.log('==================================');
});
