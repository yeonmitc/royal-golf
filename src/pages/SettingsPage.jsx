// src/pages/SettingsPage.jsx
import Button from '../components/common/Button';
import db from '../db/dexieClient';
import { resetFromSeed, seedIfEmpty } from '../db/seedLoader';
import { exportToCsv } from '../utils/csvExport';
import { useToast } from '../context/ToastContext';

export default function SettingsPage() {
  const { showToast } = useToast();

  const handleSeed = async () => {
    await seedIfEmpty();
    showToast('Seed data prepared.');
  };

  const handleReset = async () => {
    if (!window.confirm('Delete all data and reload seed data?')) return;
    await resetFromSeed();
    showToast('Database has been reset.');
  };

  const handleExportProducts = async () => {
    const rows = await db.products.toArray();
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

  const handleExportSeedData = async () => {
    if (!window.confirm('Download current data as JSON files (products.json, seed-products-expanded.json)?')) return;

    // 1. Prepare products.json
    const products = await db.products.toArray();
    // Sort by code or some criteria if needed
    products.sort((a, b) => a.code.localeCompare(b.code));
    
    const productsJson = products.map((p, idx) => ({
      "No": idx + 1,
      "Code": p.code,
      "Stock": p.totalStock,
      "Price": p.salePricePhp
    }));

    // 2. Prepare seed-products-expanded.json
    const inventory = await db.inventory.toArray();
    // Sort to make it consistent
    inventory.sort((a, b) => {
      if (a.code !== b.code) return a.code.localeCompare(b.code);
      return (a.sizeDisplay || '').localeCompare(b.sizeDisplay || '');
    });

    const expandedJson = inventory.map((inv, idx) => ({
      code: inv.code,
      size: inv.sizeDisplay || inv.size,
      stockQty: inv.stockQty,
      rowNo: idx + 1
    }));

    exportToJson('products.json', productsJson);
    setTimeout(() => {
      exportToJson('seed-products-expanded.json', expandedJson);
    }, 500); // Delay to ensure both download
    
    showToast('Seed data files downloaded.');
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
          <Button variant="outline" size="sm" onClick={() => setIsResetModalOpen(true)}>
            Reset all (caution)
          </Button>
        </section>

        <section className="page-card space-y-3">
          <div className="font-semibold text-sm text-[var(--gold-soft)]">Export</div>
          <Button variant="outline" size="sm" onClick={handleExportProducts}>
            Download product list CSV
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportSeedData}>
            Download Seed JSONs (for backup)
          </Button>
        </section>
      </div>

      <Modal
        open={isResetModalOpen}
        title="Reset Database"
        onClose={() => setIsResetModalOpen(false)}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setIsResetModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleReset}>
              Confirm Reset
            </Button>
          </div>
        }
      >
        <p>Delete all data and reload seed data? This action cannot be undone.</p>
      </Modal>
    </div>
  );
}
