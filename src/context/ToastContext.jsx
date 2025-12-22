import { createContext, useContext, useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';

const ToastContext = createContext(null);

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
        <div style={{
          position: 'fixed',
          top: 24,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          pointerEvents: 'none', // Allow clicks to pass through around the toast
        }}>
          {toasts.map((toast) => (
            <div
              key={toast.id}
              style={{
                background: 'linear-gradient(135deg, rgba(212, 175, 55, 0.9), rgba(243, 212, 122, 0.8))', // Slightly more opaque background for better text readibility
                color: '#000000', // Pure black for maximum sharpness
                padding: '12px 28px',
                borderRadius: '999px',
                // Multi-layered shadow for 3D depth + inset highlight for "glass" edge
                boxShadow: `
                  0 10px 40px rgba(0, 0, 0, 0.6),
                  0 4px 12px rgba(0, 0, 0, 0.3),
                  inset 0 1px 0 rgba(255, 255, 255, 0.5),
                  inset 0 -1px 0 rgba(0, 0, 0, 0.1)
                `,
                fontWeight: 700,
                fontSize: '15px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center',
                minWidth: '220px',
                animation: 'toast-fade-in 0.35s cubic-bezier(0.2, 0.8, 0.2, 1)',
                pointerEvents: 'auto',
                backdropFilter: 'blur(12px)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                letterSpacing: '0.02em',
                // textShadow removed for sharpness
              }}
            >
              {toast.message}
            </div>
          ))}
          <style>{`
            @keyframes toast-fade-in {
              from { opacity: 0; transform: translateY(-20px); }
              to { opacity: 1; transform: translateY(0); }
            }
          `}</style>
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
