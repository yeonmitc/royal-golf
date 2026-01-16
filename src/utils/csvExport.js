export function exportToTsv(filename, rows) {
  const processRow = (row) =>
    row.map((cell) => String(cell ?? '').replace(/[\t\r\n]/g, ' ')).join('\t');
  const tsvContent = rows.map(processRow).join('\n');
  const blob = new Blob([tsvContent], { type: 'text/tab-separated-values;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function exportToCsv(filename, rows) {
  return exportToTsv(filename, rows);
}
