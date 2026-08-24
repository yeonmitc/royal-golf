# Ella 가이드 규칙

## 1. Ella의 성격

- Ella는 **가이드가 아닌 직원(employee)** 이다.
- 따라서 **커미션 0%** — 어떤 판매에도 커미션이 발생하지 않는다.
- 판매 Report, Analyze, Profit 페이지에서 Ella 매출은 **수익에서 제외**된다.
- 하지만 **Sales List(판매 목록)에는 정상적으로 표시**된다.

## 2. Ella 매출 제외 기준

`isExcludedRevenueSale()` 함수를 통해 다음 조건 중 하나라도 해당하면 수익 계산에서 제외:

| 조건 | 설명 |
|------|------|
| `isElla = true` | Ella가 가이드로 배정된 판매 |
| `SU-OT` 코드 시작 | 기타 상품 (SU-OT-) |
| `EA` 코드 포함 | Ella 전용 상품 코드 (예: XX-EA-XX-XX-XX) |

## 3. 자동 Ella 우선 배정 규칙

SalesTable에서 **가이드가 아직 배정되지 않은 판매**에 대해 다음 코드 패턴이면 **무조건 Ella가 최우선**으로 자동 배정된다:

| 코드 Prefix | 설명 | 우선순위 |
|-------------|------|---------|
| `SU-KR-` | 한국 의류 | Ella 1순위 |
| `SU-OT-` | 기타 상품 | Ella 1순위 |
| `SA` | SA 상품 | Ella 1순위 |
| 코드 중 `EA` 포함 | Ella 전용 코드 | Ella 1순위 |

> **핵심**: 다른 가이드가 선택되어 있더라도, 위 코드 패턴으로 시작하는 상품은 Ella가 우선이다.

## 4. SellPage 가이드 선택

- Ella는 SellPage의 가이드 드롭다운에서 **분홍색 배경**으로 표시된다.
- Ella 선택 시 **할인 없이 정상가**로 판매된다.
- 백엔드에서 가이드 이름으로 자동 판별하여 `isElla` 플래그 설정.

## 5. 관련 파일

| 파일 | 역할 |
|------|------|
| `src/features/guides/guideSelectOptions.js` | Ella를 드롭다운 옵션에 추가 |
| `src/features/sales/components/SalesTable.jsx` | 자동 Ella 우선 배정 로직 (`isEllaPriorityCode`) |
| `src/features/sales/salesApiSupabase.js` | `isExcludedRevenueSale()` — 수익 제외 필터 |
| `src/pages/SalesHistoryPage.jsx` | Ella 필터 토글 (하트 아이콘) |
| `src/pages/ProfitPage.jsx` | Ella 매출 별도 집계, 수익 계산에서 제외 |
