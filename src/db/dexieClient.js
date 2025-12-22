// src/db/dexieClient.js
import Dexie from 'dexie';

export const db = new Dexie('royalInventoryDB');

/**
 * version(1) - 최종 정규화 스키마
 *
 * 🧱 products
 *  - code: 제품코드 (PK, 예: GM-TP-AC-BK-01)
 *  - nameKo: 제품 한글 이름
 *  - categoryCode / genderCode / typeCode / brandCode / colorCode / modelNo
 *  - priceCny: 위안화 원가
 *  - basePricePhp: 기준 필리핀 금액 (seed-products-expanded.json 기준)
 *  - salePricePhp: 실제 판매가(페소 3배)  ← products.json 의 "페소 3배"에서 계산
 *  - totalStock: 모든 사이즈 재고 합
 *
 * 🧱 inventory
 *  - id: auto PK
 *  - code + size: 유니크 조합 (예: GM-TP-AC-BK-01 / M)
 *  - sizeDisplay: "M(50)" / "L(32)" / "Free" 등 (이미 seed-inventory.json 에 있음)
 *  - stockQty: 해당 사이즈 재고
 *  - location: 남자 상의 / 여자 하의 / 악세사리 등 (있으면 사용)
 *
 * 🧱 codeParts
 *  - group: 'category' | 'gender' | 'type' | 'brand' | 'color'
 *  - code: 실제 코드값 (G, M, TP, AC, BK …)
 *  - labelKo: 화면에 보여줄 이름
 *
 * 🧱 sales / saleItems
 *  - 장바구니 결제/즉시판매 시 기록용
 */

db.version(1).stores({
  // 제품 마스터: code = PK
  products: [
    '&code',
    'nameKo',
    'categoryCode',
    'genderCode',
    'typeCode',
    'brandCode',
    'colorCode',
    'modelNo',
    'priceCny',
    'basePricePhp',
    'salePricePhp',
    'totalStock',
  ].join(','),

  // 사이즈별 재고
  inventory: [
    '++id',
    'code',
    'size',
    '[code+size]', // 바코드/코드+사이즈 검색용
    'sizeDisplay',
    'stockQty',
    'location',
  ].join(','),

  // 코드표
  codeParts: ['++id', 'group', 'code', 'labelKo'].join(','),

  // 판매 헤더
  sales: [
    '++id',
    'soldAt', // ISO string
    'totalAmount', // 총 판매 금액 (PHP)
    'itemCount', // 판매된 총 수량
  ].join(','),

  // 판매 상세 (한 줄 = 장바구니 한 아이템)
  saleItems: ['++id', 'saleId', 'code', 'size', 'qty', 'unitPricePhp'].join(','),
});

// v2: 운영 로그 테이블 추가
// logs: 각종 이벤트 기록용 (판매/상품 추가/삭제/재고 수정 등)
// 인덱스: type, time, code
db.version(2).stores({
  logs: ['++id', 'type', 'time', 'code'].join(','),
});

// v3: 할인 단가 저장을 위한 필드 추가
db.version(3).stores({
  saleItems: ['++id', 'saleId', 'code', 'size', 'qty', 'unitPricePhp', 'discountUnitPricePhp'].join(
    ','
  ),
});

// v4: 환불 테이블 추가
db.version(4).stores({
  refunds: [
    '++id',
    'saleId',
    'code',
    'size',
    'qty',
    'amountPhp',
    'reason',
    'time',
  ].join(','),
});

export default db;
