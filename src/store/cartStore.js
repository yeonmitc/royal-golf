// src/store/cartStore.js
import { create } from 'zustand';

/**
 * 장바구니 아이템 구조
 *
 * {
 *   id: string;           // code + size 조합 (예: "GM-TP-AC-BK-01|M")
 *   code: string;         // 제품 코드
 *   size: string;         // "M", "L", "Free" ...
 *   sizeDisplay?: string; // "M(50)" 등 (있으면 사용)
 *   nameKo?: string;      // 제품명 (UI 표시용)
 *   unitPricePhp: number; // 판매 단가 (페소 3배)
 *   qty: number;          // 수량
 * }
 */

function makeCartItemId(code, size) {
  return `${code}|${size || ''}`;
}

export const useCartStore = create((set, get) => ({
  items: [],
  totalQty: 0,
  totalPrice: 0,
  guideId: null,

  /**
   * 장바구니 비우기 (결제 완료 후 호출)
   */
  clearCart: () => set({ items: [], totalQty: 0, totalPrice: 0, guideId: null }),

  /**
   * 장바구니에 아이템 추가
   * 같은 code + size 가 이미 있으면 qty 합산
   *
   * payload:
   * {
   *   code,
   *   size,
   *   sizeDisplay?,
   *   nameKo?,
   *   unitPricePhp,
   *   qty? (default 1)
   * }
   */
  addItem: (payload) => {
    const { code, size, sizeDisplay, nameKo, color, unitPricePhp, qty = 1 } = payload;

    if (!code) return;

    const id = makeCartItemId(code, size);
    const currentItems = get().items;
    const existing = currentItems.find((i) => i.id === id);

    if (existing) {
      const updated = currentItems.map((i) =>
        i.id === id
          ? {
              ...i,
              qty: i.qty + qty,
            }
          : i
      );
      const totalQty = updated.reduce((sum, i) => sum + i.qty, 0);
      const totalPrice = updated.reduce((sum, i) => sum + i.qty * (i.unitPricePhp || 0), 0);
      set({ items: updated, totalQty, totalPrice });
    } else {
      const nextItems = [
        ...currentItems,
        {
          id,
          code,
          size,
          sizeDisplay,
          nameKo,
          color: String(color || '').trim(),
          unitPricePhp: Number(unitPricePhp) || 0,
          qty: qty > 0 ? qty : 1,
        },
      ];
      const totalQty = nextItems.reduce((sum, i) => sum + i.qty, 0);
      const totalPrice = nextItems.reduce((sum, i) => sum + i.qty * (i.unitPricePhp || 0), 0);
      set({ items: nextItems, totalQty, totalPrice });
    }
  },

  /**
   * 수량 1 증가
   */
  incrementQty: (code, size) => {
    const id = makeCartItemId(code, size);
    const updated = get().items.map((i) => (i.id === id ? { ...i, qty: i.qty + 1 } : i));
    const totalQty = updated.reduce((sum, i) => sum + i.qty, 0);
    const totalPrice = updated.reduce((sum, i) => sum + i.qty * (i.unitPricePhp || 0), 0);
    set({ items: updated, totalQty, totalPrice });
  },

  /**
   * 수량 1 감소 (0 이하가 되면 제거)
   */
  decrementQty: (code, size) => {
    const id = makeCartItemId(code, size);
    const updated = get()
      .items.map((i) => (i.id === id ? { ...i, qty: i.qty - 1 } : i))
      .filter((i) => i.qty > 0);
    const totalQty = updated.reduce((sum, i) => sum + i.qty, 0);
    const totalPrice = updated.reduce((sum, i) => sum + i.qty * (i.unitPricePhp || 0), 0);
    set({ items: updated, totalQty, totalPrice });
  },

  /**
   * 특정 아이템 제거
   */
  removeItem: (code, size) => {
    const id = makeCartItemId(code, size);
    const filtered = get().items.filter((i) => i.id !== id);
    const totalQty = filtered.reduce((sum, i) => sum + i.qty, 0);
    const totalPrice = filtered.reduce((sum, i) => sum + i.qty * (i.unitPricePhp || 0), 0);
    set({ items: filtered, totalQty, totalPrice });
  },

  setItemColor: (code, size, color) => {
    const id = makeCartItemId(code, size);
    const currentItems = get().items;
    const updatedItems = currentItems.map((i) =>
      i.id === id ? { ...i, color: String(color || '').trim() } : i
    );
    const totalQty = updatedItems.reduce((sum, i) => sum + i.qty, 0);
    const totalPrice = updatedItems.reduce((sum, i) => sum + i.qty * (i.unitPricePhp || 0), 0);
    set({ items: updatedItems, totalQty, totalPrice });
  },

  /**
   * 프로모션 적용/해제 (가격 0원 토글)
   */
  togglePromo: (code, size) => {
    const id = makeCartItemId(code, size);
    const currentItems = get().items;
    const target = currentItems.find((i) => i.id === id);
    
    if (!target) return;

    const isFree = target.unitPricePhp === 0;
    let updatedItems;

    if (isFree) {
      // Restore original price
      // If originalUnitPricePhp is missing, we can't restore (shouldn't happen if flow is correct)
      // We will fallback to keeping it 0 if no original price found, or maybe user has to re-add.
      // But assuming we set it when making it free.
      if (target.originalUnitPricePhp != null) {
        updatedItems = currentItems.map((i) =>
          i.id === id ? { ...i, unitPricePhp: i.originalUnitPricePhp } : i
        );
      } else {
        return; // Cannot restore
      }
    } else {
      // Make it free
      updatedItems = currentItems.map((i) =>
        i.id === id
          ? {
              ...i,
              originalUnitPricePhp: i.unitPricePhp, // Save current price
              unitPricePhp: 0,
            }
          : i
      );
    }

    const totalQty = updatedItems.reduce((sum, i) => sum + i.qty, 0);
    const totalPrice = updatedItems.reduce((sum, i) => sum + i.qty * (i.unitPricePhp || 0), 0);
    set({ items: updatedItems, totalQty, totalPrice });
  },

  /**
   * 장바구니 요약 정보 (selector)
   */
  getTotalQty: () => get().items.reduce((sum, i) => sum + i.qty, 0),

  getTotalAmount: () => get().items.reduce((sum, i) => sum + i.qty * (i.unitPricePhp || 0), 0),

  setGuideId: (id) => set({ guideId: id }),
}));
