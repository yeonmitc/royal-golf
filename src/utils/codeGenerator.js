// src/utils/codeGenerator.js

/**
 * seed-code-parts 기준
 * { category1, category2, type, brand, color, serial }
 */
export function generateProductCode({ category1, category2, type, brand, color, serial }) {
  if (!category1 || !category2 || !type || !brand || !color || !serial) return '';

  return `${category1}${category2}-${type}-${brand}-${color}-${serial}`;
}
