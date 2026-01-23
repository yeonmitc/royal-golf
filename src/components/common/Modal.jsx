// src/components/common/Modal.jsx
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import Button from './Button';

export default function Modal({
  open,
  title,
  children,
  onClose,
  footer,
  size = 'md',
  containerStyle,
  align = 'center',
  topOffset = 0,
  className = '',
}) {
  const overlayRef = useRef(null);
  const containerRef = useRef(null);

  const isTypingElement = (el) => {
    if (!el) return false;
    const tag = el.tagName?.toLowerCase();
    return tag === 'input' || tag === 'textarea' || el.isContentEditable;
  };

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (e) => {
      if (isTypingElement(e.target)) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        onClose?.();
        return;
      }
      if (e.key === 'Tab') {
        const root = containerRef.current;
        if (!root) return;
        const focusables = root.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    document.addEventListener('keydown', onKeyDown);

    // 초기 포커스
    setTimeout(() => {
      const root = containerRef.current;
      if (!root) return;
      const focusTarget = root.querySelector(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      focusTarget?.focus();
    }, 0);

    return () => {
      document.body.style.overflow = prevOverflow || '';
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: align === 'top' ? 'flex-start' : 'center',
        justifyContent: 'center',
        paddingTop: align === 'top' ? topOffset : 0,
        background: 'rgba(0,0,0,0.7)',
        backdropFilter: 'blur(4px)',
      }}
    >
      <div
        ref={containerRef}
        className={className}
        style={{
          width:
            size === 'content' ? 'auto' : size === 'lg' ? '80vw' : size === 'md' ? '60vw' : '40vw',
          height:
            size === 'content' ? 'auto' : size === 'lg' ? '80vh' : size === 'md' ? '60vh' : '40vh',
          maxWidth:
            size === 'content'
              ? '90vw'
              : size === 'lg'
                ? '1200px'
                : size === 'md'
                  ? '960px'
                  : '720px',
          maxHeight:
            size === 'content' ? '80vh' : size === 'lg' ? '80vh' : size === 'md' ? '70vh' : '50vh',
          overflow: size === 'content' ? 'auto' : 'hidden',
          borderRadius: 16,
          border: '1px solid var(--border-soft)',
          background: 'linear-gradient(to bottom, #181824, #090910)',
          boxShadow: '0 24px 80px rgba(0,0,0,0.85)',
          padding: 16,
          ...(containerStyle || {}),
        }}
      >
        {title && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 8,
            }}
          >
            <div className="page-title" style={{ fontSize: '1.2rem' }}>
              {title}
            </div>
            <button
              type="button"
              aria-label="Close"
              onClick={onClose}
              style={{
                background: '#b91c1c',
                color: '#fff',
                border: 'none',
                width: 28,
                height: 28,
                borderRadius: 999,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 14,
                boxShadow: '0 0 0 1px rgba(185,28,28,0.6)',
              }}
            >
              ✕
            </button>
          </div>
        )}

        <div className="text-sm text-[var(--text-main)]" style={{ marginTop: 4 }}>
          {children}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 4 }}>
          {footer ? (
            footer
          ) : (
            <Button variant="outline" size="sm" onClick={onClose}>
              Close
            </Button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
