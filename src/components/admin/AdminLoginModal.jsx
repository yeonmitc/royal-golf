// src/components/admin/AdminLoginModal.jsx
import { useEffect, useMemo, useState } from 'react';
import { useAdminStore } from '../../store/adminStore';
import { sha256Hex } from '../../utils/crypto';
import Button from '../common/Button';
import Input from '../common/Input';
import Modal from '../common/Modal';

const DEFAULT_TTL_MIN = Number(import.meta.env.VITE_ADMIN_SESSION_TTL_MINUTES || 720);

export default function AdminLoginModal({ open, onClose, onSuccess }) {
  const { setSession } = useAdminStore();
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [pending, setPending] = useState(false);

  const expectedHash = useMemo(() => {
    const envHash = String(import.meta.env.VITE_ADMIN_PASSWORD_HASH || '').trim().toLowerCase();
    const fallbackHash = 'd346d925ff46a6e25fbda8801b37235bc2460ef13291b565312099c4b18c6e66';
    return envHash || fallbackHash;
  }, []);

  useEffect(() => {
    if (!open) {
      setPw('');
      setErr('');
      setPending(false);
    }
  }, [open]);

  async function handleLogin() {
    setErr('');
    if (!pw) {
      setErr('Please enter password.');
      return;
    }

    setPending(true);
    try {
      const inputHash = (await sha256Hex(pw)).toLowerCase();
      if (inputHash !== expectedHash) {
        setErr('Incorrect password.');
        return;
      }

      const expiresAt = Date.now() + DEFAULT_TTL_MIN * 60 * 1000;
      setSession(expiresAt);
      onSuccess?.();
      onClose?.();
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Admin Authentication"
      size="content"
      containerStyle={{ width: '30vw', maxWidth: '30vw' }}
      align="top"
      topOffset={10}
      footer={
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            gap: 8,
            width: '40%',
            margin: '0 auto',
          }}
        >
          <Button
            variant="primary"
            disabled={pending}
            onClick={handleLogin}
            style={{ width: 100, margin: '10px auto' }}
          >
            {pending ? 'Checking...' : 'Unlock'}
          </Button>
        </div>
      }
    >
      <div style={{ display: 'grid', gap: 12 }}>
        <div className="text-sm text-[var(--text-muted)]">
          Admin authentication is required for inventory modification/deletion/product addition/settings.
        </div>

        <Input
          label="Admin Password"
          type="password"
          autoFocus
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleLogin();
          }}
          placeholder="Password"
          error={err || undefined}
        />
      </div>
    </Modal>
  );
}
