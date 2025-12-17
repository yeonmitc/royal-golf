// src/components/admin/AdminRoute.jsx
import { useEffect } from 'react';
import { useAdminStore } from '../../store/adminStore';

export default function AdminRoute({ children }) {
  const isAuthed = useAdminStore((s) => s.isAuthorized());
  const openLoginModal = useAdminStore((s) => s.openLoginModal);

  useEffect(() => {
    if (!isAuthed) {
      openLoginModal();
    }
    // run only on mount to avoid reopening after manual close
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (isAuthed) return children;

  return (
    <div className="page-root">
      <div className="page-card">
        <div className="page-title">Admin Only</div>
        <div className="page-subtitle">관리자 인증이 필요합니다.</div>
      </div>
    </div>
  );
}
