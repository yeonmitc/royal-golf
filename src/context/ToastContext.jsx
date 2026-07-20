import { createContext, useContext, useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';

const ToastContext = createContext(null);

const toastVariants = {
  initial: { opacity: 0, y: -20, scale: 0.95 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -10, scale: 0.95 },
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const idCounter = useRef(0);

  const showToast = useCallback((message, duration = 2500) => {
    const id = idCounter.current++;
    setToasts((prev) => [...prev, { id, message }]);

    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, duration);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {createPortal(
        <div
          style={{
            position: 'fixed',
            top: 24,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 'var(--z-toast, 400)',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            pointerEvents: 'none',
          }}
        >
          <AnimatePresence mode="popLayout">
            {toasts.map((toast) => (
              <motion.div
                key={toast.id}
                layout
                variants={toastVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={{ duration: 0.25, ease: 'easeOut' }}
                style={{
                  background:
                    'linear-gradient(135deg, rgba(212, 175, 55, 0.9), rgba(243, 212, 122, 0.8))',
                  color: '#000000',
                  padding: '12px 28px',
                  borderRadius: 'var(--radius-full, 999px)',
                  boxShadow: `
                    0 10px 40px rgba(0, 0, 0, 0.6),
                    0 4px 12px rgba(0, 0, 0, 0.3),
                    inset 0 1px 0 rgba(255, 255, 255, 0.5)
                  `,
                  fontWeight: 700,
                  fontSize: 'var(--font-lg, 15px)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  textAlign: 'center',
                  minWidth: '220px',
                  pointerEvents: 'auto',
                  backdropFilter: 'blur(12px)',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  letterSpacing: '0.02em',
                }}
              >
                {toast.message}
              </motion.div>
            ))}
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