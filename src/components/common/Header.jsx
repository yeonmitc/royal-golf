// src/components/common/Header.jsx
import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import logoUrl from '../../assets/logo-big.svg';
import { useAdminStore } from '../../store/adminStore';
import AdminLoginModal from '../admin/AdminLoginModal';
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

  const navItems = [
    { to: '/inventory', label: 'product list', adminOnly: false },
    { to: '/check-stock', label: 'check stock', adminOnly: false },
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
          to="/sold-products"
          className="flex items-center gap-3 px-2 rounded-md transition-colors"
          style={{
            background: 'transparent',
            height: 'var(--header-height, 86px)',
            alignItems: 'center',
            cursor: 'pointer',
            textDecoration: 'none',
          }}
        >
          <img
            src={logoUrl}
            alt="Logo"
            style={{
              width: 'var(--logo-size, 86px)',
              height: 'var(--logo-size, 86px)',
              borderRadius: 8,
              background: 'transparent',
              display: 'block',
              transition: 'transform 200ms ease, filter 200ms ease',
              transform: logoHovered ? 'scale(1.2)' : 'scale(1)',
              filter: logoHovered ? 'brightness(0) invert(1)' : 'none',
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
          </div>
        </Modal>
      )}
      <AdminLoginModal open={loginModalOpen} onClose={closeLoginModal} />
    </header>
  );
}
