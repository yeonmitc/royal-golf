import Card from '../components/common/Card';
import LogsTable from "../features/logs/components/LogsTable";

export default function LogsPage() {
  return (
    <div className="page-root">
      <div className="page-header">
        <div>
          <div className="page-title">Logs</div>
          <div className="page-subtitle">View sales/product/inventory change logs.</div>
        </div>
      </div>

      <Card title="System Logs">
        <LogsTable />
      </Card>
    </div>
  );
}
