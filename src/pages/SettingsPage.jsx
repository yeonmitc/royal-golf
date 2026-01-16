import { useState } from 'react';
import Button from '../components/common/Button';
import { exportToCsv } from '../utils/csvExport';
import { useToast } from '../context/ToastContext';
import { getProductInventoryList } from '../features/products/productApi';
import { getSupabaseConfigSummary, sbSelect } from '../db/supabaseRest';

export default function SettingsPage() {
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);
  const cfg = getSupabaseConfigSummary();

  const handleExportProducts = async () => {
    const rows = await getProductInventoryList();
    const header = ['code', 'nameKo', 'salePricePhp', 'totalStock'];
    const csvRows = [header].concat(
      rows.map((p) => [p.code, p.nameKo, p.salePricePhp, p.totalStock])
    );
    exportToCsv('products.csv', csvRows);
  };

  const exportToJson = (filename, data) => {
    const jsonStr = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportSalesBackup = async () => {
    try {
      setBusy(true);
      const [sales, saleItems, refunds] = await Promise.all([
        sbSelect('sales', { select: '*', order: { column: 'sold_at', ascending: false } }),
        sbSelect('sale_items', { select: '*', order: { column: 'id', ascending: true } }),
        sbSelect('refunds', { select: '*', order: { column: 'time', ascending: false } }),
      ]);
      exportToJson('sales-backup.json', {
        version: 1,
        exportedAt: new Date().toISOString(),
        sales: sales || [],
        saleItems: saleItems || [],
        refunds: refunds || [],
      });
      showToast('Sales backup downloaded.');
    } catch (e) {
      showToast(e?.message || 'Supabase request failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleTestSupabase = async () => {
    try {
      setBusy(true);
      await sbSelect('products', { select: 'code', limit: 1 });
      showToast('Supabase connected.');
    } catch (e) {
      const msg = String(e?.message || '').trim();
      if (msg === 'SUPABASE_CONFIG_MISSING') {
        showToast('Supabase 설정이 없습니다. .env에 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY를 넣어주세요.');
      } else {
        showToast(msg || 'Supabase request failed.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page-root">
      <div className="page-header">
        <div>
          <div className="page-title">Settings</div>
          <div className="page-subtitle">Exports (Supabase).</div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <section className="page-card space-y-3">
          <div className="font-semibold text-sm text-[var(--gold-soft)]">Supabase</div>
          <div className="text-sm text-[var(--text-muted)]">
            Host: {cfg.host || '-'} · Key: {cfg.hasAnonKey ? 'set' : 'missing'} · Type:{' '}
            {cfg.keyType} · Len: {cfg.keyLength}
          </div>
          <Button variant="outline" size="sm" onClick={handleTestSupabase} disabled={busy}>
            Test connection
          </Button>
        </section>

        <section className="page-card space-y-3">
          <div className="font-semibold text-sm text-[var(--gold-soft)]">Export</div>
          <Button variant="outline" size="sm" onClick={handleExportProducts} disabled={busy}>
            Download product list CSV
          </Button>
        </section>

        <section className="page-card space-y-3">
          <div className="font-semibold text-sm text-[var(--gold-soft)]">Sales</div>
          <Button variant="outline" size="sm" onClick={handleExportSalesBackup} disabled={busy}>
            Download sales backup JSON
          </Button>
        </section>
      </div>
    </div>
  );
}
