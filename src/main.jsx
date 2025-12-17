// src/main.jsx
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { seedIfEmpty } from './db/seedLoader';
import './index.css';
import QueryProvider from './providers/QueryProvider';

// Restore original deep link if GH Pages served 404.html and redirected
try {
  const saved = sessionStorage.getItem('__gh_redirect__');
  if (saved) {
    sessionStorage.removeItem('__gh_redirect__');
    const base = import.meta.env.BASE_URL || '/';
    const prefix = base.endsWith('/') ? base.slice(0, -1) : base;
    const target = saved.startsWith(prefix) ? saved : prefix + saved;
    if (location.pathname !== target) {
      history.replaceState(null, '', target);
    }
  }
} catch {
  // ignore
}

await seedIfEmpty();

const basename = import.meta.env.BASE_URL || '/';
ReactDOM.createRoot(document.getElementById('root')).render(
  <BrowserRouter basename={basename}>
    <QueryProvider>
      <App />
    </QueryProvider>
  </BrowserRouter>
);


// Offline support (after first load)
if (import.meta.env.PROD) {
  if ('serviceWorker' in navigator) {
    // navigator.serviceWorker.register('/sw.js');
  }
}
