# Royal Golf `/sell` 추가 수정 명세

## 1. 적용 범위

이 문서는 새롭게 추가할 다음 변경사항만 다룬다.

1. Local Guide 모달의 Select 문구 및 기존 로컬 가이드 재사용
2. Mr.Moon·Peter·Kakao 현금 할인 표시와 기존 할인 계산 유지
3. `/guides` 목록에서 직원 제외 및 Mr.Moon 표시값 0 고정
4. 일반·로컬 가이드의 부분 정산 및 정산 완료 기능
5. Peter·Ella·Mr.Moon 판매 커미션과 포인트 적립 완전 제외

`/analyze`, `/profit`, `/report` 관련 내용은 이 문서의 범위가 아니다.

---

## 2. Local Guide Select 기본 옵션 문구 변경

### 2.1 변경할 문구

다른 라벨이나 버튼 문구는 수정하지 않는다. 드롭다운의 기본 옵션 한 개만 변경한다.

```text
기존: -- New Local Guide --
변경: Select Existing Local Guide
```

화면:

```text
LOCAL GUIDE

[ Select Existing Local Guide ▼ ]

Local Guide Name
[ Enter name                ]

[ Cancel ] [ Save ]
```

### 2.2 Select 데이터

- Select에는 `guide_type='local'`인 기존 로컬 가이드만 표시한다.
- 일반 가이드와 직원은 표시하지 않는다.
- 기존 로컬 가이드는 이름순으로 정렬한다.
- 같은 이름이 중복 표시되지 않아야 한다.

### 2.3 저장 동작

#### 기존 로컬 가이드 선택

- 선택한 기존 `guide_id`를 그대로 재사용한다.
- 새 가이드 레코드를 만들지 않는다.
- 같은 로컬 가이드의 판매와 커미션이 계속 한 계정에 누적되어야 한다.
- 신규 이름 입력칸은 숨기거나 비활성화한다.

#### 새 로컬 가이드 추가

- Select가 기본값 `Select Existing Local Guide`인 상태에서 이름을 입력하면 새 로컬 가이드 추가로 처리한다.
- 공백을 제거하고 이름을 정규화하여 저장한다.
- 정규화된 같은 이름의 로컬 가이드가 이미 있으면 새 레코드를 생성하지 않는다.
- 기존 `guide_id`를 찾아 재사용한다.
- 정말 존재하지 않을 때만 `guide_type='local'`로 새로 생성한다.

### 2.4 커미션

- 로컬 가이드는 전 상품 실제 판매금액의 10%
- 판매일과 상품 종류에 관계없이 10%
- 동일 로컬 가이드는 동일한 `guide_id`로 계속 누적

---

## 3. Guide Select 현금 할인 문구 수정

현재 `Mr.Moon (5%)` 표시는 잘못된 커미션 표현이다.

| 잘못된 표시 | 올바른 표시 |
|---|---|
| `Mr.Moon (5%)` | `Mr.Moon (10% Cash Discount)` |
| 일반 목록의 `Peter` | `Peter (20% Cash Discount)` |
| `Kakao (10%)` | `Kakao (10% Cash Discount)` |

정책:

- Mr.Moon: 10% 현금 할인, 커미션 0%
- Peter: 20% 현금 할인, 커미션 0%
- Kakao: 10% 현금 할인, 커미션 0%
- Mr.Moon, Peter, Ella는 가이드 커미션과 판매 포인트 적립 없음

커미션 계산 함수는 Peter, Ella, Mr.Moon을 가장 먼저 판별하여 무조건 0을 반환해야 한다. 일반 가이드 10%/20% 계산보다 우선한다.

```text
Peter   → commission 0
Ella    → commission 0
Mr.Moon → commission 0
```

---

## 4. 기존 현금 할인 계산 유지

새 할인식을 만들지 않는다. 기존 `/sell`의 계산 규칙을 그대로 유지한다.

### 4.1 공통 기준

- 정상가가 1,000 PHP 이하이면 할인하지 않는다.
- 정상가가 1,000 PHP를 초과하면 대상별 할인율을 적용한다.
- 할인 후 금액을 100 PHP 단위로 올림한다.
- `list_price`에는 할인 전 정상가를 저장한다.
- `price`에는 할인 후 실제 받은 금액을 저장한다.

### 4.2 계산 함수

```js
function calculateCashDiscountPrice(originalPrice, discountType) {
  const price = Number(originalPrice || 0);

  if (price <= 1000) return price;

  if (discountType === 'peter') {
    return Math.ceil((price * 0.8) / 100) * 100;
  }

  if (discountType === 'mrmoon' || discountType === 'kakao') {
    return Math.ceil((price * 0.9) / 100) * 100;
  }

  return price;
}
```

### 4.3 계산 예시

| 정상가 | 대상 | 할인 계산 | 최종 `price` |
|---:|---|---|---:|
| 1,000 | Mr.Moon | 할인 없음 | 1,000 |
| 1,100 | Mr.Moon | 990 → 100단위 올림 | 1,000 |
| 1,800 | Mr.Moon | 1,620 → 100단위 올림 | 1,700 |
| 1,000 | Peter | 할인 없음 | 1,000 |
| 1,100 | Peter | 880 → 100단위 올림 | 900 |
| 1,800 | Peter | 1,440 → 100단위 올림 | 1,500 |
| 1,800 | Kakao | 1,620 → 100단위 올림 | 1,700 |

### 4.4 동일 계산 보장

다음 위치가 모두 같은 함수를 사용해야 한다.

- 장바구니 표시가격
- 결제 총액
- 영수증
- DB에 저장되는 `sales.price`

프런트엔드 표시 후 DB 저장 단계에서 다른 할인식을 다시 적용하면 안 된다.

---

## 5. `/guides` 직원 제외 및 Mr.Moon 표시값

`/guides`는 커미션과 정산을 관리하는 화면이므로 `guide_type='employee'`인 직원은 목록에서 완전히 제외한다.

필수 변경:

- `Employee` 필터 탭 제거
- `All` 조회 결과에서도 직원 제외
- Peter와 Ella는 직원이므로 `/guides`의 어떤 필터에서도 표시하지 않음
- 직원의 실제 장부와 감사 이력은 삭제하거나 0으로 덮어쓰지 않음
- 직원 제외는 프런트엔드 표시용 목록뿐 아니라 `/guides` 조회 단계에서도 적용

Mr.Moon은 직원은 아니지만 커미션 대상이 아니므로 목록에 남기고 다음처럼 표시한다.

| 열 | Mr.Moon 표시값 |
|---|---:|
| `Rate` | `0` |
| `Balance` | `0` |

예시:

```text
Peter  → 목록에서 제외
Ella   → 목록에서 제외
Mr.Moon Guide  Rate 0  Balance 0
```

표시 처리 예시:

```js
const visibleGuides = guides.filter(
  (guide) => guide.guide_type !== 'employee'
);

const normalizedName = String(guide.name || '').toLowerCase().replace(/[\s.]/g, '');
const isMrMoon = normalizedName.includes('mrmoon');

const displayRate = isMrMoon ? '0' : getGuideRateLabel(guide);
const displayBalance = isMrMoon ? 0 : Number(guide.balance || 0);
```

중요:

- 실제 `guide_point_ledger` 데이터는 수정하거나 삭제하지 않는다.
- 실제 Balance를 DB에서 0으로 덮어쓰지 않는다.
- 음수 장부도 감사 이력으로 그대로 보존한다.
- Peter와 Ella의 과거 수동조정·정산 감사 이력은 보존하고 목록에서만 제외한다.
- Mr.Moon의 기존 `earn_from_sale` 판매 커미션 적립은 아래 데이터 정리 기준에 따라 제거한다.
- 일반 가이드와 로컬 가이드의 Rate 및 Balance는 실제 값을 계속 표시한다.

### 5.1 실제 커미션 데이터 정리

Mr.Moon은 현금 할인 대상이며 커미션 대상이 아니므로, 과거 판매에서 생성된 Mr.Moon의 `earn_from_sale` 장부는 제거하거나 판매그룹을 0%로 재계산해야 한다.

필수 처리:

1. Mr.Moon의 `commission_enabled=false`
2. Mr.Moon의 `fixed_commission_rate=NULL`
3. Mr.Moon 판매그룹의 `guide_commission=0`, `guide_rate=0`
4. Mr.Moon의 `reason='earn_from_sale'` 장부 제거
5. 이후 판매·가격·환불 변경에서도 Mr.Moon 적립 재생성 금지
6. Peter와 Ella도 `earn_from_sale` 신규 생성 금지

기존 정산 지급 기록이나 관리자 수동조정 기록은 감사 이력이므로 임의 삭제하지 않는다.

---

## 6. `/guides` 부분 정산 및 정산 완료

일반 가이드와 로컬 가이드 행의 `Action`에 다음 버튼을 표시한다.

```text
[ Edit Points ] [ 부분 정산 ] [ 정산 완료 ]
```

### 6.1 버튼 표시 대상

| 대상 | Edit Points | 부분 정산 | 정산 완료 |
|---|---:|---:|---:|
| 일반 가이드 | 표시 | 표시 | 표시 |
| 로컬 가이드 | 표시 | 표시 | 표시 |
| Mr.Moon | 표시 | 숨김 | 숨김 |
| 직원 Peter·Ella | 목록 자체에서 제외 | 제외 | 제외 |

- 잔액이 0 이하인 일반·로컬 가이드는 두 정산 버튼을 비활성화한다.
- `부분 정산`은 노란색 또는 골드 아웃라인 버튼으로 표시한다.
- `정산 완료`는 오지급 방지를 위해 빨간색 버튼으로 표시한다.
- `Edit Points`는 관리자 수동조정 용도이며 정산 처리에 사용하지 않는다.

### 6.2 부분 정산

`부분 정산` 클릭 시 모달을 열고 다음 값을 보여준다.

- 가이드 이름
- 현재 Balance
- 정산 후 남길 Balance
- 실제 지급액: `현재 Balance - 정산 후 남길 Balance`
- 지급 방법
- 메모
- 지급일시

검증:

- 정산 후 Balance는 0 이상이고 현재 Balance보다 작아야 한다.
- 지급액은 반드시 0보다 커야 한다.
- 저장 시 현재 화면의 Balance도 함께 전달하여 동시 수정 여부를 검증한다.

저장은 기존 RPC를 사용한다.

```text
settle_guide_commission_to_balance(
  p_guide_id,
  p_target_balance,
  p_expected_current_balance,
  p_payment_method,
  p_note,
  p_paid_at
)
```

### 6.3 정산 완료

`정산 완료` 클릭 시 확인 창에 가이드 이름과 전액 지급액을 표시한다. 확인 후 기존 RPC를 호출한다.

```text
settle_all_guide_commission(
  p_guide_id,
  p_payment_method,
  p_note,
  p_paid_at
)
```

완료 결과:

- 정산 직전 Balance 전액을 지급액으로 기록
- 정산 후 Balance는 0
- 발생 커미션 원장인 `earn_from_sale`은 삭제하거나 수정하지 않음
- `guide_commission_settlements`에 정산 기록 생성
- `guide_point_ledger`에 `reason='commission_payout'`인 음수 장부 생성

### 6.4 정산 이력 및 화면 갱신

부분 정산과 정산 완료 모두 하단 `Settlement History`에 다음 정보를 표시한다.

- 지급일시
- 가이드 이름과 유형
- 정산 전 Balance
- 지급액
- 정산 후 Balance
- 지급 방법
- 메모

성공 후 가이드 Balance와 정산 이력 쿼리를 모두 새로고침한다. 실패하면 성공 메시지를 표시하지 말고 최신 Balance를 다시 조회한다.

---

## 7. 테스트

### 테스트 1: 기존 로컬 가이드

- Select에서 기존 로컬 가이드를 선택
- 같은 `guide_id`가 저장됨
- 새 가이드 레코드가 생성되지 않음

### 테스트 2: 중복 이름

- 기존 이름과 공백·대소문자만 다른 이름 입력
- 중복 가이드 생성 없이 기존 `guide_id` 재사용

### 테스트 3: Select 대상

- 로컬 가이드만 표시
- 일반 가이드와 직원은 표시되지 않음

### 테스트 4: Mr.Moon 표시

- `Mr.Moon (10% Cash Discount)`로 표시
- `Mr.Moon (5%)` 문구가 어디에도 남지 않음
- 커미션과 포인트 적립 0

### 테스트 5: Peter 표시

- `Peter (20% Cash Discount)`로 표시
- 커미션과 포인트 적립 0

### 테스트 6: 할인 경계

- 1,000 PHP: 할인 없음
- 1,001 PHP 이상: 할인 적용 후 100 PHP 단위 올림

### 테스트 7: 저장값 일치

- 장바구니, 결제 총액, 영수증, DB `price`가 동일
- DB `list_price`에는 정상가 저장

---

### 테스트 8: 직원 목록 제외

- `Employee` 탭이 표시되지 않음
- `All`, `Guide`, `Local Guide` 어디에도 Peter와 Ella가 표시되지 않음
- DB 장부 합계는 변경되지 않음

### 테스트 9: Mr.Moon 커미션 제거

- Mr.Moon 실제 기존 Balance가 `23,900`이어도 화면에는 `0`
- Mr.Moon Rate는 `10%/20%`나 `5%`가 아니라 `0`
- 신규 Mr.Moon 판매에서 `guide_commission=0`
- 신규 `earn_from_sale` 장부가 생성되지 않음
- 과거 Mr.Moon 판매 커미션 재계산 후 0
- 10% 현금 할인은 기존 규칙대로 유지

### 테스트 10: 부분 정산

- Balance 1,050인 가이드를 정산 후 Balance 400으로 부분 정산
- 지급액 650, 정산 전 1,050, 정산 후 400으로 이력 생성
- `commission_payout` 장부 `-650` 생성
- 기존 `earn_from_sale` 장부는 그대로 유지

### 테스트 11: 정산 완료

- Balance 730인 가이드를 정산 완료
- 지급액 730, 정산 후 Balance 0으로 이력 생성
- `commission_payout` 장부 `-730` 생성
- 화면 Balance가 즉시 0으로 갱신

### 테스트 12: 정산 제외 대상

- Mr.Moon 행에는 부분 정산과 정산 완료 버튼이 없음
- Peter와 Ella는 목록 자체에 없음
- Balance가 0 이하인 일반·로컬 가이드의 정산 버튼은 비활성화

---

## 8. 완료 기준

- [ ] 드롭다운 기본 옵션이 `Select Existing Local Guide`로 표시된다.
- [ ] `-- New Local Guide --` 문구가 제거된다.
- [ ] 다른 라벨과 버튼 문구는 변경되지 않는다.
- [ ] Select에 로컬 가이드만 표시된다.
- [ ] 기존 로컬 가이드 선택 시 동일 `guide_id`를 재사용한다.
- [ ] 중복 로컬 가이드가 생성되지 않는다.
- [ ] `Mr.Moon (10% Cash Discount)`로 표시된다.
- [ ] `Peter (20% Cash Discount)`로 표시된다.
- [ ] `Kakao (10% Cash Discount)`로 표시된다.
- [ ] `Mr.Moon (5%)` 문구가 제거된다.
- [ ] 1,000 PHP 이하 상품은 할인하지 않는다.
- [ ] 1,000 PHP 초과 상품은 기존 할인율 적용 후 100 PHP 단위로 올림한다.
- [ ] 장바구니·영수증·DB의 최종 판매가격이 일치한다.
- [ ] Mr.Moon·Peter·Kakao 커미션은 0이다.
- [ ] `/guides`에서 `Employee` 탭이 제거된다.
- [ ] Peter와 Ella는 `/guides` 목록에서 제외된다.
- [ ] Mr.Moon의 Rate와 Balance만 실제 값과 관계없이 `0`으로 표시된다.
- [ ] 일반·로컬 가이드 행에 `부분 정산`과 빨간색 `정산 완료` 버튼이 표시된다.
- [ ] 부분 정산은 목표 Balance와 실제 지급액을 기록한다.
- [ ] 정산 완료는 현재 Balance 전액을 지급하고 Balance를 0으로 만든다.
- [ ] 모든 정산은 정산 테이블과 `commission_payout` 장부에 이중 기록된다.
- [ ] 부분·완료 정산이 `Settlement History`에 표시된다.
- [ ] Mr.Moon에는 정산 버튼이 표시되지 않는다.
- [ ] Peter·Ella·Mr.Moon의 신규 판매 커미션은 0이다.
- [ ] Peter·Ella·Mr.Moon의 신규 `earn_from_sale` 장부가 생성되지 않는다.
- [ ] Mr.Moon의 기존 판매 커미션 적립이 0으로 정리된다.
- [ ] 직원의 실제 장부 데이터와 감사 이력은 변경되지 않는다.
