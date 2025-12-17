// src/utils/csvExport.js

export function exportToCsv(filename, rows) {
  const processRow = (row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',');

  const csvContent = rows.map(processRow).join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');

  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
