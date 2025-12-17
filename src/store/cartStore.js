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

  /**
   * 장바구니 비우기 (결제 완료 후 호출)
   */
  clearCart: () => set({ items: [], totalQty: 0, totalPrice: 0 }),

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
    const { code, size, sizeDisplay, nameKo, unitPricePhp, qty = 1 } = payload;

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
          originalUnitPricePhp: Number(unitPricePhp) || 0,
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

  setUnitPrice: (code, size, newUnitPrice) => {
    const id = makeCartItemId(code, size);
    const updated = get().items.map((i) =>
      i.id === id ? { ...i, unitPricePhp: Number(newUnitPrice) || 0 } : i
    );
    const totalQty = updated.reduce((sum, i) => sum + i.qty, 0);
    const totalPrice = updated.reduce((sum, i) => sum + i.qty * (i.unitPricePhp || 0), 0);
    set({ items: updated, totalQty, totalPrice });
  },

  /**
   * 장바구니 요약 정보 (selector)
   */
  getTotalQty: () => get().items.reduce((sum, i) => sum + i.qty, 0),

  getTotalAmount: () => get().items.reduce((sum, i) => sum + i.qty * (i.unitPricePhp || 0), 0),
}));
