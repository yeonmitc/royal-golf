# 로얄프로샵 오프라인 판매 모드 구현 가이드

## 1. 목적

로얄프로샵은 인터넷 연결이 불안정하거나 오프라인 상태인 경우가 많다.

따라서 인터넷이 끊겨도 기존 상품 데이터를 이용해 판매를 계속할 수 있도록 하고,
오프라인 상태에서 발생한 판매 내역은 브라우저의 `IndexedDB`에 임시 저장한다.

인터넷이 다시 연결되면 관리자가 Header의 **판매내역 업데이트** 버튼을 눌러
오프라인 판매 내역을 서버 `sales` 테이블에 한꺼번에 동기화할 수 있게 한다.

이번 구현은 최대한 단순하게 유지한다.

---

# 2. 핵심 요구사항

## A. 상품 데이터 IndexedDB 캐시

서버의 `products` 데이터를 브라우저 IndexedDB에 저장한다.

### 자동 동기화

- 온라인 상태에서 하루 1회 상품 데이터 자동 동기화
- 마지막 동기화 시간이 24시간 이상 지난 경우 자동 갱신
- 로그인 또는 앱 진입 시 마지막 동기화 시간을 확인
- 관리자가 필요할 때 즉시 갱신할 수 있도록 `상품 새로고침` 버튼 제공

### IndexedDB에 저장할 상품 데이터

판매 화면에서 실제 필요한 데이터만 저장한다.

예:

```ts
type OfflineProduct = {
  id: string
  product_code: string
  name: string
  brand?: string | null
  size?: string | null
  color?: string | null
  sale_price: number
  is_active: boolean
  updated_at?: string | null
}
```

현재 프로젝트의 실제 `products` 필드명을 우선 사용하고,
없는 필드를 새로 만들지 않는다.

---

# 3. IndexedDB 구조

IndexedDB DB 이름 예시:

```text
royalproshop_offline
```

Object Store는 최소 3개만 사용한다.

```text
products
offline_sales
app_meta
```

## products

상품 캐시.

key:

```text
id
```

---

## offline_sales

오프라인 상태에서 발생한 판매 내역.

예:

```ts
type OfflineSale = {
  local_id: string
  product_id: string
  product_code: string

  quantity: number
  sale_price: number

  seller_id?: string | null
  guide_id?: string | null

  commission_rate?: number | null
  commission_amount?: number | null

  sold_at: string

  sync_status: 'PENDING' | 'FAILED'
  sync_error?: string | null
}
```

### 중요

`local_id`는 판매 생성 시 UUID로 생성한다.

예:

```ts
crypto.randomUUID()
```

이 값은 서버 동기화 시 중복 등록을 막는 식별자로 사용한다.

---

## app_meta

최소한의 로컬 상태만 저장한다.

예:

```text
products_last_synced_at
```

필요하면:

```text
last_sales_sync_at
```

정도만 추가한다.

불필요한 로그, revision, history 데이터는 만들지 않는다.

---

# 4. 온라인 / 오프라인 상태

브라우저 네트워크 상태를 사용한다.

```ts
navigator.onLine
```

그리고 다음 이벤트를 감지한다.

```ts
window.addEventListener('online', ...)
window.addEventListener('offline', ...)
```

인터넷이 끊기면 자동으로 오프라인 판매 가능 상태가 되어야 한다.

사용자가 별도의 버튼을 눌러야만 오프라인 모드가 작동하는 구조로 만들지 않는다.

Header에서는 현재 상태만 명확하게 보여준다.

---

# 5. Header UI

기존 Header 디자인을 최대한 유지한다.

## 온라인 정상 상태

예:

```text
🟢 온라인
상품 동기화: 오늘 09:12
[상품 새로고침]
```

미동기화 판매가 있으면:

```text
🟢 온라인
미동기화 판매 6건
[6건 판매내역 업데이트]
[상품 새로고침]
```

---

## 오프라인 상태

예:

```text
🟠 오프라인 판매 중
상품 데이터: 오늘 09:12 기준
미동기화 판매 6건
```

필요하면 작은 안내:

```text
인터넷 연결 후 판매내역을 업데이트해주세요.
```

모바일에서도 Header가 깨지지 않도록 compact UI로 구현한다.

---

# 6. Sell Product 판매 처리

기존 Sell Product UI를 최대한 그대로 사용한다.

판매 버튼을 눌렀을 때 네트워크 상태에 따라 저장 위치만 변경한다.

---

## 온라인 상태

기존 방식대로 서버 `sales`에 정상 저장한다.

```text
Sell Product
↓
Supabase sales INSERT
↓
판매 완료
```

---

## 오프라인 상태

Supabase INSERT를 시도하지 않고 IndexedDB `offline_sales`에 저장한다.

```text
Sell Product
↓
IndexedDB offline_sales
↓
sync_status = PENDING
↓
판매 완료 표시
```

사용자에게는:

```text
오프라인 판매로 저장되었습니다.
인터넷 연결 후 판매내역 업데이트가 필요합니다.
```

정도의 간단한 안내만 보여준다.

---

# 7. 판매 당시 데이터 보존

오프라인 판매에서 가장 중요한 부분이다.

다음 값은 반드시 **판매 당시 값 그대로** IndexedDB에 저장한다.

```text
sale_price
commission_rate
commission_amount
sold_at
```

서버 동기화 시 현재 상품 가격이나 현재 커미션 설정으로 다시 계산하지 않는다.

예:

판매 당시:

```text
판매가: 10,000
커미션율: 20%
커미션: 2,000
```

며칠 뒤 커미션율이 10%로 변경되더라도
해당 판매는 그대로:

```text
20%
2,000
```

으로 서버에 저장되어야 한다.

---

# 8. 서버 중복 저장 방지

오프라인 판매를 서버에 동기화할 때 같은 판매가 두 번 INSERT되면 안 된다.

`local_id`를 서버 판매 데이터에도 저장할 수 있도록 한다.

서버 `sales` 테이블에 적절한 컬럼이 없다면 다음 컬럼을 추가하는 방식을 검토한다.

```text
offline_sale_id
```

권장:

```sql
offline_sale_id uuid unique
```

단, 기존 프로젝트 구조에서 동일한 용도의 컬럼이 이미 있으면 새 컬럼을 만들지 말고 기존 컬럼을 사용한다.

---

# 9. 판매내역 업데이트

온라인 복구 후 자동 INSERT하지 않는다.

현재 단계에서는 관리자가 직접 Header의:

```text
[판매내역 업데이트]
```

버튼을 누르는 방식으로 구현한다.

---

## 동기화 과정

```text
IndexedDB offline_sales
↓
PENDING / FAILED 데이터 조회
↓
sales 서버 저장
↓
성공 확인
↓
IndexedDB 해당 판매 삭제
```

실패하면 삭제하지 않는다.

```text
sync_status = FAILED
sync_error = 오류 메시지
```

로 남긴다.

---

# 10. 일괄 동기화 결과

예:

```text
판매내역 업데이트 완료

성공 5건
실패 1건
```

실패한 판매는 IndexedDB에 계속 유지한다.

다시 `판매내역 업데이트`를 누르면 실패 건도 재시도한다.

---

# 11. 중복 방지 처리

사용자가 업데이트 버튼을 여러 번 눌러도 같은 판매가 중복 등록되지 않도록 해야 한다.

서버에 `offline_sale_id`가 이미 존재하면:

```text
이미 동기화된 판매
```

로 판단한다.

이 경우 로컬 IndexedDB 데이터는 동기화 완료로 간주하고 제거할 수 있다.

---

# 12. 상품 새로고침

Header 또는 판매 화면에서:

```text
[상품 새로고침]
```

버튼을 제공한다.

누르면:

```text
Supabase products 조회
↓
IndexedDB products 교체
↓
products_last_synced_at 업데이트
```

한다.

상품 캐시 업데이트는 merge보다는 현재 서버 기준 전체 교체 방식으로 단순하게 구현한다.

---

# 13. 상품 자동 동기화 규칙

앱 진입 시:

```text
현재 온라인 상태인가?
        ↓ YES
products_last_synced_at 확인
        ↓
24시간 이상 지났는가?
        ↓ YES
상품 자동 동기화
```

오프라인이면 기존 IndexedDB 상품을 그대로 사용한다.

IndexedDB 상품 데이터가 전혀 없는 상태에서 오프라인으로 접속하면:

```text
오프라인 상품 데이터가 없습니다.
인터넷 연결 후 상품을 동기화해주세요.
```

라고 표시하고 판매를 막는다.

---

# 14. 권장 파일 구조

현재 프로젝트 구조에 맞게 조정하되,
과도하게 파일을 나누지 않는다.

예:

```text
lib/
  offline-db.ts
  offline-sync.ts

components/
  offline-status.tsx
```

기존 Header가 있다면 별도 Header를 만들지 말고
현재 Header 안에 `OfflineStatus`를 추가한다.

기존 Sell Product 컴포넌트도 새로 만들지 말고
현재 판매 처리 함수에 온라인/오프라인 분기만 추가한다.

---

# 15. 구현 권장 함수

## offline-db.ts

예:

```text
openOfflineDB()
getCachedProducts()
replaceCachedProducts()
getOfflineSales()
addOfflineSale()
deleteOfflineSale()
updateOfflineSaleStatus()
getMeta()
setMeta()
```

---

## offline-sync.ts

예:

```text
syncProducts()
shouldSyncProducts()
syncOfflineSales()
```

함수 이름은 프로젝트 기존 naming convention이 있으면 그것을 따른다.

---

# 16. IndexedDB 라이브러리

가능하면 직접 복잡한 IndexedDB wrapper를 만들지 않는다.

프로젝트에 이미 IndexedDB 라이브러리가 있으면 그것을 사용한다.

없다면 가벼운 `idb` 라이브러리 사용을 허용한다.

예:

```bash
npm install idb
```

새 dependency를 추가하지 않고도 기존 코드가 간단하다면 native IndexedDB를 사용해도 된다.

---

# 17. 동기화 중 UI

동기화 버튼 클릭 중에는 중복 클릭을 막는다.

예:

```text
[판매내역 업데이트 중...]
```

버튼 disabled.

상품 동기화도 동일:

```text
[상품 업데이트 중...]
```

---

# 18. 오프라인 판매 화면

오프라인에서도 기존 IndexedDB `products` 기준으로 다음 기능이 작동해야 한다.

- 상품 코드 검색
- 상품 선택
- 판매가 표시
- 수량 선택
- 가이드/판매자 선택이 기존 캐시 또는 현재 세션 데이터로 가능한 경우 유지
- 커미션 계산
- Sell Product

서버 조회가 반드시 필요한 기능은 오프라인 상태에서는 호출하지 않는다.

---

# 19. 데이터 안전 규칙

절대 하지 말 것:

- 오프라인 판매 성공 전에 IndexedDB 데이터를 삭제
- 서버 INSERT 실패했는데 로컬 판매 삭제
- 서버 동기화 시 현재 커미션율로 다시 계산
- 서버 동기화 시 현재 상품 가격으로 다시 계산
- 단순 네트워크 오류 때문에 판매 데이터를 버림
- `localStorage`에 판매 내역 저장
- 동일한 오프라인 판매를 여러 번 INSERT
- 오프라인 기능 때문에 기존 온라인 판매 로직 전체 재작성

---

# 20. 기존 기능 보호

이번 작업에서 기존 정상 기능을 최대한 유지한다.

특히 다음 기능에 regression이 없어야 한다.

- 온라인 Sell Product
- sales 저장
- 가이드 커미션
- 판매내역
- 전체 정산 / 부분 정산
- 상품 관리
- 관리자 권한
- 로그인

---

# 21. 최소 QA

반드시 아래 시나리오를 직접 확인한다.

## TEST 1

```text
온라인 접속
→ products 동기화
→ IndexedDB products 생성
```

PASS 확인.

---

## TEST 2

```text
인터넷 차단
→ Header 오프라인 표시
→ 상품 검색 가능
→ Sell Product
→ IndexedDB offline_sales 저장
```

PASS 확인.

---

## TEST 3

```text
오프라인 판매 3건 생성
→ 인터넷 복구
→ Header 미동기화 3건 표시
```

PASS 확인.

---

## TEST 4

```text
판매내역 업데이트 클릭
→ 서버 sales 3건 생성
→ IndexedDB offline_sales 제거
→ 미동기화 0건
```

PASS 확인.

---

## TEST 5

같은 업데이트를 다시 실행해도:

```text
sales 중복 생성 0건
```

이어야 한다.

---

## TEST 6

동기화 도중 1건 실패하게 만들고:

```text
성공 데이터만 처리
실패 데이터 IndexedDB 유지
```

되는지 확인한다.

---

## TEST 7

커미션율 변경 테스트.

```text
오프라인 판매 당시 20%
↓
서버 설정 10%로 변경
↓
판매내역 업데이트
```

서버에 저장되는 해당 판매 커미션은 반드시:

```text
20%
```

여야 한다.

---

# 22. 최종 목표 UX

관리자는 인터넷 연결 여부를 크게 신경 쓰지 않고 판매할 수 있어야 한다.

### 온라인

```text
🟢 온라인
```

### 오프라인

```text
🟠 오프라인 판매 중
미동기화 판매 3건
```

### 인터넷 복구

```text
🟢 온라인
미동기화 판매 3건
[3건 판매내역 업데이트]
```

관리자가 버튼 한 번만 누르면 서버 판매내역으로 정상 반영되도록 구현한다.

---

# 23. 구현 원칙

이번 기능은 혼자 운영 및 개발하는 로얄프로샵에 맞게 최대한 단순하게 만든다.

불필요하게 다음 구조를 추가하지 않는다.

- 복잡한 background sync
- service worker 기반 자동 판매 업로드
- 별도 queue 서버
- 판매 revision 시스템
- offline event history 테이블
- 과도한 audit log
- 복잡한 충돌 해결 UI

현재 단계에서는:

```text
IndexedDB 캐시
+
IndexedDB 오프라인 판매
+
Header 상태
+
수동 일괄 동기화
```

이 네 가지에 집중한다.
