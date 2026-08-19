# 로얄골프 가이드 커미션·정산 개발 명세

## 1. 목적

가이드 커미션 계산, 포인트 적립, 정산 지급, 손익보고를 중복 없이 하나의 DB 기준으로 관리한다.

핵심 원칙:

> 커미션 계산과 정산은 Supabase PostgreSQL DB만 담당한다. 프런트엔드는 DB 결과를 표시하고 RPC만 호출한다.

## 2. 확정 커미션 정책

| 대상 | 커미션 |
|---|---:|
| 직원(`employee`) | 항상 0% |
| Peter | 직원이므로 항상 0% |
| Ella | 직원이므로 항상 0% |
| Mr.Moon | 항상 5% |
| 로컬 가이드(`local`) | 날짜·상품 종류와 관계없이 항상 10% |
| 일반 가이드(`regular`), 2026-08-13 00:00 이전 | 전 상품 10% |
| 일반 가이드(`regular`), 2026-08-13 00:00부터 의류 | 20% |
| 일반 가이드(`regular`), 2026-08-13 00:00부터 기타 상품 | 10% |

날짜는 필리핀 시간대 `Asia/Manila` 기준으로 판정한다.

정확한 기준 조건:

```sql
sale_groups.sold_at at time zone 'Asia/Manila'
  >= timestamp '2026-08-13 00:00:00'
```

위 조건을 만족하는 일반 가이드 판매부터 `TP/BT/DR` 20% 정책을 적용한다. 그 이전 일반 가이드 판매는 상품 종류와 관계없이 전부 10%로 계산한다.

### 의류 분류

상품코드의 두 번째 하이픈 구간이 다음 값이면 의류다.

```text
TP = 상의
BT = 하의
DR = 드레스
```

양말, 장갑, 모자, 신발, 골프백, 파우치, 우산, 액세서리 등 나머지 상품은 기타 상품이다.

### 커미션 제외

다음 판매행은 0%로 처리한다.

- `free_gift = true`
- `price = 0`
- `refunded_at is not null`
- 가이드가 없는 판매그룹

커미션 기준금액:

```text
sales.price × sales.qty
```

`products.sale_price` 또는 `sales.list_price`를 기준으로 계산하지 않는다.

## 3. 중복 계산 방지 원칙

### DB 담당

- 판매그룹 매출과 커미션 계산
- 판매그룹당 `earn_from_sale` 장부 1건 유지
- 판매 추가·수정·삭제·환불 시 재계산
- 가이드·판매일 변경 시 재계산
- 정산 기록 및 음수 장부 생성
- 중복 적립·중복 지급 차단

### 프런트엔드 담당

- DB 커미션과 잔액 표시
- 정산 버튼에서 DB RPC 호출
- 성공 후 목록 새로고침
- 정산 이력 표시

### 프런트엔드 금지사항

- 커미션 직접 계산
- `guide_point_ledger`에 `earn_from_sale` 직접 INSERT
- 가이드 잔액을 직접 0으로 UPDATE
- 커미션·정산 과거 기록 삭제
- 정산 지급액을 손익에서 다시 차감

코드에서 다음 키워드를 검색하여 중복 로직을 제거한다.

```text
guide_commission
guide_rate
guide_point_ledger
earn_from_sale
commission_payout
finalize_sale_group
recalc_one_sale_group
```

## 4. 가이드 설정

`guides` 테이블에 다음 열을 추가한다.

```sql
alter table public.guides
add column if not exists commission_enabled boolean not null default true;

alter table public.guides
add column if not exists fixed_commission_rate numeric;
```

설정값:

```text
모든 직원 → guide_type=employee, commission_enabled=false, fixed_commission_rate=null
Peter     → guide_type=employee, commission_enabled=false
Ella      → guide_type=employee, commission_enabled=false
Mr.Moon   → guide_type=regular, commission_enabled=true, fixed_commission_rate=0.05
로컬      → guide_type=local, commission_enabled=true, fixed_commission_rate=0.10
일반      → guide_type=regular, commission_enabled=true, fixed_commission_rate=null
```

운영 로직에서는 이름 대신 `guide_id`를 사용한다.

### 로컬 가이드 자동 등록 및 통합

현재 `sale_groups.local_guide_name`에 문자열만 저장하는 방식으로는 같은 사람의 판매·커미션·정산을 안정적으로 합산하기 어렵다. 로컬 가이드도 `guides` 테이블에 등록하여 일반 가이드와 동일한 구조로 관리한다.

`guides`에 가이드 유형과 정규화 이름을 추가한다.

```sql
alter table public.guides
add column if not exists guide_type text not null default 'regular'
check (guide_type in ('regular', 'local', 'employee'));

alter table public.guides
add column if not exists normalized_name text;

alter table public.guides
add column if not exists employee_id uuid
references public.employees(id);

create unique index if not exists guides_one_employee_link
on public.guides(employee_id)
where employee_id is not null;
```

로컬 가이드 이름 저장 시:

1. 앞뒤 공백 제거
2. 연속 공백을 한 칸으로 변환
3. 소문자 정규화 값을 생성
4. 같은 `normalized_name`의 로컬 가이드가 있으면 기존 `guide_id` 사용
5. 없으면 `guides`에 `guide_type='local'`로 새로 등록
6. `sale_groups.guide_id`에 해당 로컬 가이드 ID 저장
7. `local_guide_name`은 과거 호환과 원본 표시용으로 유지 가능

예시:

```text
"John"
" john "
"JOHN"
```

위 입력은 모두 같은 로컬 가이드로 합산되어야 한다.

로컬 가이드는 가이드 관리 화면에 일반 가이드와 함께 표시하고 이름 옆에 `Local` 배지를 붙인다. 커미션, 부분 정산, 전체 정산, 정산 이력도 같은 장부 구조를 사용한다.

직원과 로컬 가이드는 반드시 서로 다른 유형으로 표시한다.

| `guide_type` | 화면 배지 | 의미 |
|---|---|---|
| `regular` | `Guide` | 기존 정식 가이드 |
| `local` | `Local Guide` | `/sell`에서 이름으로 추가한 외부 로컬 가이드 |
| `employee` | `Employee` | `employees` 테이블과 연결된 내부 직원 |

같은 목록과 장부 구조를 사용하더라도 유형을 합치거나 동일하게 표시하면 안 된다.

로컬 가이드는 일반 가이드의 의류 20% 정책을 적용하지 않는다.

```text
로컬 가이드: 모든 날짜, 모든 상품 10%
직원: 모든 날짜, 모든 상품 0%
```

Peter와 Ella는 `guide_type='employee'`로 마이그레이션하고 가능한 경우 `employees.id`를 `guides.employee_id`에 연결한다. 이름을 하드코딩해 0% 처리하지 말고 직원 유형 전체에 0%를 적용한다.

로컬 가이드가 새로 입력될 때마다 별도 문자열 그룹을 만들지 말고 기존 정규화 이름을 재사용해야 한다.

### `/sell` Local Guide 모달 UI

현재 이름 입력칸 옆에 검색 가능한 Select를 추가한다.

```text
┌─────────────────────┬─────────────────────┐
│ 기존 Local Guide 선택 ▼ │ 새 이름 Enter name   │
└─────────────────────┴─────────────────────┘

[Cancel] [Save]
```

모바일 또는 좁은 화면에서는 두 입력칸을 세로로 배치한다.

Select에는 기존 로컬 가이드만 표시한다. 직원은 Local Guide Select에 포함하지 않는다.

```text
LOCAL GUIDES
  John
  Michael
```

Select 옵션에도 유형 배지를 함께 표시한다.

```text
John                         [Local Guide]
```

동작 규칙:

1. 기존 로컬 가이드를 선택하면 해당 `guide_id`를 그대로 재사용한다.
2. 선택한 가이드의 기존 커미션 잔액에 새 판매 커미션이 계속 누적된다.
3. 사용자가 새 이름을 직접 입력하면 정규화 이름으로 기존 로컬 가이드를 먼저 검색한다.
4. 같은 사람이 있으면 새로 만들지 않고 기존 `guide_id`를 재사용한다.
5. 없을 때만 `guide_type='local'`로 `guides` 테이블에 추가한다.
6. 저장 후 `sale_groups.guide_id`에 확정된 ID를 기록한다.
7. 판매채널은 `sale_channel='local_guide'`로 기록한다.

Select와 새 이름 입력칸 중 하나만 사용할 수 있다.

- Select를 선택하면 새 이름 입력값을 비운다.
- 새 이름을 입력하면 Select 선택을 해제한다.
- 둘 다 비어 있으면 Save 비활성화
- 둘 다 값이 있으면 저장 금지
- 이름은 공백만 입력할 수 없음
- 저장 중 중복 클릭 방지

새 이름 저장은 반드시 DB RPC 또는 서버 트랜잭션으로 처리한다. 프런트엔드에서 `guides` 존재 확인 후 별도 INSERT하는 방식은 동시 요청에서 중복을 만들 수 있으므로 사용하지 않는다.

권장 RPC:

```text
public.resolve_or_create_local_guide(
  p_name text default null,
  p_existing_guide_id bigint default null
)
returns guide_id bigint
```

RPC는 한 트랜잭션에서 이름 정규화, 기존 로컬 가이드 검색, 필요 시 신규 생성 후 최종 `guide_id`를 반환해야 한다. `p_existing_guide_id`가 `guide_type='local'`인지 반드시 검증한다.

### 직원 표시 규칙

직원은 Local Guide 모달의 Select에 표시하지 않는다. 직원은 메인 Guide 선택 목록과 가이드 관리 화면에서 `employees.english_name`만 사용한다.

```text
표시: Ella
표시: Peter

표시하지 않음: 한국이름 / Ella
표시하지 않음: 한국이름 / Peter
```

직원 내부 식별은 `employee_id`로 유지하고, 화면 표시 이름만 영어이름으로 제한한다.

## 5. 표준 커미션 계산 함수

커미션 계산 함수는 하나만 둔다.

```text
public.recalculate_guide_commission(p_group_id uuid)
```

필수 동작:

1. 대상 `sale_groups` 행을 `FOR UPDATE`로 잠근다.
2. 환불되지 않은 판매의 `price × qty` 합계를 계산한다.
3. 증정품과 0원 상품을 제외한다.
4. `guide_type='employee'`이면 0%를 적용한다.
5. Mr.Moon이면 5%를 적용한다.
6. `guide_type='local'`이면 전 상품 10%를 적용한다.
7. `guide_type='regular'`만 판매일과 `TP/BT/DR` 여부로 10% 또는 20%를 적용한다.
8. `sale_groups.subtotal`, `total`, `guide_commission`을 갱신한다.
9. `earn_from_sale` 장부를 생성하거나 기존 1건을 수정한다.
10. 계산 결과가 0이면 자동 적립행을 제거한다.

`guide_rate`는 10%와 20%가 섞인 판매를 정확히 나타내지 못하므로 계산 기준으로 사용하지 않는다. 최종 기준은 `sale_groups.guide_commission`이다.

기존 함수는 모두 표준 함수만 호출하도록 바꾼다.

```sql
create or replace function public.recalc_one_sale_group(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.recalculate_guide_commission(p_group_id);
end;
$$;

create or replace function public.finalize_sale_group(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.recalculate_guide_commission(p_group_id);
end;
$$;
```

Mr.Moon 고객 할인가격 정책과 Mr.Moon 가이드 커미션 5%는 별개다.

## 6. 자동 재계산 트리거

### `sales`

다음 작업 후 표준 함수를 호출한다.

```text
INSERT
DELETE
UPDATE OF sale_group_id, price, qty, refunded_at, free_gift, code
```

판매그룹이 바뀌면 이전 그룹과 새 그룹을 모두 재계산한다.

### `sale_groups`

다음 열이 바뀌면 재계산한다.

```text
guide_id
sold_at
```

## 7. 커미션 장부 중복 방지

판매그룹 하나에는 `earn_from_sale` 자동 적립행이 최대 1개만 있어야 한다.

```sql
create unique index if not exists guide_point_ledger_one_sale_earn
on public.guide_point_ledger (sale_group_id, reason)
where sale_group_id is not null
  and reason = 'earn_from_sale';
```

프런트엔드의 직접 INSERT를 먼저 제거하고 기존 중복행을 정리한 뒤 인덱스를 적용한다.

## 8. 정산 구조

가이드가 커미션을 받아가도 기존 적립 기록을 삭제하거나 0으로 수정하지 않는다.

```text
판매 커미션 적립  +2,320  earn_from_sale
정산 지급         -2,320  commission_payout
현재 잔액              0
```

### 정산 테이블

```sql
create table if not exists public.guide_commission_settlements (
  id uuid primary key default gen_random_uuid(),
  guide_id bigint not null references public.guides(id),
  amount numeric not null check (amount > 0),
  settlement_type text not null check (settlement_type in ('partial', 'full')),
  balance_before numeric not null,
  balance_after numeric not null check (balance_after >= 0),
  payment_method text,
  paid_at timestamptz not null default now(),
  note text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

alter table public.guide_point_ledger
add column if not exists settlement_id uuid
references public.guide_commission_settlements(id);

create unique index if not exists guide_point_ledger_one_settlement
on public.guide_point_ledger (settlement_id)
where settlement_id is not null;
```

### 전체 잔액 정산 RPC

```text
public.settle_all_guide_commission(
  p_guide_id bigint,
  p_payment_method text default null,
  p_note text default null,
  p_paid_at timestamptz default now()
)
```

동작:

1. 가이드 행을 `FOR UPDATE`로 잠근다.
2. `sum(guide_point_ledger.delta)`로 현재 잔액을 계산한다.
3. 잔액이 0 이하이면 정산을 거부한다.
4. 현재 잔액 전체를 정산 테이블에 기록한다.
5. 같은 금액의 음수 `commission_payout` 장부를 생성한다.
6. 정산 ID와 지급 전·후 잔액을 반환한다.
7. 모든 작업을 하나의 트랜잭션으로 처리한다.

### 부분 정산 RPC

기존 `Edit Points` 모달에서는 사용자가 **정산 후 남길 포인트**를 입력해 부분 정산할 수 있어야 한다.

```text
public.settle_guide_commission_to_balance(
  p_guide_id bigint,
  p_target_balance numeric,
  p_expected_current_balance numeric,
  p_payment_method text default null,
  p_note text default null,
  p_paid_at timestamptz default now()
)
```

예시:

```text
현재 포인트 ₱1,400
변경 후 포인트 ₱500
부분 정산금 ₱900
```

DB는 가이드 행을 잠근 뒤 실제 잔액을 다시 확인한다. 실제 잔액이 화면에서 전달한 `p_expected_current_balance`와 다르면 정산을 중단하고 새로고침하도록 한다.

검증 조건:

```text
p_target_balance >= 0
p_target_balance < 현재 잔액
정산금 = 현재 잔액 - p_target_balance
```

부분 정산 시 다음을 한 트랜잭션으로 처리한다.

1. `settlement_type='partial'` 정산 이력 생성
2. `balance_before`, `amount`, `balance_after` 저장
3. 정산금과 같은 금액의 음수 `commission_payout` 장부 생성
4. 정산 ID와 지급 전·후 잔액 반환

목표 잔액이 0이면 `settlement_type='full'`로 기록한다. 빨간색 `정산 완료` 버튼은 목표 잔액 0으로 같은 내부 정산 로직을 호출한다.

부분 정산과 전체 정산 모두 반드시 정산 테이블과 장부에 기록해야 한다.

## 9. 가이드 관리 화면

### 유형 표시 및 필터

가이드 관리 테이블에 `Type` 열을 추가한다.

```text
Name | Type | Current Points | Action
```

표시 예시:

```text
Anna       Guide         ₱0       [Edit Points] [정산 완료]
John       Local Guide   ₱900     [Edit Points] [정산 완료]
James Kim  Employee      ₱1,400   [Edit Points] [정산 완료]
```

목록 상단에 유형 필터를 추가한다.

```text
All | Guide | Local Guide | Employee
```

- 기본값은 `All`
- 이름 검색과 유형 필터를 함께 적용할 수 있어야 함
- 요약 총액은 현재 선택한 필터 기준과 전체 기준 중 UI에서 명확히 구분
- 정산 이력에도 `guide_type` 또는 당시 표시 유형을 함께 보여줌
- 직원은 `employees.english_name`만 표시
- 로컬 가이드는 직접 입력한 대표 이름을 표시
- 유형 변경은 일반 편집 화면에서 임의로 하지 않고 관리자 전용 병합·변환 절차로 처리

### 기존 `Edit Points` 모달: 부분 정산

기존 모달에 다음 항목을 표시한다.

```text
현재 포인트
변경 후 남길 포인트
자동 계산된 부분 정산금
지급방법
메모
```

예시:

```text
현재 포인트:      ₱1,400
변경 후 포인트:  ₱500
부분 정산금:      ₱900

[취소] [부분 정산]
```

현재보다 낮은 포인트를 입력하면 그 차액을 부분 정산한다. 프런트엔드는 포인트를 직접 UPDATE하지 않고 `settle_guide_commission_to_balance` RPC를 호출한다.

- 음수 입력 금지
- 현재 잔액보다 큰 값을 부분 정산으로 입력 금지
- 현재 잔액과 같은 값은 변경 없음
- 정산금이 0이면 호출 금지
- 저장 중 중복 클릭 금지

현재보다 포인트를 늘리는 것은 정산이 아니다. 별도의 `수동 조정`으로 처리하고 `admin_adjust` 신규 장부행과 필수 메모를 남긴다.

현재 `Edit Points` 버튼 오른쪽에 빨간색 버튼을 추가한다.

```text
정산 완료
```

### 버튼 디자인

- `Edit Points`: 기존 노란색 유지
- `정산 완료`: 빨간색 배경 또는 빨간색 테두리
- 두 버튼을 한 줄에 나란히 배치
- 현재 잔액이 0이면 `정산 완료` 비활성화
- 비활성화 상태에서는 회색 또는 투명도를 낮춰 표시

예시:

```text
[ Edit Points ] [ 정산 완료 ]
```

### 클릭 동작

버튼을 누르면 확인창을 표시한다.

```text
가이드: Eddie
현재 정산금: ₱1,400

현재 커미션 전액을 정산 완료 처리하시겠습니까?
정산 후 현재 포인트는 0으로 표시됩니다.

[취소] [정산 완료]
```

최종 확인 후 `settle_all_guide_commission` RPC를 호출한다.

성공하면:

- 정산 이력 1건 생성
- 음수 장부 1건 생성
- 현재 포인트 0 표시
- 목록 새로고침
- `₱1,400 정산이 완료되었습니다.` 토스트 표시
- `정산 완료` 버튼 비활성화

실패하면 잔액을 화면에서 임의로 0으로 바꾸지 않고 오류 메시지를 표시한다.

### 중요한 구현 원칙

사용자가 보기에는 0으로 바뀌지만 실제 DB에서는 기존 적립금이 삭제되지 않는다.

```text
기존 장부 합계 + 음수 정산 장부 = 0
```

### 모든 포인트 변경 기록

| 작업 | 정산 테이블 | 장부 reason |
|---|---|---|
| 부분 정산 | 기록 | `commission_payout` |
| 전체 정산 | 기록 | `commission_payout` |
| 관리자 포인트 증가 | 해당 없음 | `admin_adjust` |
| 정산이 아닌 관리자 감소 | 해당 없음 | `admin_adjust` |

과거 장부행을 직접 수정하거나 삭제하지 않는다. 모든 변경은 새로운 장부행으로 기록한다.

## 10. 현재 포인트 계산

```sql
select
  g.id,
  g.name,
  coalesce(sum(l.delta), 0) as current_balance
from public.guides g
left join public.guide_point_ledger l
  on l.guide_id = g.id
group by g.id, g.name
order by g.name;
```

별도 잔액 열을 직접 수정하지 말고 장부 합계로 표시한다.

## 11. 정산 이력

화면에서 다음 항목을 볼 수 있어야 한다.

- 정산일시
- 가이드 이름
- 정산금액
- 정산 유형(부분/전체)
- 정산 전 잔액
- 정산 후 잔액
- 지급방법
- 메모
- 처리 관리자
- 정산 ID

시간은 `Asia/Manila`로 표시한다.

## 12. 손익·리포트 원칙

손익에서는 실제 정산금이나 현재 미정산금이 아니라 판매에서 발생한 커미션을 비용으로 차감한다.

```text
손익 커미션 비용 = sale_groups.guide_commission
```

```text
판매 시점:
  매출 증가
  커미션 비용 증가
  미정산금 증가

정산 시점:
  현금 감소
  미정산금 감소
  손익은 다시 변하지 않음
```

예시:

```text
8월 17일 매출               ₱46,400
Mr.Moon 발생 커미션 5%     ₱ 2,320
커미션 반영 후 금액         ₱44,080

8월 25일 ₱2,320 정산:
  현금지급만 기록
  손익에서 다시 차감하지 않음
```

커미션 비용 귀속일은 `sale_groups.sold_at`, 지급일은 `guide_commission_settlements.paid_at`이다.

## 13. 보고서 요약 카드

가이드 관리 또는 보고서 상단에 다음 3개를 분리해 표시한다.

| 항목 | 의미 | 손익 처리 |
|---|---|---|
| 총 발생 커미션 | 판매에서 발생한 커미션 | 손익에서 차감 |
| 총 지급 정산금 | 실제 지급한 금액 | 현금흐름만 반영 |
| 현재 총 미정산금 | 아직 지급할 가이드 잔액 | 채무/운영잔액 |

예시:

```text
총 발생 커미션      ₱30,000
총 지급 정산금      ₱18,000
현재 총 미정산금    ₱12,000
```

손익에서는 ₱30,000만 한 번 차감한다.

가이드별 표시:

```text
가이드 이름
총 발생 커미션
총 지급 정산금
현재 미정산 잔액
마지막 정산일
```

전체 가이드 일괄 정산 버튼은 만들지 않는다. 각 가이드 행의 `Edit Points`에서 부분 정산하거나 빨간색 `정산 완료` 버튼으로 전체 정산한다.

## 14. Kakao 할인 및 판매채널 집계

`Kakao`는 가이드 정산 대상이 아니라 할인 판매채널이다. 가이드와 같은 장부에 넣지 않고 판매채널과 할인액으로 별도 집계한다.

`sale_groups`에 판매채널을 명확하게 저장한다.

```sql
alter table public.sale_groups
add column if not exists sale_channel text not null default 'no_guide'
check (
  sale_channel in (
    'no_guide',
    'guide',
    'local_guide',
    'kakao',
    'online'
  )
);
```

드롭다운 매핑:

```text
No Guide   → no_guide
일반 가이드 → guide + guide_id
Local Guide → local_guide + guide_id + local_guide_name
Kakao      → kakao
Online     → online
```

Kakao 할인액은 환불되지 않은 Kakao 판매행에서 다음과 같이 계산한다.

```text
Kakao 할인액 = max(list_price - price, 0) × qty
```

조회 예시:

```sql
select coalesce(
  sum(greatest(coalesce(s.list_price, s.price) - s.price, 0) * s.qty),
  0
) as total_kakao_discount
from public.sales s
join public.sale_groups sg
  on sg.id = s.sale_group_id
where sg.sale_channel = 'kakao'
  and s.refunded_at is null
  and sg.sold_at >= :period_start
  and sg.sold_at < :period_end;
```

Kakao 할인 총액을 보고서 요약 카드에 추가한다.

```text
총 Kakao 할인액
```

### Sales Summary 카드 배치

현재 `Sales Summary`에 있는 `Rows` 카드는 제거하고 같은 위치에 `Kakao Discount` 카드를 표시한다. `Transactions` 카드가 이미 판매건수를 보여주므로 `Rows`는 중복 정보로 본다.

```text
기존: Rows / 2,801
변경: Kakao Discount / 00,000 PHP
```

표시 규칙:

- 카드 제목: `Kakao Discount`
- 값: 선택한 `Sales Summary` 기간의 Kakao 할인 총액
- 통화: `PHP`
- 천 단위 구분기호 적용
- 할인내역이 없으면 `0 PHP`
- 기존 `Rows` 카드 위치를 그대로 사용
- 오른쪽 `SoldAt Range` 카드는 유지
- 기간 필터가 바뀌면 Kakao 할인액도 함께 다시 조회
- 환불된 판매는 제외

이 카드는 선택 기간의 총 할인액만 요약한다. 상세 내역이 필요하면 카드를 클릭하거나 별도 필터를 통해 Kakao 판매내역을 표시할 수 있도록 확장 가능하다.

Kakao 할인은 매출 할인 분석 지표이며 가이드 커미션이나 가이드 미정산금에 포함하면 안 된다. 손익에서는 실제 판매금액 `price × qty`가 이미 할인 후 매출이므로 Kakao 할인액을 비용으로 다시 차감하면 안 된다.

Kakao 보고서에는 다음을 표시한다.

```text
Kakao 판매건수
Kakao 판매수량
Kakao 정상가 합계
Kakao 실제 매출
Kakao 할인 총액
평균 할인율
```

## 15. 시간대

DB는 `timestamptz`를 사용하고 프런트엔드는 명시적으로 필리핀 시간으로 표시한다.

```ts
new Intl.DateTimeFormat("en-PH", {
  timeZone: "Asia/Manila",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
}).format(new Date(value));
```

UTC를 그대로 표시하거나 DB 시간에 임의로 8시간을 더하는 방식은 사용하지 않는다.

## 16. 권한

관리자만 다음 작업을 할 수 있어야 한다.

- `정산 완료` RPC 실행
- 수동 포인트 조정
- 커미션 정책 변경
- 정산 이력 조회

익명 사용자는 정산 RPC를 실행할 수 없어야 한다.

`SECURITY DEFINER` 함수는 반드시 다음을 사용한다.

```sql
set search_path = public
```

## 17. 구현 순서

1. 관련 테이블 백업
2. 프런트엔드 중복 계산·직접 장부 쓰기 검색
3. 가이드 커미션 설정 및 `guide_type`, `normalized_name` 추가
4. 직원 연결용 `employee_id`와 중복 방지 인덱스 추가
5. 기존 `local_guide_name`을 정규화하여 로컬 가이드 레코드로 마이그레이션
6. `sale_groups.guide_id`와 로컬 가이드 연결
7. `resolve_or_create_local_guide` RPC 구현
8. `/sell` Local Guide 모달에 기존 로컬 가이드 전용 Select 추가
9. `sale_channel` 추가 및 기존 Kakao/Online/No Guide 데이터 마이그레이션
10. 정산 테이블과 `settlement_id` 추가
11. 표준 계산 함수 생성
12. 기존 함수 통합
13. 자동 재계산 트리거 생성
14. 프런트엔드 직접 계산 제거
15. 기존 중복 `earn_from_sale` 정리
16. 고유 인덱스 생성
17. 과거 커미션 재계산
18. 부분·전체 정산 RPC 생성
19. 기존 `Edit Points` 모달에 부분 정산 구현
20. 빨간색 `정산 완료` 버튼 구현
21. 부분·전체 정산 이력 구현
22. `Rows` 카드를 `Kakao Discount` 카드로 교체하고 발생·지급·미정산·Kakao 할인 요약값 구현
23. 전체 테스트

## 18. 테스트 기준

### 커미션

```text
직원 ₱10,000 판매 → ₱0
Peter ₱10,000 판매 → 직원이므로 ₱0
Ella ₱10,000 판매 → 직원이므로 ₱0
Mr.Moon ₱46,400 판매 → ₱2,320
로컬 가이드 의류 ₱10,000 + 기타 ₱5,000 → 전 상품 10%, 총 ₱1,500
2026-08-12 23:59 일반 가이드 의류 ₱10,000 + 기타 ₱5,000 → 전 상품 10%, ₱1,500
2026-08-13 00:00 일반 가이드 의류 ₱10,000 + 기타 ₱5,000 → ₱2,500
GIFT·환불 → ₱0
```

### 정산 완료 버튼

```text
정산 전 Eddie 잔액 ₱1,400
버튼 클릭 및 확인
정산 기록 1건
commission_payout -₱1,400 장부 1건
정산 후 화면 잔액 ₱0
재클릭 불가
```

동시에 두 번 요청해도 한 번만 정산되어야 한다.

### 부분 정산

```text
정산 전 잔액 ₱1,400
변경 후 잔액 ₱500 입력
부분 정산금 ₱900
settlement_type=partial 기록 1건
commission_payout -₱900 장부 1건
정산 후 화면 잔액 ₱500
기존 커미션 적립 기록 유지
```

### 수동 포인트 조정

포인트 증가 또는 정산이 아닌 감소는 `admin_adjust` 신규 장부행으로 기록하고 사유를 필수로 남긴다. 기존 장부를 덮어쓰면 안 된다.

### 로컬 가이드 이름 합산

```text
첫 판매 이름 "John"
둘째 판매 이름 " john "
셋째 판매 이름 "JOHN"

예상 결과:
가이드 관리 목록에 John 1명만 표시
세 판매의 커미션이 같은 guide_id로 합산
부분·전체 정산도 하나의 잔액으로 처리
```

서로 다른 로컬 가이드는 합쳐지면 안 되며, 관리자에게 이름 수정·병합 기능이 필요하면 별도 안전한 관리 기능으로 구현한다.

### `/sell` 로컬 가이드 재사용

1. 기존 로컬 가이드를 Select에서 선택해 두 번 판매한다.
2. 두 판매가 동일한 `guide_id`로 저장되는지 확인한다.
3. 가이드 관리 화면에서 커미션이 한 사람에게 합산되는지 확인한다.
4. 같은 이름을 공백·대소문자만 다르게 직접 입력해도 신규 가이드가 생성되지 않는지 확인한다.
5. 직원이 Local Guide Select에 표시되지 않는지 확인한다.
6. Select와 새 이름을 동시에 제출할 수 없는지 확인한다.
7. 동시 저장 요청에서도 중복 로컬 가이드가 생성되지 않는지 확인한다.
8. 로컬 가이드는 `Local Guide`, 직원은 `Employee` 배지로 표시되는지 확인한다.
9. 직원 이름은 `employees.english_name`만 표시되는지 확인한다.
10. `All / Guide / Local Guide / Employee` 필터가 정확히 작동하는지 확인한다.
11. 같은 이름의 직원과 로컬 가이드가 존재해도 `guide_type`과 `employee_id`로 구분되는지 확인한다.

### Kakao 할인 집계

```text
정상가 ₱2,000
실판매가 ₱1,800
수량 2
예상 Kakao 할인액 ₱400
```

환불 처리 후 해당 할인액이 선택 기간 Kakao 할인 합계에서 제외되는지 확인한다. Kakao 할인액이 가이드 잔액에 포함되거나 손익에서 중복 차감되면 안 된다.

`Sales Summary`에서 `Rows` 카드가 사라지고 동일한 위치에 선택 기간의 `Kakao Discount` 금액이 PHP 형식으로 표시되는지 확인한다. 기간 필터 변경과 환불 처리 후 카드 값도 즉시 갱신되어야 한다.

### 손익

```text
발생 커미션 ₱3,000
실제 지급 정산금 ₱1,200
현재 미정산금 ₱1,800
손익 차감은 ₱3,000 한 번만 적용
```

## 19. 완료 기준

- DB 표준 커미션 함수 1개
- Peter·Ella 항상 0%
- Mr.Moon 항상 5%
- 직원 전체 항상 0%
- Peter·Ella를 직원 유형으로 분류
- 로컬 가이드 전 상품 항상 10%
- 일반 가이드만 날짜·상품별 10%/20% 적용
- 증정품·환불 제외
- 판매그룹당 자동 적립 최대 1건
- 정산 이력과 음수 장부 생성
- 부분·전체 정산 모두 지급 전 잔액, 지급액, 지급 후 잔액 기록
- 모든 포인트 변경을 신규 장부 이력으로 기록
- 기존 `Edit Points` 모달에서 부분 정산 가능
- 빨간색 `정산 완료` 버튼 구현
- 로컬 가이드 이름 정규화 및 이름별 커미션 합산
- 로컬 가이드도 일반 가이드 목록·정산·이력에 통합
- `/sell` Local Guide 모달에 기존 로컬 가이드만 검색하는 Select 제공
- Local Guide Select에서 직원 제외
- 직원은 메인 목록에서 영어이름만 표시
- 기존 로컬 가이드 선택 시 동일 `guide_id` 재사용
- 새 이름은 DB에 없을 때만 생성
- 동시 요청에서도 중복 로컬 가이드 생성 방지
- 가이드 관리 화면에서 일반·로컬·직원 유형 배지 및 필터 제공
- 로컬 가이드와 직원을 서로 다른 `guide_type`으로 유지
- Kakao를 별도 판매채널로 저장
- Kakao 할인 총액 및 관련 분석지표 표시
- Sales Summary의 `Rows` 카드를 `Kakao Discount`로 교체
- Kakao 할인액을 가이드 정산에 포함하지 않음
- Kakao 할인액을 손익에서 중복 차감하지 않음
- 정산 후 화면 잔액 0
- 기존 적립·정산 기록 유지
- 중복 정산 방지
- 손익에서 발생 커미션만 한 번 차감
- 총 발생·총 지급·현재 미정산 분리 표시
- 모든 화면 `Asia/Manila` 시간 적용
- 전체 테스트 통과
