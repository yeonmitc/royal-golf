// src/components/common/Header.jsx
import { useCallback, useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import logoUrl from '../../assets/logo-big.svg';
import { useAdminStore } from '../../store/adminStore';
import AttendanceModal from '../attendance/AttendanceModal';
import AdminLoginModal from '../admin/AdminLoginModal';
import ChecklistModal from '../checklist/ChecklistModal';
import ChecklistEmployeePickerModal from '../checklist/ChecklistEmployeePickerModal';
import Modal from './Modal';

export default function Header() {
  const isAdmin = useAdminStore((s) => s.isAuthorized());
  const loginModalOpen = useAdminStore((s) => s.loginModalOpen);
  const openLoginModal = useAdminStore((s) => s.openLoginModal);
  const closeLoginModal = useAdminStore((s) => s.closeLoginModal);
  const logout = useAdminStore((s) => s.logout);
  const [scrolled, setScrolled] = useState(false);
  const [logoHovered, setLogoHovered] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [attendanceModalOpen, setAttendanceModalOpen] = useState(false);
  const [checklistOpen, setChecklistOpen] = useState(false);
  const [checklistPickerOpen, setChecklistPickerOpen] = useState(false);
  const [checklistEmployeeNames, setChecklistEmployeeNames] = useState('');
  const [checkStockDone, setCheckStockDone] = useState(false);
  const [stockReminderOpen, setStockReminderOpen] = useState(false);

  const getYesterdayKey = useCallback(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }, []);

  useEffect(() => {
    const refresh = () => {
      const y = getYesterdayKey();
      const doneKey = `checkstock_yesterday_done_v1:${y}`;
      try {
        const done = localStorage.getItem(doneKey) === '1';
        setCheckStockDone(done);
        if (done && stockReminderOpen) setStockReminderOpen(false);
        return { y, done };
      } catch {
        setCheckStockDone(false);
        return { y, done: false };
      }
    };

    const maybeRemind = () => {
      const { y, done } = refresh();
      if (done) return;
      if (stockReminderOpen) return;
      const lastKey = `checkstock_reminder_last_v1:${y}`;
      let last = 0;
      try {
        last = Number(localStorage.getItem(lastKey) || 0) || 0;
      } catch {
        last = 0;
      }
      if (Date.now() - last < 60 * 60 * 1000) return;
      try {
        localStorage.setItem(lastKey, String(Date.now()));
      } catch {
        void 0;
      }
      setStockReminderOpen(true);
    };

    maybeRemind();

    const onStorage = (e) => {
      if (!e?.key) return;
      if (String(e.key).startsWith('checkstock_yesterday_done_v1:')) refresh();
    };
    window.addEventListener('storage', onStorage);

    const timer = setInterval(() => {
      maybeRemind();
    }, 60 * 1000);

    return () => {
      clearInterval(timer);
      window.removeEventListener('storage', onStorage);
    };
  }, [getYesterdayKey, stockReminderOpen]);

  const navItems = [
    { to: '/inventory', label: 'product list', adminOnly: false },
    { to: '/sell', label: 'sell product', adminOnly: false },
    { to: '/sales', label: 'sell list', adminOnly: false },
    { to: '/staff-sold', label: 'sold', adminOnly: false },
    { to: '/sold-products', label: 'sold products', adminOnly: true },
    { to: '/expenses', label: 'expenses', adminOnly: true },
    { to: '/profit', label: 'profit', adminOnly: true },
    { to: '/analyze', label: 'analyze', adminOnly: true },
    { to: '/guides', label: 'guides', adminOnly: true },
    { to: '/add', label: 'add product', adminOnly: true },
    { to: '/settings', label: 'setting', adminOnly: true },
  ];

  const visibleNavItems = navItems.filter((item) => !item.adminOnly || isAdmin);
  const adminItems = visibleNavItems.filter((item) => item.adminOnly);
  const publicItems = visibleNavItems.filter((item) => !item.adminOnly);

  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      const ua = navigator.userAgent;
      const isMobileUA =
        /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Tablet|Kindle|Silk|PlayBook/i.test(
          ua
        );
      const isIOSDesktop = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
      setIsMobile(isMobileUA || isIOSDesktop);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    const el = document.querySelector('main[data-scroll-root="main"]');
    const target = el || window;
    const onScroll = () => {
      const top = el ? el.scrollTop : window.scrollY || document.documentElement.scrollTop;
      setScrolled(top > 0);
    };
    target.addEventListener('scroll', onScroll);
    onScroll();
    return () => target.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className="px-4 border-b border-[#262637]"
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        backdropFilter: 'blur(6px)',
        background: 'linear-gradient(to right, #090910, #14141f, #090910)',
        boxShadow: scrolled ? '0 8px 24px rgba(0,0,0,0.65)' : 'none',
        marginBottom: 5,
      }}
    >
      <div
        style={{
          display: 'flex',
          height: 'var(--header-height, 86px)',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <NavLink
          to="/sell"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            aspectRatio: '1',
            marginRight: 12,
          }}
        >
          <img
            src={logoUrl}
            alt="Royal Golf Logo"
            style={{
              height: '100%',
              width: '100%',
              objectFit: 'contain',
              transition: 'transform 0.3s ease, filter 0.3s ease',
              transform: logoHovered ? 'scale(1.05)' : 'scale(1)',
              filter: logoHovered ? 'invert(1)' : 'none',
              willChange: 'transform, filter',
            }}
            onMouseEnter={() => setLogoHovered(true)}
            onMouseLeave={() => setLogoHovered(false)}
          />
        </NavLink>

        <nav
          aria-label="Main Navigation"
          className="header-nav"
          style={{
            display: 'flex',
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            gap: 40,
            whiteSpace: 'nowrap',
            overflowX: 'auto',
            padding: '0 20px',
          }}
        >
          {/* Left: Admin Items (Gold) */}
          <div style={{ display: 'flex', gap: 8 }}>
            {adminItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                style={({ isActive }) => ({
                  padding: '8px 12px',
                  fontSize: 16,
                  fontWeight: 600,
                  borderRadius: 999,
                  color: isActive ? 'var(--gold)' : 'var(--gold-soft)',
                  background: isActive ? '#141420' : 'transparent',
                  textDecoration: 'none',
                  boxShadow: isActive ? '0 0 0 1px rgba(212,175,55,0.45)' : 'none',
                  cursor: 'pointer',
                })}
                end
              >
                {item.label}
              </NavLink>
            ))}
          </div>

          {/* Right: Public Items */}
          <div style={{ display: 'flex', gap: 8 }}>
            {publicItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                style={({ isActive }) => ({
                  padding: '8px 12px',
                  fontSize: 16,
                  fontWeight: 500,
                  borderRadius: 999,
                  color: isActive ? 'var(--gold)' : 'var(--text-main)',
                  background: isActive ? '#141420' : 'transparent',
                  textDecoration: 'none',
                  boxShadow: isActive ? '0 0 0 1px rgba(212,175,55,0.45)' : 'none',
                  cursor: 'pointer',
                })}
                end
              >
                {item.label}
              </NavLink>
            ))}

            {/* Attendance Stamp Button - PC Only */}
            {!isMobile && (
              <button
                onClick={() => setAttendanceModalOpen(true)}
                style={{
                  padding: '8px 12px',
                  fontSize: 16,
                  fontWeight: 500,
                  borderRadius: 999,
                  color: 'var(--text-main)',
                  background: 'transparent',
                  border: '1px solid var(--border-soft)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  transition: 'all 0.2s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'var(--gold)';
                  e.currentTarget.style.color = 'var(--gold)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border-soft)';
                  e.currentTarget.style.color = 'var(--text-main)';
                }}
              >
                <span>⏰</span> Stamp
              </button>
            )}
            {!isMobile && (
              <button
                onClick={() => setChecklistPickerOpen(true)}
                style={{
                  padding: '8px 12px',
                  fontSize: 16,
                  fontWeight: 500,
                  borderRadius: 999,
                  color: 'var(--text-main)',
                  background: 'transparent',
                  border: '1px solid var(--border-soft)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  transition: 'all 0.2s ease',
                  marginLeft: 4,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'var(--gold)';
                  e.currentTarget.style.color = 'var(--gold)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border-soft)';
                  e.currentTarget.style.color = 'var(--text-main)';
                }}
              >
                <span>✅</span> Checklist
              </button>
            )}
            {!isMobile && (
              <NavLink
                to="/check-stock"
                style={{
                  padding: '8px 12px',
                  fontSize: 16,
                  fontWeight: 800,
                  borderRadius: 999,
                  color: checkStockDone ? '#22c55e' : '#ef4444',
                  background: checkStockDone ? 'rgba(34,197,94,0.14)' : 'rgba(239,68,68,0.18)',
                  border: `1px solid ${
                    checkStockDone ? 'rgba(34,197,94,0.55)' : 'rgba(239,68,68,0.55)'
                  }`,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  textDecoration: 'none',
                  transition: 'all 0.2s ease',
                  marginLeft: 4,
                }}
                end
              >
                <span>📦</span> Check Stock
              </NavLink>
            )}
          </div>
        </nav>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 999,
              border: '1px solid var(--border-soft)',
              background: isAdmin
                ? 'radial-gradient(circle at 30% 30%, #2ecc71, #1e7a4f 60%, #0b3a26)'
                : 'radial-gradient(circle at 30% 30%, #e74c3c, #8b1f1f 60%, #2a0d0d)',
              boxShadow: isAdmin
                ? '0 0 12px rgba(46, 204, 113, 0.35)'
                : '0 0 12px rgba(231, 76, 60, 0.35)',
              cursor: 'pointer',
            }}
            aria-label={isAdmin ? 'Admin unlocked' : 'Admin locked'}
            title={isAdmin ? 'Admin: ON' : 'Admin: OFF'}
            onClick={() => (isAdmin ? logout() : openLoginModal())}
          />
          <button
            type="button"
            className="hamburger-btn"
            aria-label="Open Menu"
            onClick={() => setMenuOpen(true)}
            style={{
              width: 'var(--tap-size, 44px)',
              height: 'var(--tap-size, 44px)',
              borderRadius: 8,
              border: '1px solid var(--border-soft)',
              background: '#141420',
              color: 'var(--text-main)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            ☰
          </button>
        </div>
      </div>
      {menuOpen && (
        <Modal open={menuOpen} title="Menu" onClose={() => setMenuOpen(false)} size="content">
          <div
            style={{ display: 'flex', flexDirection: 'column', gap: 8, width: 'min(360px, 90vw)' }}
          >
            {visibleNavItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => setMenuOpen(false)}
                style={({ isActive }) => ({
                  padding: '10px 14px',
                  fontSize: 16,
                  fontWeight: 600,
                  borderRadius: 12,
                  color: isActive ? 'var(--gold)' : 'var(--text-main)',
                  background: isActive ? '#141420' : '#101018',
                  textDecoration: 'none',
                  boxShadow: isActive
                    ? '0 0 0 1px rgba(212,175,55,0.45)'
                    : '0 0 0 1px var(--border-soft)',
                })}
                end
              >
                {item.label}
              </NavLink>
            ))}
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                setChecklistPickerOpen(true);
              }}
              style={{
                padding: '10px 14px',
                fontSize: 16,
                fontWeight: 700,
                borderRadius: 12,
                color: 'var(--text-main)',
                background: '#101018',
                textDecoration: 'none',
                boxShadow: '0 0 0 1px var(--border-soft)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <span>Checklist</span>
              <span>✅</span>
            </button>
            <NavLink
              to="/check-stock"
              onClick={() => setMenuOpen(false)}
              style={{
                padding: '10px 14px',
                fontSize: 16,
                fontWeight: 800,
                borderRadius: 12,
                color: checkStockDone ? '#22c55e' : '#ef4444',
                background: checkStockDone ? 'rgba(34,197,94,0.14)' : 'rgba(239,68,68,0.18)',
                textDecoration: 'none',
                boxShadow: `0 0 0 1px ${
                  checkStockDone ? 'rgba(34,197,94,0.55)' : 'rgba(239,68,68,0.55)'
                }`,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
              end
            >
              <span>Check Stock</span>
              <span>📦</span>
            </NavLink>
          </div>
        </Modal>
      )}
      <AdminLoginModal open={loginModalOpen} onClose={closeLoginModal} />
      <AttendanceModal open={attendanceModalOpen} onClose={() => setAttendanceModalOpen(false)} />
      <ChecklistEmployeePickerModal
        open={checklistPickerOpen}
        onClose={() => setChecklistPickerOpen(false)}
        onSelect={(names) => {
          setChecklistEmployeeNames(String(names || '').trim());
          setChecklistPickerOpen(false);
          setChecklistOpen(true);
        }}
      />
      <ChecklistModal
        open={checklistOpen}
        onClose={() => setChecklistOpen(false)}
        employeeNames={checklistEmployeeNames}
      />
      <Modal
        open={stockReminderOpen}
        title="Stock Check Reminder"
        onClose={() => setStockReminderOpen(false)}
        size="content"
      >
        <div style={{ display: 'grid', gap: 12, width: 'min(420px, 90vw)' }}>
          <div style={{ fontWeight: 800 }}>
            Please check yesterday&apos;s sold items stock.
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <NavLink
              to="/check-stock"
              onClick={() => setStockReminderOpen(false)}
              style={{
                padding: '8px 12px',
                fontSize: 14,
                fontWeight: 800,
                borderRadius: 10,
                color: 'var(--text-main)',
                background: '#141420',
                textDecoration: 'none',
                boxShadow: '0 0 0 1px rgba(212,175,55,0.45)',
              }}
              end
            >
              Open Check Stock
            </NavLink>
            <button
              type="button"
              onClick={() => setStockReminderOpen(false)}
              style={{
                padding: '8px 12px',
                fontSize: 14,
                fontWeight: 800,
                borderRadius: 10,
                color: 'var(--text-main)',
                background: '#101018',
                border: '1px solid var(--border-soft)',
                cursor: 'pointer',
              }}
            >
              OK
            </button>
          </div>
        </div>
      </Modal>
    </header>
  );
}
