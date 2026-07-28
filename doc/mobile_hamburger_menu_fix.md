# 모바일 햄버거 메뉴 잘림 및 Header 내부 제한 문제 수정 요청

## 현재 문제

모바일 화면에서 햄버거 메뉴를 열면 다음 문제가 발생한다.

1. 메뉴 패널이 `header` 영역 안에서만 표시된다.
2. 메뉴의 너비와 높이가 `header` 크기에 제한되어 내용이 잘린다.
3. 메뉴가 본문 위로 자연스럽게 펼쳐지지 않고, `PRODUCT LOOKUP` 섹션과 겹친다.
4. 메뉴 닫기 버튼과 메뉴 항목 일부가 화면 밖으로 잘린다.
5. iPhone SE와 같이 화면 너비가 작은 환경에서 레이아웃이 특히 심하게 깨진다.

## 원인으로 확인할 부분

다음 항목을 우선 확인한다.

- `header` 또는 상위 요소에 `overflow: hidden`이 설정되어 있는지
- 모바일 메뉴가 `position: absolute`로 되어 있고, 기준 부모가 `header`로 잡혀 있는지
- `header`에 고정된 높이(`height`)가 설정되어 있는지
- 메뉴에 `width: 100%`를 사용하면서 부모 너비만 상속받고 있는지
- 메뉴의 `z-index`가 본문보다 낮은지
- 상위 요소에 `transform`, `filter`, `perspective`, `contain` 속성이 있어 `position: fixed` 기준이 변경되는지
- 모바일 메뉴가 헤더 DOM 내부에 렌더링되면서 stacking context의 영향을 받는지

---

# 수정 목표

모바일 햄버거 메뉴는 다음과 같이 동작해야 한다.

- 햄버거 버튼을 누르면 메뉴가 전체 화면 기준으로 열린다.
- 메뉴는 `header` 크기에 제한되지 않는다.
- 메뉴는 본문 위에 표시된다.
- 메뉴 높이는 화면 전체를 사용한다.
- 작은 모바일 화면에서도 잘리지 않는다.
- 메뉴가 열린 동안 배경 스크롤을 막는다.
- 닫기 버튼은 항상 화면 안에 표시된다.
- 메뉴를 닫으면 기존 화면 상태로 정상 복귀한다.

---

# 권장 구현 방식

## 1. 모바일 메뉴를 `fixed` 전체 화면 레이어로 변경

기존처럼 `header` 내부에서 `absolute`로 펼치지 말고, viewport 기준의 전체 화면 레이어로 만든다.

```tsx
{isMenuOpen && (
  <div className="mobile-menu-overlay">
    <div className="mobile-menu-panel">
      <div className="mobile-menu-header">
        <h2>Product List</h2>

        <button
          type="button"
          className="mobile-menu-close"
          onClick={() => setIsMenuOpen(false)}
          aria-label="Close menu"
        >
          ×
        </button>
      </div>

      <nav className="mobile-menu-content">
        {/* 기존 모바일 메뉴 내용 */}
      </nav>
    </div>
  </div>
)}
```

---

## 2. CSS 수정

```css
.mobile-menu-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;

  width: 100vw;
  min-height: 100dvh;

  background: rgba(0, 0, 0, 0.55);

  display: flex;
  align-items: stretch;
  justify-content: flex-start;
}

.mobile-menu-panel {
  position: relative;

  width: min(88vw, 360px);
  height: 100dvh;
  max-height: 100dvh;

  background: #05050a;
  color: #ffffff;

  overflow-y: auto;
  overflow-x: hidden;

  padding:
    max(16px, env(safe-area-inset-top))
    16px
    max(20px, env(safe-area-inset-bottom));

  box-sizing: border-box;

  box-shadow: 12px 0 30px rgba(0, 0, 0, 0.45);
}

.mobile-menu-header {
  position: sticky;
  top: 0;
  z-index: 2;

  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;

  min-height: 56px;
  padding: 8px 0;

  background: #05050a;
}

.mobile-menu-header h2 {
  margin: 0;
  font-size: 20px;
  line-height: 1.2;
}

.mobile-menu-close {
  flex: 0 0 auto;

  width: 44px;
  height: 44px;

  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 999px;

  background: #18182b;
  color: #ffffff;

  display: grid;
  place-items: center;

  font-size: 30px;
  line-height: 1;

  cursor: pointer;
}

.mobile-menu-content {
  width: 100%;
  padding-top: 12px;
}
```

---

# Header CSS에서 반드시 확인할 부분

기존 `header` 또는 상위 wrapper에 아래 속성이 있다면 모바일 메뉴가 잘릴 수 있다.

```css
header {
  overflow: hidden;
}
```

아래처럼 변경한다.

```css
header {
  overflow: visible;
}
```

단, 메뉴를 `position: fixed`로 완전히 분리하면 `header`의 `overflow` 영향을 받지 않아야 한다.

또한 다음 속성이 `header` 또는 상위 컨테이너에 있다면 제거하거나 적용 범위를 줄인다.

```css
transform: translateZ(0);
filter: blur(0);
perspective: 1000px;
contain: paint;
overflow: clip;
```

특히 `transform`이 적용된 부모 내부에 `position: fixed` 요소가 있으면 viewport가 아니라 해당 부모를 기준으로 배치되는 문제가 생길 수 있다.

---

# 가장 안전한 방식: Portal 사용

모바일 메뉴를 `header` DOM 내부가 아니라 `document.body`에 렌더링한다.

## React Portal 예시

```tsx
import { createPortal } from "react-dom";

function MobileMenu({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  if (!open || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      className="mobile-menu-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Mobile navigation"
      onClick={onClose}
    >
      <aside
        className="mobile-menu-panel"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mobile-menu-header">
          <h2>Product List</h2>

          <button
            type="button"
            className="mobile-menu-close"
            onClick={onClose}
            aria-label="Close menu"
          >
            ×
          </button>
        </div>

        <nav className="mobile-menu-content">
          {/* 메뉴 내용 */}
        </nav>
      </aside>
    </div>,
    document.body
  );
}
```

사용 예시:

```tsx
<MobileMenu
  open={isMenuOpen}
  onClose={() => setIsMenuOpen(false)}
/>
```

Portal을 사용하면 다음 문제를 피할 수 있다.

- `header`의 높이 제한
- `overflow: hidden`
- 잘못된 stacking context
- 부모 요소의 `position`
- 부모 너비에 의한 메뉴 폭 제한

---

# 메뉴가 열릴 때 배경 스크롤 막기

```tsx
import { useEffect } from "react";

useEffect(() => {
  if (!isMenuOpen) {
    return;
  }

  const previousOverflow = document.body.style.overflow;
  document.body.style.overflow = "hidden";

  return () => {
    document.body.style.overflow = previousOverflow;
  };
}, [isMenuOpen]);
```

---

# ESC 키로 닫기

```tsx
useEffect(() => {
  if (!isMenuOpen) {
    return;
  }

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      setIsMenuOpen(false);
    }
  };

  window.addEventListener("keydown", handleKeyDown);

  return () => {
    window.removeEventListener("keydown", handleKeyDown);
  };
}, [isMenuOpen]);
```

---

# Tailwind CSS를 사용하는 경우

```tsx
{isMenuOpen &&
  createPortal(
    <div
      className="fixed inset-0 z-[9999] min-h-[100dvh] bg-black/60"
      onClick={() => setIsMenuOpen(false)}
    >
      <aside
        className="
          relative
          h-[100dvh]
          w-[88vw]
          max-w-[360px]
          overflow-x-hidden
          overflow-y-auto
          bg-[#05050a]
          px-4
          pb-[max(20px,env(safe-area-inset-bottom))]
          pt-[max(16px,env(safe-area-inset-top))]
          text-white
          shadow-2xl
        "
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex min-h-14 items-center justify-between bg-[#05050a] py-2">
          <h2 className="m-0 text-xl font-semibold">Product List</h2>

          <button
            type="button"
            className="grid h-11 w-11 place-items-center rounded-full border border-white/15 bg-[#18182b] text-3xl leading-none"
            onClick={() => setIsMenuOpen(false)}
            aria-label="Close menu"
          >
            ×
          </button>
        </div>

        <nav className="w-full pt-3">
          {/* 메뉴 내용 */}
        </nav>
      </aside>
    </div>,
    document.body
  )}
```

---

# 기존 구현에서 변경해야 할 가능성이 높은 코드

## 변경 전 예시

```css
.header {
  position: relative;
  height: 64px;
  overflow: hidden;
}

.mobile-menu {
  position: absolute;
  top: 64px;
  left: 0;
  width: 100%;
  height: auto;
}
```

## 변경 후 예시

```css
.header {
  position: relative;
  min-height: 64px;
  overflow: visible;
}

.mobile-menu {
  position: fixed;
  inset: 0;
  width: 100vw;
  min-height: 100dvh;
  z-index: 9999;
}
```

---

# 레이아웃 충돌 방지

현재 스크린샷처럼 메뉴가 `PRODUCT LOOKUP` 카드 위에 반쯤 걸쳐 보이는 경우 아래 사항도 수정한다.

```css
main {
  position: relative;
  z-index: 1;
}

header {
  position: relative;
  z-index: 10;
}

.mobile-menu-overlay {
  z-index: 9999;
}
```

단순히 `z-index` 숫자만 높여도 부모 stacking context에 갇히면 해결되지 않을 수 있으므로 Portal 사용을 우선한다.

---

# 모바일 화면 너비 대응

iPhone SE 기준 최소 너비에서도 메뉴가 화면 밖으로 나가지 않게 한다.

```css
.mobile-menu-panel {
  width: min(88vw, 360px);
}

@media (max-width: 390px) {
  .mobile-menu-panel {
    width: calc(100vw - 24px);
  }
}
```

메뉴 내부 요소에는 다음을 적용한다.

```css
.mobile-menu-panel *,
.mobile-menu-panel *::before,
.mobile-menu-panel *::after {
  box-sizing: border-box;
}

.mobile-menu-panel input,
.mobile-menu-panel button,
.mobile-menu-panel select,
.mobile-menu-panel textarea {
  max-width: 100%;
}
```

---

# 접근성 요구사항

- 햄버거 버튼에 `aria-expanded` 추가
- 햄버거 버튼에 `aria-controls` 추가
- 메뉴에 `role="dialog"` 및 `aria-modal="true"` 추가
- 닫기 버튼에 `aria-label="Close menu"` 추가
- ESC 키로 닫기
- 바깥 배경 클릭 시 닫기
- 메뉴가 열릴 때 body 스크롤 방지

햄버거 버튼 예시:

```tsx
<button
  type="button"
  onClick={() => setIsMenuOpen(true)}
  aria-label="Open menu"
  aria-expanded={isMenuOpen}
  aria-controls="mobile-navigation"
>
  ☰
</button>
```

메뉴 예시:

```tsx
<aside
  id="mobile-navigation"
  role="dialog"
  aria-modal="true"
>
```

---

# 완료 조건

아래 조건을 모두 만족하도록 수정한다.

- [ ] 햄버거 메뉴가 `header` 영역에 갇히지 않는다.
- [ ] 메뉴가 화면 전체 높이로 표시된다.
- [ ] 메뉴 내용이 길면 내부 스크롤이 된다.
- [ ] 메뉴가 `PRODUCT LOOKUP` 및 본문 위에 정상 표시된다.
- [ ] 닫기 버튼이 화면 밖으로 잘리지 않는다.
- [ ] iPhone SE `375 × 667` 환경에서 정상 표시된다.
- [ ] Android 소형 화면에서도 정상 표시된다.
- [ ] 메뉴가 열린 동안 배경 페이지가 스크롤되지 않는다.
- [ ] 바깥 영역 클릭 시 메뉴가 닫힌다.
- [ ] ESC 키 입력 시 메뉴가 닫힌다.
- [ ] 데스크톱 헤더 레이아웃에는 영향이 없다.
- [ ] 메뉴를 닫은 후 body 스크롤이 정상 복원된다.

---

# 작업 지시 요약

1. 현재 모바일 메뉴가 어느 부모 요소 안에서 렌더링되는지 확인한다.
2. `header` 내부 `absolute` 방식이라면 제거한다.
3. 모바일 메뉴를 `position: fixed; inset: 0;` 형태로 변경한다.
4. 가능하면 React Portal로 `document.body`에 렌더링한다.
5. 메뉴 패널에 `height: 100dvh`와 `overflow-y: auto`를 적용한다.
6. 전체 오버레이에 충분히 높은 `z-index`를 적용한다.
7. 메뉴 오픈 시 body 스크롤을 잠근다.
8. iPhone SE `375 × 667`에서 직접 테스트한다.
9. 기존 데스크톱 메뉴와 헤더 디자인은 유지한다.
