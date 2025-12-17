// src/pages/SettingsPage.jsx
import Button from '../components/common/Button';
import db from '../db/dexieClient';
import { resetFromSeed, seedIfEmpty } from '../db/seedLoader';
import { exportToCsv } from '../utils/csvExport';

export default function SettingsPage() {
  const handleSeed = async () => {
    await seedIfEmpty();
    alert('Seed data prepared.');
  };

  const handleReset = async () => {
    if (!window.confirm('Delete all data and reload seed data?')) return;
    await resetFromSeed();
    alert('Database has been reset.');
  };

  const handleExportProducts = async () => {
    const rows = await db.products.toArray();
    const header = ['code', 'nameKo', 'salePricePhp', 'totalStock'];
    const csvRows = [header].concat(
      rows.map((p) => [p.code, p.nameKo, p.salePricePhp, p.totalStock])
    );
    exportToCsv('products.csv', csvRows);
  };

  return (
    <div className="page-root">
      <div className="page-header">
        <div>
          <div className="page-title">Settings</div>
          <div className="page-subtitle">Manage initial data load, reset, and export.</div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <section className="page-card space-y-3">
          <div className="font-semibold text-sm text-[var(--gold-soft)]">Database</div>
          <Button variant="primary" size="sm" onClick={handleSeed}>
            Load seed data if empty
          </Button>
          <Button variant="outline" size="sm" onClick={handleReset}>
            Reset all (caution)
          </Button>
        </section>

        <section className="page-card space-y-3">
          <div className="font-semibold text-sm text-[var(--gold-soft)]">Export</div>
          <Button variant="outline" size="sm" onClick={handleExportProducts}>
            Download product list CSV
          </Button>
        </section>
      </div>
    </div>
  );
}
