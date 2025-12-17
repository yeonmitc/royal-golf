export default function DataTable({ columns = [], rows = [], emptyMessage = 'No data.', onRowClick }) {
  if (!rows || rows.length === 0) {
    return <div className="text-sm text-[var(--text-muted)]">{emptyMessage}</div>;
  }

  return (
    <table className="table">
      <thead>
        <tr>
          {columns.map((col) => (
            <th key={col.key} className={col.className || ''}>{col.header}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, idx) => (
          <tr
            key={row.id || idx}
            className={`border-b hover:bg-gray-50 cursor-pointer ${row.className || ''}`}
            style={row.style}
            onClick={() => onRowClick && onRowClick(row)}
          >
            {columns.map((col) => (
              <td key={col.key} className={col.tdClassName || ''}>{row[col.key]}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
