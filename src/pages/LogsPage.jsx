import Card from '../components/common/Card';
import LogsTable from "../features/logs/components/LogsTable";

export default function LogsPage() {
  return (
    <div className="page-root">
      <div className="page-header">
        <div>
          <div className="page-title">Logs</div>
          <div className="page-subtitle">판매/상품/재고 변경 내역을 조회합니다.</div>
        </div>
      </div>

      <Card title="System Logs">
        <LogsTable />
      </Card>
    </div>
  );
}
