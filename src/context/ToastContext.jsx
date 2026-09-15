import { createContext, useContext, useState, useCallback, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { sanitizeText } from '../utils/errorHandler';

const ToastContext = createContext(null);

const ERROR_DEDUPE_WINDOW_MS = 3000;
const MAX_ERROR_TOASTS = 3;
const ERROR_FINGERPRINT_TTL_MS = 30000;

const TYPE_STYLES = {
  success: {
    background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.92), rgba(22, 163, 74, 0.85))',
    color: '#fff',
    border: '1px solid rgba(255, 255, 255, 0.25)',
    borderRadius: '10px',
  },
  warning: {
    background: 'linear-gradient(135deg, rgba(212, 175, 55, 0.9), rgba(243, 212, 122, 0.8))',
    color: '#000',
    border: '1px solid rgba(255, 255, 255, 0.2)',
    borderRadius: '999px',
  },
  info: {
    background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.92), rgba(37, 99, 235, 0.85))',
    color: '#fff',
    border: '1px solid rgba(255, 255, 255, 0.25)',
    borderRadius: '10px',
  },
  error: {
    background: 'linear-gradient(135deg, rgba(220, 38, 38, 0.95), rgba(185, 28, 28, 0.9))',
    color: '#fff',
    border: '1px solid rgba(255, 255, 255, 0.2)',
    borderRadius: '10px',
  },
};

const toastVariants = {
  initial: { opacity: 0, y: -20, scale: 0.95 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -10, scale: 0.95 },
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const idCounter = useRef(0);
  const recentErrorsRef = useRef(new Map());

  const showToast = useCallback((message, duration = 2500) => {
    const id = idCounter.current++;
    setToasts((prev) => [...prev, { id, message, type: 'warning' }]);

    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, duration);
  }, []);

  const showToastTyped = useCallback(({ message, type = 'info', duration, code, rawCode }) => {
    if (type === 'error') {
      const safeMessage = sanitizeText(message);
      const fingerprint = `${code || 'UNKNOWN'}|${rawCode || 'UNKNOWN'}|${safeMessage}`;
      const now = Date.now();
      const lastShown = recentErrorsRef.current.get(fingerprint);
      if (lastShown && now - lastShown < ERROR_DEDUPE_WINDOW_MS) {
        // Same error within dedupe window — skip but still log
        console.debug(`[ToastDedupe] Suppressed duplicate error toast: ${code}`);
        return null;
      }
      recentErrorsRef.current.set(fingerprint, now);
      
      // Cleanup old entries
      if (recentErrorsRef.current.size > 50) {
        for (const [key, ts] of recentErrorsRef.current) {
          if (now - ts > ERROR_FINGERPRINT_TTL_MS) recentErrorsRef.current.delete(key);
        }
      }
    }

    const id = idCounter.current++;
    const effectiveDuration = type === 'error' ? (duration ?? 5000) : (duration ?? 2500);
    const lines = [];
    if (code) lines.push(`ERROR [${code}]`);
    lines.push(message);
    if (rawCode) lines.push(`Code: ${rawCode}`);
    const content = lines.join('\n');

    setToasts((prev) => {
      let next = [...prev, { id, message: content, type }];
      // Enforce max error toasts
      const errorToasts = next.filter(t => t.type === 'error');
      if (errorToasts.length > MAX_ERROR_TOASTS) {
        const oldestErrorId = errorToasts[0].id;
        next = next.filter(t => t.id !== oldestErrorId);
      }
      return next;
    });

    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, effectiveDuration);

    return id;
  }, []);

  const contextValue = useMemo(() => ({ showToast, showToastTyped }), [showToast, showToastTyped]);

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      {createPortal(
        <div
          aria-live="polite"
          style={{
            position: 'fixed',
            top: 24,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 2147483647,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            pointerEvents: 'none',
          }}
        >
          <AnimatePresence mode="popLayout">
            {toasts.map((toast) => {
              const typeStyle = TYPE_STYLES[toast.type] || TYPE_STYLES.warning;
              const isError = toast.type === 'error';
              return (
                <motion.div
                    key={toast.id}
                    layout
                    variants={toastVariants}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    transition={{ duration: 0.25, ease: 'easeOut' }}
                    style={{
                      ...typeStyle,
                      padding: isError ? '12px 20px' : '12px 28px',
                      boxShadow: `
                        0 10px 40px rgba(0, 0, 0, 0.6),
                        0 4px 12px rgba(0, 0, 0, 0.3),
                        inset 0 1px 0 rgba(255, 255, 255, ${isError ? '0.15' : '0.5'})
                      `,
                      fontWeight: 700,
                      fontSize: isError ? 'var(--font-sm, 13px)' : 'var(--font-lg, 15px)',
                      display: 'flex',
                      alignItems: isError ? 'stretch' : 'center',
                      flexDirection: 'column',
                      justifyContent: 'center',
                      textAlign: isError ? 'left' : 'center',
                      minWidth: isError ? '280px' : '220px',
                      maxWidth: '90vw',
                      whiteSpace: 'pre-line',
                      fontFamily: isError ? 'ui-monospace, SFMono-Regular, Menlo, monospace' : 'inherit',
                      pointerEvents: 'auto',
                      backdropFilter: 'blur(12px)',
                      letterSpacing: isError ? '0.01em' : '0.02em',
                      lineHeight: 1.5,
                      position: 'relative',
                    }}
                  >
                    <span style={{ flex: 1 }}>{toast.message}</span>
                    {isError && (
                      <button
                        onClick={() => {
                          try { navigator.clipboard.writeText(toast.message); } catch { /* noop */ }
                        }}
                        style={{
                          marginTop: 6,
                          alignSelf: 'flex-end',
                          background: 'rgba(255,255,255,0.2)',
                          border: '1px solid rgba(255,255,255,0.3)',
                          borderRadius: 6,
                          color: '#fff',
                          fontSize: 11,
                          fontWeight: 600,
                          padding: '3px 10px',
                          cursor: 'pointer',
                          letterSpacing: '0.04em',
                        }}
                      >
                        Copy
                      </button>
                    )}
                  </motion.div>
              );
            })}
          </AnimatePresence>
        </div>,
        document.body
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}