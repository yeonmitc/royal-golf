export default function DataTable({
  columns = [],
  rows = [],
  emptyMessage = 'No data.',
  onRowClick,
  pagination, // { current, totalPages, onPageChange }
}) {
  if (!rows || rows.length === 0) {
    return <div className="text-sm text-[var(--text-muted)]">{emptyMessage}</div>;
  }

  return (
    <div className="flex flex-col gap-2">
      <table className="table">
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key} className={col.className || ''}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => {
            const clickable = row?.clickable !== false && !!onRowClick;
            return (
              <tr
                key={row.id || idx}
                className={`border-b ${clickable ? 'hover:bg-gray-50 cursor-pointer' : ''} ${row.className || ''}`}
                style={row.style}
                onClick={clickable ? () => onRowClick(row) : undefined}
              >
                {columns.map((col) => (
                  <td key={col.key} className={col.tdClassName || ''}>
                    {row[col.key]}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>

      {pagination && pagination.totalPages > 1 && (
        <div className="flex justify-center items-center gap-4 py-2">
          <button
            className="px-3 py-1 rounded border border-gray-300 disabled:opacity-50 hover:bg-gray-50"
            onClick={() => pagination.onPageChange(Math.max(1, pagination.current - 1))}
            disabled={pagination.current <= 1}
          >
            Prev
          </button>
          <span className="text-sm text-gray-600">
            Page {pagination.current} of {pagination.totalPages}
          </span>
          <button
            className="px-3 py-1 rounded border border-gray-300 disabled:opacity-50 hover:bg-gray-50"
            onClick={() => pagination.onPageChange(Math.min(pagination.totalPages, pagination.current + 1))}
            disabled={pagination.current >= pagination.totalPages}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
