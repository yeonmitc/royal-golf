// src/store/uiStore.js
import { create } from 'zustand';

/**
 * UI 전역 상태
 *
 * - sellMode: 'cart' | 'instant'
 *   - 'cart'   : 장바구니에 담기 모드
 *   - 'instant': 바로 결제(1개만 판매) 모드
 *
 * - barcodeInput: 현재 입력 중인 바코드 문자열
 * - isBarcodeFocused: 바코드 입력에 포커스가 가 있어야 하는지
 * - activeModal: 열려 있는 모달 키 (예: 'settings', 'productForm', null)
 */
export const useUiStore = create((set) => ({
  // 판매 모드
  sellMode: 'cart',

  setSellMode: (mode) =>
    set(() => ({
      sellMode: mode === 'instant' ? 'instant' : 'cart',
    })),

  // 바코드 입력값
  barcodeInput: '',
  setBarcodeInput: (value) =>
    set(() => ({
      barcodeInput: value,
    })),

  clearBarcodeInput: () =>
    set(() => ({
      barcodeInput: '',
    })),

  // 바코드 인풋 포커스 여부 (페이지 전환 시 다시 포커스 줄 때 사용)
  isBarcodeFocused: true,
  setBarcodeFocused: (focused) =>
    set(() => ({
      isBarcodeFocused: Boolean(focused),
    })),

  // 모달 관리
  activeModal: null, // 'settings' | 'productForm' | 'saleDetail' | null
  openModal: (key) =>
    set(() => ({
      activeModal: key,
    })),
  closeModal: () =>
    set(() => ({
      activeModal: null,
    })),

  // 사이드바 열림/닫힘
  sidebarOpen: true,
  toggleSidebar: () =>
    set((s) => ({
      sidebarOpen: !s.sidebarOpen,
    })),

  // 환율 (CNY → PHP)
  rate: Number(localStorage.getItem('rate_default') || '7.7') || 7.7,
  setRate: (next) =>
    set(() => {
      const value = Number(next) || 7.7;
      localStorage.setItem('rate_default', String(value));
      return { rate: value };
    }),
}));
