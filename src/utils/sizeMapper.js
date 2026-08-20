/**
 * 🧵 Size Mapper Utility (size-mapping-and-db-sync-spec.md 기반)
 * 제품 코드 Prefix별 동적 사이즈 옵션 & UI 표시 라벨 매핑
 *
 * Prefix 규칙:
 *  - GM-TP        : 남성 빅사이즈 X (M ~ 2XL + Free)
 *  - LM-TP        : 남성 빅사이즈 O (M ~ 8XL + Free)
 *  - GW-TP / LW-TP : 여성 상의 (S ~ 2XL + Free)
 *  - GM-BT / LM-BT : 남성/여성 하의/바지 (S ~ 4XL + Free)
 *  - GM-GG        : 남성 장갑 (S ~ 2XL)
 *  - GW-GG        : 여성 장갑 (S ~ XL)
 *  - 그 외 전체   : Default (S ~ 3XL + Free)
 */

const SIZE_MAPS = Object.freeze({
  MENS_TOP_SMALL: [
    { key: 'M', label: 'M (95)' },
    { key: 'L', label: 'L (100)' },
    { key: 'XL', label: 'XL (105)' },
    { key: '2XL', label: '2XL (110)' },
    { key: 'Free', label: 'Free' },
  ],

  MENS_TOP_BIG: [
    { key: 'M', label: 'M (95)' },
    { key: 'L', label: 'L (100)' },
    { key: 'XL', label: 'XL (105)' },
    { key: '2XL', label: '2XL (110)' },
    { key: '3XL', label: '3XL (115)' },
    { key: '4XL', label: '4XL (120)' },
    { key: '5XL', label: '5XL (125)' },
    { key: '6XL', label: '6XL (130)' },
    { key: '7XL', label: '7XL (135)' },
    { key: '8XL', label: '8XL (140)' },
    { key: 'Free', label: 'Free' },
  ],

  WOMENS_TOP: [
    { key: 'S', label: 'S (90)' },
    { key: 'M', label: 'M (95)' },
    { key: 'L', label: 'L (100)' },
    { key: 'XL', label: 'XL (105)' },
    { key: '2XL', label: '2XL (110)' },
    { key: 'Free', label: 'Free' },
  ],

  PANTS: [
    { key: 'S', label: 'S (30~31)' },
    { key: 'M', label: 'M (32)' },
    { key: 'L', label: 'L (33)' },
    { key: 'XL', label: 'XL (34)' },
    { key: '2XL', label: '2XL (35~36)' },
    { key: '3XL', label: '3XL (37)' },
    { key: '4XL', label: '4XL (38)' },
    { key: 'Free', label: 'Free' },
  ],

  GLOVES_MENS: [
    { key: 'S', label: 'S (22)' },
    { key: 'M', label: 'M (23)' },
    { key: 'L', label: 'L (24)' },
    { key: 'XL', label: 'XL (25)' },
    { key: '2XL', label: '2XL (26)' },
  ],

  GLOVES_WOMENS: [
    { key: 'S', label: 'S (18)' },
    { key: 'M', label: 'M (19)' },
    { key: 'L', label: 'L (20)' },
    { key: 'XL', label: 'XL (21)' },
  ],

  DEFAULT: [
    { key: 'S', label: 'S' },
    { key: 'M', label: 'M' },
    { key: 'L', label: 'L' },
    { key: 'XL', label: 'XL' },
    { key: '2XL', label: '2XL' },
    { key: '3XL', label: '3XL' },
    { key: 'Free', label: 'Free' },
  ],
});

const SIZE_KEY_TO_COL = Object.freeze({
  S: 's',
  M: 'm',
  L: 'l',
  XL: 'xl',
  '2XL': '2xl',
  '3XL': '3xl',
  '4XL': '4xl',
  '5XL': '5xl',
  '6XL': '6xl',
  '7XL': '7xl',
  '8XL': '8xl',
  Free: 'free',
});

/**
 * 제품 코드(Prefix)에 맞는 사이즈 옵션 목록을 리턴합니다.
 * @param {string} productCode - 제품 코드 (예: 'GM-TP-xxxx', 'GW-GG-xxxx')
 * @returns {{key:string,label:string}[]} 사이즈 옵션 배열
 */
export function getSizeOptionsByCode(productCode) {
  const code = (productCode || '').toUpperCase();

  if (code.startsWith('GM-TP')) {
    return SIZE_MAPS.MENS_TOP_SMALL;
  }
  if (code.startsWith('LM-TP')) {
    return SIZE_MAPS.MENS_TOP_BIG;
  }
  if (code.startsWith('GW-TP') || code.startsWith('LW-TP')) {
    return SIZE_MAPS.WOMENS_TOP;
  }
  if (code.startsWith('GM-BT') || code.startsWith('LM-BT')) {
    return SIZE_MAPS.PANTS;
  }
  if (code.startsWith('GM-GG')) {
    return SIZE_MAPS.GLOVES_MENS;
  }
  if (code.startsWith('GW-GG')) {
    return SIZE_MAPS.GLOVES_WOMENS;
  }
  return SIZE_MAPS.DEFAULT;
}

/**
 * 개별 사이즈 키값을 제품군에 맞는 UI 표시 라벨로 변환합니다.
 * (못찾으면 원본 sizeKey 그대로 리턴 - 안전장치)
 * @param {string} productCode
 * @param {string} sizeKey - DB size_std 값 ('M', '2XL', '4XL', 'Free' 등)
 * @returns {string} 표시할 라벨 ('M (95)', 'S (22)' 등)
 */
export function formatSizeDisplay(productCode, sizeKey) {
  if (!sizeKey) return '';
  const options = getSizeOptionsByCode(productCode);
  const target = (sizeKey || '').toUpperCase();
  const found = options.find((opt) => opt.key.toUpperCase() === target);
  return found ? found.label : String(sizeKey);
}

/**
 * size_std 키값 → inventories 테이블 컬럼명 소문자 변환
 * ('M' → 'm', '2XL' → '2xl', 'Free' → 'free' 등)
 * @param {string} sizeKey
 * @returns {string} 컬럼명
 */
export function sizeKeyToColumn(sizeKey) {
  return SIZE_KEY_TO_COL[sizeKey] || String(sizeKey || '').toLowerCase();
}

/**
 * inventories 객체에서 특정 sizeKey에 해당하는 재고 수량을 가져옵니다.
 * @param {object} inventory - inventories row 객체 ({s,m,l,...total_qty})
 * @param {string} sizeKey - 가져올 사이즈 키 ('M','3XL','Free' 등)
 * @returns {number} 재고 수량
 */
export function getInventoryQtyBySize(inventory, sizeKey) {
  if (!inventory || !sizeKey) return 0;
  const col = sizeKeyToColumn(sizeKey);
  const v = inventory[col];
  return typeof v === 'number' ? v : v ? Number(v) || 0 : 0;
}

export default {
  getSizeOptionsByCode,
  formatSizeDisplay,
  sizeKeyToColumn,
  getInventoryQtyBySize,
};
