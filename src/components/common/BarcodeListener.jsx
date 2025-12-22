import { useEffect, useRef } from 'react';

export default function BarcodeListener({
  onCode,
  enabled = true,
  terminateKey = 'Enter',
  timeout = 30,
}) {
  const bufferRef = useRef('');
  const timerRef = useRef(null);

  useEffect(() => {
    if (!enabled) return;
    const handler = (e) => {
      // Ignore inputs from text fields to prevent conflict with manual typing
      if (
        e.target.tagName === 'INPUT' ||
        e.target.tagName === 'TEXTAREA' ||
        e.target.isContentEditable
      ) {
        return;
      }

      const k = e.key;
      if (k === terminateKey) {
        const code = bufferRef.current.trim();
        bufferRef.current = '';
        if (code) onCode?.(code);
        return;
      }
      if (k.length === 1) {
        bufferRef.current += k;
        clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
          const code = bufferRef.current.trim();
          bufferRef.current = '';
          if (code) onCode?.(code);
        }, timeout);
      }
    };
    window.addEventListener('keydown', handler);
    return () => {
      window.removeEventListener('keydown', handler);
      clearTimeout(timerRef.current);
      bufferRef.current = '';
    };
  }, [enabled, onCode, terminateKey, timeout]);

  return null;
}
