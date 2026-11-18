import codePartsSeed from '../../db/seed/seed-code-parts.json';

export function brandFromCode(code) {
  const parts = String(code || '').split('-');
  const brandCode = String(parts[2] || '').trim();
  if (!brandCode) return '';
  const hit = (codePartsSeed.brand || []).find((item) => item.code === brandCode);
  const label = String(hit?.label || brandCode).trim();
  return label === 'NoBrand' ? 'nobrand' : label;
}

export function formatSoldAtParts(iso) {
  const value = String(iso || '').trim();
  if (!value) return { date: '', time: '' };
  const dateHit = value.match(/\d{4}-\d{2}-\d{2}/);
  const timeHit = value.match(/[T\s](\d{2}:\d{2})/);
  const date = dateHit ? dateHit[0] : '';
  const time = timeHit ? timeHit[1] : '';
  if (!date) return { date: value, time: '' };

  const [year, month, day] = date.split('-').map(Number);
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][
    new Date(Date.UTC(year, (month || 1) - 1, day || 1)).getUTCDay()
  ];
  return {
    date: `${String(month || '').padStart(2, '0')}-${String(day || '').padStart(2, '0')} ${weekday}`.trim(),
    time,
  };
}

export function formatSaleCopyLine({ soldAt, code, sizeDisplay, color, qty, price }) {
  const { date, time } = formatSoldAtParts(soldAt);
  return [
    date ? `\u200B${date}` : '',
    time,
    code,
    sizeDisplay,
    color || '',
    qty,
    brandFromCode(code),
    Number(price || 0).toLocaleString('en-US'),
  ].filter(Boolean).join('\t');
}

export async function copyTextToClipboard(text) {
  const value = String(text || '').trim();
  if (!value) throw new Error('Nothing to copy.');
  try {
    if (!navigator.clipboard?.writeText) throw new Error('Clipboard API unavailable.');
    await navigator.clipboard.writeText(value);
  } catch {
    const textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    try {
      textarea.select();
      if (!document.execCommand('copy')) throw new Error('Clipboard copy failed.');
    } finally {
      textarea.remove();
    }
  }
}
