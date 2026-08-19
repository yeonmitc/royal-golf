# Royal Golf `/analyze`·`/profit`·`/report` 매출 제외·커미션·현금 할인 계산 수정 명세

## 1. 목적

이 문서는 Royal Golf 프로젝트의 `/analyze`, `/profit`, `/report` 페이지에서 매출, 할인, 가이드 커미션 및 순이익을 정확하게 계산하고 표시하기 위한 Trae 구현 명세이다.

핵심 원칙은 다음과 같다.

1. `sales.price`는 고객에게 실제로 받은 판매금액이다.
2. Peter, Kakao, Mr.Moon의 현금 할인은 이미 `price`에 반영되어 있으므로 손익에서 다시 차감하지 않는다.
3. 일반 가이드와 로컬 가이드 커미션은 `price`와 별도로 지급하므로 순이익 계산에서 차감한다.
4. `/analyze`의 표시용 `Total Commission`에는 일반 가이드와 로컬 가이드 커미션만 합산한다.
5. 직원은 커미션을 받지 않는다.
6. Ella 관련 판매와 지정 제외 코드는 `/analyze`, `/profit`, `/report`의 모든 판매 기반 집계에서 제외한다.
7. 실제 지급한 정산금이나 현재 미정산금은 `/analyze`에 표시하지 않는다.

---

## 2. 현재 관련 파일

- 화면: `src/pages/AnalyzePage.jsx`
- 수익 화면: `src/pages/ProfitPage.jsx`
- 월별 리포트: `src/pages/ReportPage.jsx`
- 분석 계산: `src/features/sales/salesApiSupabase.js`
- API 선택 및 오프라인 폴백: `src/features/sales/salesApiClient.js`
- 라우트: `src/App.jsx`

`/analyze`는 `AdminRoute` 안에 있으므로 관리자 전용 페이지 상태를 유지한다.

---

## 3. 확정된 대상별 정책

| 대상 | 유형 | 현금 할인 표시 | 커미션 | `/analyze`의 `Total Commission` 포함 | 순이익에서 커미션 차감 |
|---|---|---:|---:|---|---|
| 일반 가이드 | `regular` | 없음 | 정책에 따라 10% 또는 20% | 포함 | 차감 |
| 로컬 가이드 | `local` | 없음 | 모든 상품 10% | 포함 | 차감 |
| 직원 | `employee` | 기본 없음 | 0% | 제외 | 차감 없음 |
| Peter | `employee` | 20% | 0% | 제외 | 커미션 차감 없음 |
| Ella | `employee` | 집계 제외 | 집계 제외 | 제외 | 전체 분석 제외 |
| Mr.Moon | 현금 할인 대상 | 10% | 0% | 제외 | 커미션 차감 없음 |
| Kakao | 할인 판매 구분 | 10% | 0% | 제외 | 커미션 차감 없음 |

### 3.1 일반 가이드 커미션

기준 시간대는 `Asia/Manila`이다.

- `2026-08-13 00:00:00` 이전 판매: 모든 상품 10%
- `2026-08-13 00:00:00`부터 판매:
  - 상품 코드의 type 부분이 `TP`, `BT`, `DR`: 20%
  - 그 외 상품: 10%

상품 코드 예시가 `LM-TP-TM-WH-01`이면 두 번째 코드 조각 `TP`를 type으로 사용한다.

### 3.2 로컬 가이드 커미션

- 판매일과 상품 종류에 관계없이 실제 판매금액의 10%
- 같은 로컬 가이드는 동일한 `guide_id`를 재사용하여 누적한다.

### 3.3 직원

- 모든 직원 커미션은 0%
- Peter와 Ella도 직원 유형이므로 커미션은 0%
- 일반 직원과 Peter의 판매는 매출 분석에 포함한다.
- Ella가 선택된 판매그룹은 예외적으로 `/analyze`, `/profit`, `/report`의 모든 판매 기반 집계에서 제외한다.

### 3.4 Mr.Moon

- 현금 할인 표시율: 10%
- 커미션: 0%
- 가이드 포인트 적립 및 정산 대상에서 제외
- `/analyze`에서는 `Mr. Moon Discount (10%)` 총할인 금액만 표시
- `/profit`과 `/report`에서 Mr.Moon 커미션을 차감하지 않음

기존 DB에 Mr.Moon의 `fixed_commission_rate = 0.05`가 저장되어 있다면 반드시 제거한다.

```sql
UPDATE public.guides
SET commission_enabled = false,
    fixed_commission_rate = NULL
WHERE lower(regexp_replace(trim(name), '\s+', '', 'g')) LIKE '%mrmoon%';
```

커미션 계산 함수는 `commission_enabled = false`를 가장 먼저 확인하여 Mr.Moon 커미션을 0으로 계산해야 한다. 마이그레이션 적용 후 Mr.Moon의 과거 판매그룹도 다시 계산하여 기존 `earn_from_sale` 적립을 제거한다. 이미 실제 지급을 완료한 과거 정산 기록은 자동 삭제하거나 임의 수정하지 말고 별도 확인 대상으로 남긴다.

---

## 4. 매출과 할인 계산 원칙

### 4.0 분석 대상에서 완전히 제외할 판매

다음 조건 중 하나라도 충족하는 판매행은 `/analyze`, `/profit`, `/report`의 분석 대상에서 완전히 제외한다.

1. 해당 `sale_group`에서 선택된 가이드/직원이 Ella인 경우
2. 상품 코드가 `SU-OT`로 시작하는 경우
3. 상품 코드를 `-`로 나눈 조각 중 정확히 `EA`인 조각이 있는 경우

권장 판별 예시:

```js
const normalizedCode = String(row.code || '').trim().toUpperCase();
const codeParts = normalizedCode.split('-').filter(Boolean);

const excludedFromAnalyze =
  row.isElla ||
  normalizedCode.startsWith('SU-OT') ||
  codeParts.includes('EA');
```

`EA`는 단순 문자열 부분 일치가 아니라 코드 조각의 정확한 값으로 판별한다. 예를 들어 `XX-EA-YY`는 제외하지만 `WEAR`처럼 문자 안에 우연히 `EA`가 들어간 값은 제외하지 않는다.

제외 범위:

- `Total Sales`
- `Total Sales - Guide Comm`
- `Cost`
- `Gross Profit`
- `Total Expense`를 제외한 판매 기반 수치
- `Net Profit`의 판매·원가·커미션 부분
- `Transactions`
- `AOV`
- 모든 할인 카드
- `Total Commission`
- `Sales by Guide`
- 카테고리·브랜드·성별·사이즈·타입·색상 분석
- Best/Worst 상품 분석
- 요일·시간대 분석
- CSV 및 Google Drive 내보내기 데이터

동일한 제외 범위를 `/profit`과 `/report`에도 적용한다.

- `/profit`: 총매출, 상품원가, 선물원가, 가이드 커미션, 매출이익, 순이익, 기간별 표와 그래프에서 제외
- `/report`: 월별 총매출, 상품원가, 선물원가, 가이드 커미션, 매출이익, 순수익, 최종순수익, KPI 카드, 월별 상세표와 추세 그래프에서 제외
- 제외 판매행에서 발생한 상품원가와 가이드 커미션도 함께 제외
- `expenses` 테이블에서 읽는 운영비·급여·물류비·부자재·사입비는 판매행 필터와 관계없이 기존 기간 기준으로 집계

`Total Expense`는 `expenses` 테이블의 기간별 집계이므로 위 판매 제외 조건과 관계없이 기존 방식대로 집계한다.

### 4.0.1 세 페이지 공통 필터 사용

제외 조건을 각 페이지에 복사하여 따로 구현하지 않는다. 공통 함수 또는 `getSalesSummaryRows()`의 공통 정규화 단계에서 한 번 적용한다.

```js
export function isExcludedRevenueSale(row) {
  const code = String(row?.code || '').trim().toUpperCase();
  const codeParts = code.split('-').filter(Boolean);

  return Boolean(row?.isElla) || code.startsWith('SU-OT') || codeParts.includes('EA');
}
```

다음 소비자가 모두 같은 필터 결과를 사용해야 한다.

```text
AnalyzePage / getAnalytics
ProfitPage / getSalesSummaryRows
ReportPage / buildMonthlyReport
CSV 및 Google Drive export
```

현재 `ReportPage`의 `if (row?.isElla) continue;`만으로는 부족하다. 공통 필터로 교체하여 `SU-OT`와 정확한 `EA` 코드 조각도 함께 제외한다.

### 4.1 총 실판매액

환불되지 않았고 사은품이 아니며 위 제외 조건에 해당하지 않는 판매행을 대상으로 계산한다.

```text
Total Sales = Σ(price × qty)
```

`price`는 할인 후 실제 받은 금액이다. Peter, Kakao 및 Mr.Moon 판매도 별도의 정상가가 아니라 실제 `price`를 총매출에 포함한다.

### 4.2 할인 표시액

할인액은 고정 할인율을 다시 총매출에 곱하여 추정하지 말고, 가능하면 판매 당시 저장된 `list_price`와 `price`의 실제 차액으로 계산한다.

```text
행 할인액 = max(list_price - price, 0) × qty
```

대상별 합계:

```text
Mr.Moon Discount = Mr.Moon 판매행의 행 할인액 합계
Peter Discount   = Peter 판매행의 행 할인액 합계
Kakao Discount   = Kakao 판매행의 행 할인액 합계
```

필수 조건:

- 환불된 행 제외
- 사은품 제외
- `price <= 0`인 행 제외
- `list_price`가 없거나 0이면 할인액 0으로 처리하고 임의로 정상가를 만들지 않음
- `list_price < price`이면 `max(..., 0)`에 따라 할인액 0
- 할인 카드는 분석용 표시일 뿐 손익에서 다시 차감하지 않음

### 4.3 이중 차감 금지

잘못된 계산:

```text
Total Sales - Peter Discount - Kakao Discount - Mr.Moon Discount
```

위 계산은 금지한다. 할인은 이미 `price`에 반영되어 있다.

올바른 처리:

```text
Total Sales = Σ(price × qty)
할인액 = 별도 분석 카드에만 표시
```

---

## 5. 커미션 계산 및 손익 반영

### 5.1 표시용 Total Commission

`/analyze`의 `Total Commission` 카드에는 다음 두 금액만 표시한다.

```text
Displayed Total Commission
= 일반 가이드 발생 커미션
+ 로컬 가이드 발생 커미션
```

다음은 표시용 `Total Commission`에서 제외한다.

- Mr.Moon
- 모든 직원
- Peter
- Ella
- Kakao
- 실제 지급한 정산금
- 관리자 수동 포인트 조정

### 5.2 손익 차감용 전체 발생 커미션

순이익 계산에서 차감하는 커미션은 일반 가이드와 로컬 가이드 발생 커미션뿐이다.

```text
Profit Commission Expense
= 일반 가이드 발생 커미션
+ 로컬 가이드 발생 커미션
```

중요: 커미션은 정산 지급 여부가 아니라 해당 판매에서 발생한 시점을 기준으로 비용 처리한다.

### 5.3 커미션 차감 후 판매액

```text
Sales After Commission
= Total Sales
- 일반 가이드 발생 커미션
- 로컬 가이드 발생 커미션
```

### 5.4 손익 계산식

```text
Gross Profit
= Total Sales - Cost

Net Profit
= Total Sales
- Cost
- Total Expense
- 일반 가이드 발생 커미션
- 로컬 가이드 발생 커미션
```

동일한 의미로 다음처럼 구현해도 된다.

```text
Net Profit
= Sales After Commission - Cost - Total Expense
```

### 5.5 정산금과 손익 분리

- 커미션 발생: 손익 비용
- 가이드에게 실제 지급: 현금 지급 및 미지급 커미션 감소
- 정산 지급액을 `Net Profit`에서 다시 차감하면 안 됨
- `/analyze`에는 `총 지급 정산금`, `현재 총 미정산금` 카드를 추가하지 않음

---

## 6. `/analyze` 요약 카드 변경

현재 요약 카드 구조를 유지하면서 할인 카드를 각각 별도로 표시한다.

필수 카드:

1. `Total Sales`
2. `Total Sales - Guide Comm`
3. `Cost`
4. `Gross Profit`
5. `Total Expense`
6. `Net Profit`
7. `Transactions`
8. `AOV`
9. `Mr. Moon Discount (10%)`
10. `Peter Discount (20%)`
11. `Kakao Discount (10%)`
12. `Total Commission`
13. `SoldAt Range`

`Rows` 카드는 제거한다.

### 6.1 카드별 의미

| 카드 | 의미 |
|---|---|
| `Total Sales` | 실제 받은 판매금액 합계 |
| `Total Sales - Guide Comm` | 실제 판매금액에서 일반·로컬 가이드 발생 커미션을 차감한 금액 |
| `Gross Profit` | 실제 판매금액에서 상품 원가만 차감 |
| `Net Profit` | 실제 판매금액에서 원가, 지출, 모든 지급 대상 발생 커미션을 차감 |
| `Mr. Moon Discount (10%)` | Mr.Moon 판매의 정상가와 실판매가 차이 |
| `Peter Discount (20%)` | Peter 판매의 정상가와 실판매가 차이 |
| `Kakao Discount (10%)` | Kakao 판매의 정상가와 실판매가 차이 |
| `Total Commission` | 일반 가이드 + 로컬 가이드 발생 커미션만 표시 |

카드 제목의 할인율은 정책 안내용이다. 금액은 실제 `list_price - price` 차액으로 집계한다.

---

## 7. `Sales by Guide` 처리

- 일반 가이드와 로컬 가이드 판매를 이름별로 합산한다.
- 수량, 실제 매출, 발생 커미션을 보여준다.
- Ella를 제외한 직원은 판매 분석에는 포함할 수 있지만 커미션은 0이어야 한다.
- Ella가 선택된 판매그룹은 이 표를 포함한 모든 분석에서 제외한다.
- Mr.Moon 커미션은 항상 0이며 이 표의 커미션 합계에 포함하지 않는다.
- Mr.Moon은 가이드 포인트 장부의 `earn_from_sale` 적립 대상이 아니다.
- 같은 이름 문자열 비교보다 `guide_id`와 `guide_type`을 기준으로 계산한다.

---

## 8. 구현 시 제거하거나 수정할 기존 로직

### 8.1 Ella 및 제외 코드 필터 보강

현재 Ella 판매를 제외하는 방향은 유지하되, 이름의 단순 부분 일치만 사용하지 말고 가능하면 Ella의 고정 `guide_id` 또는 직원 연결 ID로 식별한다.

또한 동일한 최초 필터 단계에서 다음 판매행도 함께 제외한다.

```text
code starts with `SU-OT`
OR code segments include exact `EA`
```

이 필터는 매출을 계산한 뒤 금액만 빼는 방식이 아니라 분석용 `rows`를 만들기 전에 한 번 적용한다. 그래야 거래 수, AOV, 원가, 상품 순위, 가이드 커미션과 모든 상세 테이블에서 동일하게 제외된다.

### 8.2 이름 하드코딩 최소화

현재 `mrmoon`, `peter`, `ella` 문자열 포함 여부로 정책을 결정하는 로직을 `guide_type`, 고정 연결 ID 또는 명시적인 판매 구분값 중심으로 변경한다.

최소한 분석 조회 시 `guides`에서 다음 필드를 가져와야 한다.

```text
id
name
guide_type
commission_enabled
fixed_commission_rate
employee_id
```

실제 DB 컬럼명이 다르면 현재 스키마에 맞게 조정한다.

### 8.3 10% fallback 금지

DB에 저장된 커미션이 0이라는 이유만으로 모든 가이드에게 자동으로 10%를 적용하면 안 된다.

```js
const fallback = subtotal * 0.1;
```

이 로직은 직원 0%, Mr.Moon 0%, 로컬 가이드 10%, 일반 가이드 10%/20% 정책을 구분할 수 있도록 교체한다.

가능하면 DB의 단일 커미션 계산 결과인 `sale_groups.guide_commission`을 발생 커미션의 기준으로 사용한다. 다만 값이 없을 때의 보정 계산도 동일한 정책 함수를 사용해야 한다.

### 8.4 할인 필드명 통일

`listPrice`, `listPricePhp`, `list_price`를 혼용하지 않는다. Supabase 원본 `list_price`를 분석용 행에 옮길 때 하나의 필드명으로 통일하고, 할인 계산에서 같은 필드를 사용한다.

---

## 9. 권장 summary 반환 필드

`getAnalytics()`가 반환하는 `summary`에 다음 값을 명확히 분리한다.

```js
summary: {
  realTotalSales,
  displayedGuideCommission, // regular + local
  profitCommissionExpense,  // regular + local
  netAmount,                // realTotalSales - profitCommissionExpense
  costAmount,
  grossProfit,
  expenseAmount,
  ownerProfit,
  mrMoonDiscountAmount,
  peterDiscountAmount,
  kakaoDiscountAmount,
  transactionCount,
  aov,
  sourceSoldAtMin,
  sourceSoldAtMax,
}
```

화면 연결:

```text
Total Commission             = displayedGuideCommission
Total Sales - Guide Comm     = netAmount
Net Profit                   = ownerProfit
Mr. Moon Discount (10%)      = mrMoonDiscountAmount
Peter Discount (20%)         = peterDiscountAmount
Kakao Discount (10%)         = kakaoDiscountAmount
```

---

## 10. 필터 공통 기준

모든 요약 수치는 각 페이지에서 선택한 기간을 사용하되, 세 페이지가 동일한 판매 제외 함수를 사용한다.

- 날짜 기준: `sold_at`
- 시간대: `Asia/Manila`
- 시작일: 해당 날짜 00:00 포함
- 종료일: 다음 날짜 00:00 미만
- Ella가 선택된 판매그룹 제외
- `SU-OT`로 시작하는 상품 코드 제외
- 코드 조각에 정확히 `EA`가 있는 상품 제외
- 환불 판매 제외
- 사은품은 매출·할인·커미션에서 제외
- 거래 수는 가능하면 `sale_group_id` 기준

---

## 11. 필수 테스트 시나리오

### 테스트 1: 일반 가이드, 기준일 이전

- 판매일: `2026-08-12 23:59 Asia/Manila`
- 실판매액: 1,000 PHP
- 상품: `TP`
- 기대 커미션: 100 PHP
- 표시용 Total Commission 포함
- Net Profit 계산에서 100 PHP 차감

### 테스트 2: 일반 가이드, 기준일 이후 의류

- 판매일: `2026-08-13 00:00 Asia/Manila`
- 실판매액: 1,000 PHP
- 상품 type: `TP`
- 기대 커미션: 200 PHP
- 표시용 Total Commission 포함
- Net Profit 계산에서 200 PHP 차감

### 테스트 3: 로컬 가이드

- 실판매액: 1,000 PHP
- 상품 type: `TP`
- 기대 커미션: 항상 100 PHP
- 표시용 Total Commission 포함

### 테스트 4: 직원 Ella

- 실판매액: 1,000 PHP
- 기대 결과: `/analyze`의 모든 판매 기반 집계에서 제외
- Total Sales 증가 없음
- Cost 증가 없음
- Transactions 증가 없음
- 상품·가이드·요일·시간대 분석에 표시되지 않음

### 테스트 5: Peter 현금 할인

- `list_price`: 1,000 PHP
- `price`: 800 PHP
- `qty`: 1
- Peter Discount: 200 PHP
- Total Sales: 800 PHP
- 커미션: 0 PHP
- 할인액 200 PHP를 Total Sales 또는 Net Profit에서 다시 차감하지 않음

### 테스트 6: Kakao 현금 할인

- `list_price`: 1,000 PHP
- `price`: 900 PHP
- `qty`: 2
- Kakao Discount: 200 PHP
- Total Sales: 1,800 PHP
- 커미션: 0 PHP
- 할인액을 다시 차감하지 않음

### 테스트 7: Mr.Moon

- `list_price`: 1,000 PHP
- `price`: 900 PHP
- `qty`: 1
- Mr.Moon Discount: 100 PHP
- Total Sales: 900 PHP
- Mr.Moon 커미션: 0 PHP
- 가이드 포인트 적립 없음
- Total Commission 증가 없음
- 할인액 100 PHP는 `/analyze`에만 표시하고 손익에서 다시 차감하지 않음

### 테스트 8: 혼합 판매

- 일반 가이드 커미션: 200 PHP
- 로컬 가이드 커미션: 100 PHP
- Mr.Moon 커미션: 0 PHP
- 기대 표시용 Total Commission: 300 PHP
- 기대 손익 차감 커미션: 300 PHP

### 테스트 9: 환불

- 환불된 Peter, Kakao, Mr.Moon 또는 가이드 판매
- 매출, 할인, 커미션 합계에서 모두 제외

### 테스트 10: 정산 이후

- 커미션을 가이드에게 실제 지급하여 현재 잔액이 0이 된 경우
- 과거 기간의 발생 커미션과 Net Profit은 변하지 않아야 함
- 지급 정산금을 Net Profit에서 다시 차감하지 않아야 함

### 테스트 11: `SU-OT` 제외 코드

- 상품 코드: `SU-OT-TEST-BK-01`
- 실판매액: 1,000 PHP
- 기대 결과: 모든 판매 기반 집계와 상세 분석에서 제외

### 테스트 12: `EA` 코드 조각 제외

- 상품 코드: `GA-OT-EA-WH-01`
- 실판매액: 1,000 PHP
- 기대 결과: 모든 판매 기반 집계와 상세 분석에서 제외
- 비교 코드 `GA-WEAR-XX-WH-01`은 `EA` 정확 일치 조각이 아니므로 이 규칙만으로 제외하지 않음

### 테스트 13: `/analyze`·`/profit`·`/report` 합계 일치

동일한 기간을 선택했을 때 세 페이지에서 다음 제외 결과가 동일해야 한다.

- Ella가 선택된 판매그룹 제외
- `SU-OT`로 시작하는 코드 제외
- 코드 조각에 정확히 `EA`가 있는 상품 제외
- 세 페이지 모두 동일한 포함 판매행의 `price × qty` 합계를 사용
- `/analyze`의 Total Sales, `/profit`의 총매출, `/report`의 해당 월 총매출이 같은 기간 기준으로 일치
- 제외 판매행의 상품원가와 가이드 커미션도 세 페이지 모두에서 집계되지 않음

---

## 12. 완료 기준

- [ ] Ella를 제외한 직원 판매는 Total Sales와 상세 분석에 포함된다.
- [ ] Ella가 선택된 판매그룹은 모든 판매 기반 집계에서 제외된다.
- [ ] `SU-OT`로 시작하는 상품 코드는 모든 판매 기반 집계에서 제외된다.
- [ ] 코드 조각에 정확히 `EA`가 있는 상품은 모든 판매 기반 집계에서 제외된다.
- [ ] `/analyze`, `/profit`, `/report`가 동일한 공통 제외 함수를 사용한다.
- [ ] 동일한 기간의 세 페이지 총매출이 일치한다.
- [ ] 제외 판매행의 원가와 커미션도 `/profit`과 `/report`에서 제외된다.
- [ ] 직원 커미션은 모두 0이다.
- [ ] Mr.Moon 커미션은 항상 0이다.
- [ ] Mr.Moon 판매로 가이드 포인트가 적립되지 않는다.
- [ ] Mr.Moon은 `Total Commission`, `/profit`, `/report`의 커미션 비용에 포함되지 않는다.
- [ ] `/analyze`에는 Mr.Moon 10% 총할인 금액만 표시된다.
- [ ] 일반 가이드와 로컬 가이드 커미션이 표시용 `Total Commission`에 합산된다.
- [ ] 일반 가이드와 로컬 가이드 커미션이 순이익에서 차감된다.
- [ ] `Mr. Moon Discount (10%)` 카드가 표시된다.
- [ ] `Peter Discount (20%)` 카드가 표시된다.
- [ ] `Kakao Discount (10%)` 카드가 표시된다.
- [ ] `Rows` 카드가 제거된다.
- [ ] 할인액은 `list_price - price`의 실제 차액으로 집계된다.
- [ ] 할인액이 Total Sales 또는 Net Profit에서 이중 차감되지 않는다.
- [ ] 정산 지급액이 Net Profit에 영향을 주지 않는다.
- [ ] 환불과 사은품이 매출·할인·커미션에서 제외된다.
- [ ] `Asia/Manila` 기준일 경계 테스트를 통과한다.

---

## 13. 최종 계산 요약

```text
Total Sales
= Σ(price × qty)

Displayed Total Commission
= Regular Guide Commission
+ Local Guide Commission

Profit Commission Expense
= Regular Guide Commission
+ Local Guide Commission

Total Sales - Guide Comm
= Total Sales - Profit Commission Expense

Gross Profit
= Total Sales - Cost

Net Profit
= Total Sales
- Cost
- Total Expense
- Profit Commission Expense
```

```text
Mr.Moon Discount = 표시만, 손익 재차감 금지
Peter Discount   = 표시만, 손익 재차감 금지
Kakao Discount   = 표시만, 손익 재차감 금지
```
