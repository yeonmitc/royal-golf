// src/utils/formatters.js

export function formatPhp(amount) {
  return amount?.toLocaleString('en-PH', {
    style: 'currency',
    currency: 'PHP',
  });
}

export function formatCny(amount) {
  return amount?.toLocaleString('zh-CN', {
    style: 'currency',
    currency: 'CNY',
  });
}

export function upper(str) {
  return str ? String(str).toUpperCase() : '';
}
