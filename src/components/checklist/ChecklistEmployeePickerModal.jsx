import { useEffect, useMemo, useState } from 'react';
import Modal from '../common/Modal';
import { useEmployees } from '../../features/employees/employeesHooks';
import Button from '../common/Button';

export default function ChecklistEmployeePickerModal({ open, onClose, onSelect }) {
  const { data: employees = [] } = useEmployees();
  const [picked, setPicked] = useState([]);
  const [isMobile, setIsMobile] = useState(false);

  const staffOptions = useMemo(
    () =>
      (employees || [])
        .map((e) => String(e?.english_name || '').trim())
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b)),
    [employees]
  );

  useEffect(() => {
    const checkMobile = () => {
      const ua = navigator.userAgent;
      const isMobileUA =
        /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Tablet|Kindle|Silk|PlayBook/i.test(
          ua
        );
      const isIOSDesktop = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
      setIsMobile(isMobileUA || isIOSDesktop || window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const employeeKey = useMemo(() => picked.slice().sort((a, b) => a.localeCompare(b)).join(', '), [picked]);

  const handlePick = (name) => {
    const n = String(name || '').trim();
    if (!n) return;
    setPicked((prev) => (prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n]));
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Select Employee"
      size="content"
      hideCloseButton={true}
      fullScreen={isMobile}
      footer={
        <>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setPicked([]);
              onClose?.();
            }}
          >
            Close
          </Button>
          <Button
            variant="success"
            size="sm"
            disabled={!employeeKey}
            onClick={() => {
              onSelect?.(employeeKey);
              setPicked([]);
              onClose?.();
            }}
          >
            Checklist
          </Button>
        </>
      }
    >
      <div style={{ width: isMobile ? '100%' : 'min(520px, 90vw)', display: 'grid', gap: 14 }}>
        <div style={{ textAlign: 'center', color: 'var(--text-main)' }}>
          Selected: {employeeKey || '-'}
        </div>

        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 10,
            justifyContent: 'center',
            alignItems: 'center',
            width: '100%',
          }}
        >
          {staffOptions.map((name) => {
            const active = picked.includes(name);
            return (
              <button
                key={name}
                type="button"
                onClick={() => handlePick(name)}
                style={{
                  height: '60px',
                  fontSize: '1.5rem',
                  borderRadius: '30px',
                  border: '1px solid rgba(255,255,255,0.20)',
                  background: active ? '#F97316' : 'rgba(255, 255, 255, 0.10)',
                  color: 'white',
                  fontWeight: 900,
                  cursor: 'pointer',
                  opacity: 1,
                  padding: '0 22px',
                  marginBottom: 2,
                }}
              >
                {name}
              </button>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}
