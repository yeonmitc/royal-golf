import { useEffect, useState } from 'react';
import Button from './Button';

export default function TopButton() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = document.querySelector('main[data-scroll-root="main"]');
    const target = el || window;
    const onScroll = () => {
      const top = el ? el.scrollTop : window.scrollY || document.documentElement.scrollTop;
      setVisible(top >= 0);
    };
    target.addEventListener('scroll', onScroll);
    onScroll();
    return () => target.removeEventListener('scroll', onScroll);
  }, []);
  function toTop() {
    const el = document.querySelector('main[data-scroll-root="main"]');
    if (el) el.scrollTo({ top: 0, behavior: 'smooth' });
    else window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  if (!visible) return null;
  return (
    <div style={{ position: 'fixed', right: 16, bottom: 16, zIndex: 1001 }}>
      <Button variant="primary" size="sm" onClick={toTop}>
        Top
      </Button>
    </div>
  );
}
