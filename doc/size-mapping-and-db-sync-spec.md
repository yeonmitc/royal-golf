# [Full-Stack Specification] 사이즈 체계 확장(M~8XL / S~4XL / 장갑) 및 DB/UI 전체 동기화 명세

## 1. 개요 (Overview)
제품 코드(`code` / `product_code`)의 Prefix별 동적 사이즈 표기(예: `M (95)`, `S (30~31)`, `S (22)` 등)를 프론트엔드에 반영하고, 기존 `S~3XL, Free` 체계에서 최대 `8XL`까지 확장됨에 따라 **DB의 ENUM 타입, `inventories` 테이블 컬럼, 재고 증감 함수(`inv_apply_delta`), 판매/환불 트리거 함수까지 완벽하게 동기화**합니다.

---

## 2. 제품군별 사이즈 매핑 규칙 (Size Mapping Rules)

### 1) 남성 상의 (`GM-TP`, `LM-TP`)
* **사이즈 범위**: `M` ~ `8XL`, `Free`
* **표시 라벨 매핑**:
  | 표준 사이즈 (Key) | UI 표시 라벨 (Label) | 비고 |
  | :--- | :--- | :--- |
  | `M` | `M (95)` | |
  | `L` | `L (100)` | |
  | `XL` | `XL (105)` | |
  | `2XL` | `2XL (110)` | |
  | `3XL` | `3XL (115)` | |
  | `4XL` | `4XL (120)` | |
  | `5XL` | `5XL (125)` | |
  | `6XL` | `6XL (130)` | |
  | `7XL` | `7XL (135)` | |
  | `8XL` | `8XL (140)` | |
  | `Free` | `Free` | |

---

### 2) 바지/하의 (`GM-BT`, `LM-BT`)
* **사이즈 범위**: `S` ~ `4XL`, `Free`
* **표시 라벨 매핑**:
  | 표준 사이즈 (Key) | UI 표시 라벨 (Label) | 비고 |
  | :--- | :--- | :--- |
  | `S` | `S (30~31)` | |
  | `M` | `M (32)` | |
  | `L` | `L (33)` | |
  | `XL` | `XL (34)` | |
  | `2XL` | `2XL (35~36)` | |
  | `3XL` | `3XL (37)` | |
  | `4XL` | `4XL (38)` | |
  | `Free` | `Free` | |

---

### 3) 남성 장갑 (`GM-GG`)
* **사이즈 범위**: `S` ~ `2XL`
* **표시 라벨 매핑**:
  | 표준 사이즈 (Key) | UI 표시 라벨 (Label) | 비고 |
  | :--- | :--- | :--- |
  | `S` | `S (22)` | |
  | `M` | `M (23)` | |
  | `L` | `L (24)` | |
  | `XL` | `XL (25)` | |
  | `2XL` | `2XL (26)` | |

---

### 4) 여성 장갑 (`GW-GG`)
* **사이즈 범위**: `S` ~ `XL`
* **표시 라벨 매핑**:
  | 표준 사이즈 (Key) | UI 표시 라벨 (Label) | 비고 |
  | :--- | :--- | :--- |
  | `S` | `S (18)` | |
  | `M` | `M (19)` | |
  | `L` | `L (20)` | |
  | `XL` | `XL (21)` | |

---

### 5) 기타 일반/기본 (Default: Bags, Accessories 등)
* **대상**: 상기 Prefix 외 모든 제품 (예: `GA-BG`, `GA-GG` 등)
* **기본 표기**: `S`, `M`, `L`, `XL`, `2XL`, `3XL`, `Free` (기본 영문 표기)

---

## 3. Database 마이그레이션 SQL (필수 실행)

확장된 사이즈(`4XL`, `5XL`, `6XL`, `7XL`, `8XL`)를 지원하기 위해 아래 SQL 스크립트를 데이터베이스에 적용합니다.

```sql
-- ============================================================
-- 1. size_std ENUM 타입 확장 (4XL ~ 8XL 추가)
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type typ JOIN pg_enum enm ON typ.oid = enm.enumtypid WHERE typ.typname = 'size_std' AND enm.enumlabel = '4XL') THEN
    ALTER TYPE public.size_std ADD VALUE '4XL';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type typ JOIN pg_enum enm ON typ.oid = enm.enumtypid WHERE typ.typname = 'size_std' AND enm.enumlabel = '5XL') THEN
    ALTER TYPE public.size_std ADD VALUE '5XL';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type typ JOIN pg_enum enm ON typ.oid = enm.enumtypid WHERE typ.typname = 'size_std' AND enm.enumlabel = '6XL') THEN
    ALTER TYPE public.size_std ADD VALUE '6XL';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type typ JOIN pg_enum enm ON typ.oid = enm.enumtypid WHERE typ.typname = 'size_std' AND enm.enumlabel = '7XL') THEN
    ALTER TYPE public.size_std ADD VALUE '7XL';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type typ JOIN pg_enum enm ON typ.oid = enm.enumtypid WHERE typ.typname = 'size_std' AND enm.enumlabel = '8XL') THEN
    ALTER TYPE public.size_std ADD VALUE '8XL';
  END IF;
END $$;

-- ============================================================
-- 2. inventories 테이블에 4XL ~ 8XL 컬럼 추가
-- ============================================================
ALTER TABLE public.inventories 
  ADD COLUMN IF NOT EXISTS "4xl" integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "5xl" integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "6xl" integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "7xl" integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "8xl" integer DEFAULT 0;

-- ============================================================
-- 3. inv_apply_delta 함수 갱신 (4XL ~ 8XL 반영)
-- ============================================================
CREATE OR REPLACE FUNCTION public.inv_apply_delta(p_code text, p_size size_std, p_qty integer)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
begin
  if p_qty is null or p_qty = 0 then
    return;
  end if;

  if p_size = 'S' then
    update public.inventories set s = coalesce(s,0) + p_qty where code = p_code;
  elsif p_size = 'M' then
    update public.inventories set m = coalesce(m,0) + p_qty where code = p_code;
  elsif p_size = 'L' then
    update public.inventories set l = coalesce(l,0) + p_qty where code = p_code;
  elsif p_size = 'XL' then
    update public.inventories set xl = coalesce(xl,0) + p_qty where code = p_code;
  elsif p_size = '2XL' then
    update public.inventories set "2xl" = coalesce("2xl",0) + p_qty where code = p_code;
  elsif p_size = '3XL' then
    update public.inventories set "3xl" = coalesce("3xl",0) + p_qty where code = p_code;
  elsif p_size = '4XL' then
    update public.inventories set "4xl" = coalesce("4xl",0) + p_qty where code = p_code;
  elsif p_size = '5XL' then
    update public.inventories set "5xl" = coalesce("5xl",0) + p_qty where code = p_code;
  elsif p_size = '6XL' then
    update public.inventories set "6xl" = coalesce("6xl",0) + p_qty where code = p_code;
  elsif p_size = '7XL' then
    update public.inventories set "7xl" = coalesce("7xl",0) + p_qty where code = p_code;
  elsif p_size = '8XL' then
    update public.inventories set "8xl" = coalesce("8xl",0) + p_qty where code = p_code;
  elsif p_size = 'Free' then
    update public.inventories set free = coalesce(free,0) + p_qty where code = p_code;
  else
    raise exception 'Unknown size_std: %', p_size;
  end if;

  if not found then
    raise exception 'Inventory row not found for code=%', p_code;
  end if;
end $function$;

-- ============================================================
-- 4. trg_sales_apply_stock_on_insert 함수 갱신 (4XL ~ 8XL 재고 체크 반영)
-- ============================================================
CREATE OR REPLACE FUNCTION public.trg_sales_apply_stock_on_insert()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  v_available integer;
begin
  -- 이미 적용된 row면 스킵 (멱등성)
  if new.stock_applied_at is not null then
    return new;
  end if;

  -- 환불된 건은 재고 차감 스킵
  if new.refunded_at is not null then
    return new;
  end if;

  -- 사이즈별 현재 재고 잠금 조회 (FOR UPDATE)
  if new.size_std = 'S' then
    select s into v_available from public.inventories where code = new.code for update;
  elsif new.size_std = 'M' then
    select m into v_available from public.inventories where code = new.code for update;
  elsif new.size_std = 'L' then
    select l into v_available from public.inventories where code = new.code for update;
  elsif new.size_std = 'XL' then
    select xl into v_available from public.inventories where code = new.code for update;
  elsif new.size_std = '2XL' then
    select "2xl" into v_available from public.inventories where code = new.code for update;
  elsif new.size_std = '3XL' then
    select "3xl" into v_available from public.inventories where code = new.code for update;
  elsif new.size_std = '4XL' then
    select "4xl" into v_available from public.inventories where code = new.code for update;
  elsif new.size_std = '5XL' then
    select "5xl" into v_available from public.inventories where code = new.code for update;
  elsif new.size_std = '6XL' then
    select "6xl" into v_available from public.inventories where code = new.code for update;
  elsif new.size_std = '7XL' then
    select "7xl" into v_available from public.inventories where code = new.code for update;
  elsif new.size_std = '8XL' then
    select "8xl" into v_available from public.inventories where code = new.code for update;
  elsif new.size_std = 'Free' then
    select free into v_available from public.inventories where code = new.code for update;
  else
    raise exception 'Invalid size_std=%', new.size_std;
  end if;

  if v_available is null then
    raise exception 'Inventory row missing for code=%', new.code;
  end if;

  if v_available < new.qty then
    raise exception 'Insufficient stock: code=% size=% requested=% available=%',
      new.code, new.size_std, new.qty, v_available;
  end if;

  -- 재고 차감 실행
  perform public.inv_apply_delta(new.code, new.size_std, -new.qty);

  new.stock_applied_at := now();
  return new;
end $function$;
```

---

## 4. Frontend 유틸리티 및 매핑 구현

```typescript
// types/size.ts
export interface SizeOption {
  key: string;       // DB 컬럼 및 size_std 값 ('M', '2XL', '4XL' 등)
  label: string;     // UI에 표시될 라벨 ('M (95)', 'S (30~31)' 등)
}

// utils/sizeMapper.ts
export function getSizeOptionsByCode(productCode: string): SizeOption[] {
  const code = (productCode || '').toUpperCase();

  // 1. 남성 상의 (GM-TP, LM-TP)
  if (code.startsWith('GM-TP') || code.startsWith('LM-TP')) {
    return [
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
      { key: 'Free', label: 'Free' }
    ];
  }

  // 2. 바지/하의 (GM-BT, LM-BT)
  if (code.startsWith('GM-BT') || code.startsWith('LM-BT')) {
    return [
      { key: 'S', label: 'S (30~31)' },
      { key: 'M', label: 'M (32)' },
      { key: 'L', label: 'L (33)' },
      { key: 'XL', label: 'XL (34)' },
      { key: '2XL', label: '2XL (35~36)' },
      { key: '3XL', label: '3XL (37)' },
      { key: '4XL', label: '4XL (38)' },
      { key: 'Free', label: 'Free' }
    ];
  }

  // 3. 남성 장갑 (GM-GG)
  if (code.startsWith('GM-GG')) {
    return [
      { key: 'S', label: 'S (22)' },
      { key: 'M', label: 'M (23)' },
      { key: 'L', label: 'L (24)' },
      { key: 'XL', label: 'XL (25)' },
      { key: '2XL', label: '2XL (26)' }
    ];
  }

  // 4. 여성 장갑 (GW-GG)
  if (code.startsWith('GW-GG')) {
    return [
      { key: 'S', label: 'S (18)' },
      { key: 'M', label: 'M (19)' },
      { key: 'L', label: 'L (20)' },
      { key: 'XL', label: 'XL (21)' }
    ];
  }

  // 5. Default Fallback
  return [
    { key: 'S', label: 'S' },
    { key: 'M', label: 'M' },
    { key: 'L', label: 'L' },
    { key: 'XL', label: 'XL' },
    { key: '2XL', label: '2XL' },
    { key: '3XL', label: '3XL' },
    { key: 'Free', label: 'Free' }
  ];
}

// 개별 사이즈 단일 라벨 변환 헬퍼 함수
export function formatSizeDisplay(productCode: string, sizeKey: string): string {
  const options = getSizeOptionsByCode(productCode);
  const found = options.find((opt) => opt.key.toUpperCase() === (sizeKey || '').toUpperCase());
  return found ? found.label : sizeKey;
}
```

---

## 5. UI 및 컴포넌트 적용 가이드

### 1) 상품 상세 모달 (PRODUCT DETAIL Modal)
* `Stock by Size` 영역 렌더링 시, 제품의 `code`를 바탕으로 `getSizeOptionsByCode(code)`를 호출합니다.
* 해당 코드군에 유효한 사이즈 슬롯만 인풋 폼으로 동적 렌더링하고, 각 인풋의 레이블을 `option.label`(`M (95)` 등)로 표시합니다.

### 2) 판매/POS 화면 (SELL - SCAN RESULT / SIZE INVENTORY)
* 스캔된 제품 코드에 맞춰 사이즈 목록을 필터링 및 매핑합니다.
* 테이블의 `Size` 컬럼 헤더 아래에 단순 `S`, `M` 대신 `M (95)`, `S (30~31)`, `S (22)` 등의 라벨을 표시합니다.
* `+ Add` 버튼 클릭 시 `Cart` 및 DB 전송 데이터에는 원본 표준 키값(`key`: `'M'`, `'2XL'` 등)을 유지하되, UI Cart 테이블의 `Size` 컬럼 표시 시 `formatSizeDisplay(item.code, item.size)`를 거쳐 보여줍니다.

### 3) 백엔드/DB 연동 주의사항 (Checklist)
* `4XL` ~ `8XL` 사이즈가 추가되는 상의/하의의 경우, 상단에 기재된 DB SQL을 통해 `size_std` ENUM 타입 및 `inventories` 테이블 컬럼(`"4xl"`, `"5xl"` 등) 및 `inv_apply_delta` 함수를 먼저 최신화해야 합니다.
