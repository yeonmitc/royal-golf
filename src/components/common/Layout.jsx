// src/components/common/Layout.jsx
import Header from './Header';
import TopButton from './TopButton';
import PageTransition from './PageTransition';
import OfflineStatusBar from '../../features/offline/OfflineStatusBar';

export default function Layout({ children }) {
  return (
    <div className="flex flex-col h-screen bg-[var(--bg-main)] text-[var(--text-main)]">
      <Header />
      <OfflineStatusBar />
      <main
        className="flex-1 p-4"
        data-scroll-root="main"
        style={{
          height:
            'calc(100vh - var(--header-height, 86px) - 5px - 42px)',
          minHeight: 0,
          overflowY: 'auto',
          overflowX: 'hidden',
        }}
      >
        <PageTransition>{children}</PageTransition>
      </main>
      <TopButton />
    </div>
  );
}
