// src/components/common/Layout.jsx
import Header from './Header';
import TopButton from './TopButton';

export default function Layout({ children }) {
  return (
    <div className="flex flex-col h-screen bg-[var(--bg-main)] text-[var(--text-main)]">
      <Header />
      <main
        className="flex-1 p-4"
        data-scroll-root="main"
        style={{
          height: 'calc(100vh - 91px)',
          minHeight: 0,
          overflowY: 'auto',
          overflowX: 'hidden',
        }}
      >
        {children}
      </main>
      <TopButton />
    </div>
  );
}
