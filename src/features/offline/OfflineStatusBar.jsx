// src/features/offline/OfflineStatusBar.jsx
import { useCallback, useEffect, useRef, useState } from 'react';
import { useToast } from '../../context/ToastContext';
import {
  countPendingOfflineSales,
  getProductsSyncStatus,
  startBackgroundProductSync,
  syncOfflineSalesToServer,
  syncProductsToCache,
} from './offlineSync';
import { isBrowserOnline } from './offlineDB';

const STALE_MS = 24 * 60 * 60 * 1000; // 24 hours

function formatAgoShort(isoDate) {
  if (!isoDate) return 'never';
  const t = Date.parse(String(isoDate));
  if (!Number.isFinite(t)) return 'never';
  const diff = Date.now() - t;
  if (diff < 0) return 'now';
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export default function OfflineStatusBar() {
  const { showToast } = useToast();
  const [online, setOnline] = useState(() => isBrowserOnline());
  const [pendingCount, setPendingCount] = useState(0);
  const [syncedAt, setSyncedAt] = useState(null);
  const [syncStatus, setSyncStatus] = useState('unknown');
  const [cachedCount, setCachedCount] = useState(0);
  const [syncingProducts, setSyncingProducts] = useState(false);
  const [syncingSales, setSyncingSales] = useState(false);
  const firstRun = useRef(true);
  const bgStarted = useRef(false);

  const refreshCounts = useCallback(async () => {
    try {
      const [n, status] = await Promise.all([countPendingOfflineSales(), getProductsSyncStatus()]);
      setPendingCount(Number(n || 0));
      setSyncedAt(status.syncedAt);
      setSyncStatus(status.syncStatus || 'unknown');
      setCachedCount(status.cachedCount || 0);
    } catch (e) {
      console.warn('[OfflineStatusBar] refreshCounts failed:', e);
    }
  }, []);

  // Initial load + periodic refresh every 15 sec
  useEffect(() => {
    refreshCounts();
    const t = setInterval(refreshCounts, 15 * 1000);
    return () => clearInterval(t);
  }, [refreshCounts]);

  // Start background 24-hour sync (once)
  useEffect(() => {
    if (bgStarted.current) return;
    bgStarted.current = true;
    try {
      startBackgroundProductSync();
    } catch {
      /* ignore */
    }
  }, []);

  // navigator online/offline events
  useEffect(() => {
    const onOnline = () => {
      setOnline(true);
      showToast('Internet connection restored.');
      refreshCounts();
    };
    const onOffline = () => {
      setOnline(false);
      showToast('You can continue selling products while offline.');
      refreshCounts();
    };
    const onDbBlocked = (e) => {
      const msg = e?.detail?.message || 'Please close other shop tabs and refresh this page.';
      console.error('[OfflineStatusBar] DB blocked:', msg);
      showToast(msg);
    };
    const onDbUpdateRequired = (e) => {
      const msg =
        e?.detail?.message ||
        'An app update is ready. Please close other shop tabs and refresh this page.';
      console.warn('[OfflineStatusBar] DB update required:', msg);
      showToast(msg);
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    window.addEventListener('royal-inventory-db-blocked', onDbBlocked);
    window.addEventListener('royal-inventory-db-update-required', onDbUpdateRequired);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('royal-inventory-db-blocked', onDbBlocked);
      window.removeEventListener('royal-inventory-db-update-required', onDbUpdateRequired);
    };
  }, [showToast, refreshCounts]);

  // On first render: auto-sync if cache is empty or stale (>= 24 hours).
  // Does NOT block rendering. Runs async in background.
  useEffect(() => {
    if (!firstRun.current) return;
    firstRun.current = false;
    if (!online) return;
    (async () => {
      try {
        const status = await getProductsSyncStatus();
        const stamp = status?.syncedAt ? Date.parse(String(status.syncedAt)) : 0;
        const isEmptyCache = (status?.cachedCount || 0) === 0;
        const isStale = !stamp || Date.now() - stamp >= STALE_MS;
        if (isEmptyCache || isStale) {
          setSyncingProducts(true);
          await syncProductsToCache({
            onInfo: (msg) => {
              console.info('[OfflineStatusBar] initial auto-sync:', msg);
            },
          });
          await refreshCounts();
        }
      } catch (e) {
        console.warn('[OfflineStatusBar] initial auto-sync skipped:', e);
      } finally {
        setSyncingProducts(false);
      }
    })();
  }, [online]);

  const handleRefreshProducts = async () => {
    if (!online) {
      showToast('You are offline. Connect to the internet first to refresh.');
      return;
    }
    if (syncingProducts) return;
    setSyncingProducts(true);
    try {
      showToast('Refreshing product data...');
      await syncProductsToCache({
        onInfo: (msg) => {
          console.info('[OfflineStatusBar] product refresh info:', msg);
        },
        force: true,
      });
      await refreshCounts();
      showToast('Product data updated successfully.');
    } catch (e) {
      console.error(e);
      showToast(
        'Product data could not be updated. Previously saved data will continue to be used.'
      );
    } finally {
      setSyncingProducts(false);
    }
  };

  const handleSyncSales = async () => {
    if (!online) {
      showToast('You are offline. Connect to the internet first to sync.');
      return;
    }
    if (pendingCount <= 0) {
      showToast('No unsynced sales found.');
      return;
    }
    if (syncingSales) return;
    setSyncingSales(true);
    try {
      const result = await syncOfflineSalesToServer({
        onInfo: (msg) => {
          console.info('[OfflineStatusBar] syncSales info:', msg);
        },
      });
      showToast(
        result?.message ||
          (result?.failed
            ? `${result.success} synced, ${result.failed} failed.`
            : 'Sales records synced successfully.')
      );
    } catch (e) {
      console.error(e);
      showToast(`Sync failed: ${e?.message || String(e).slice(0, 80)}`);
    } finally {
      await refreshCounts();
      setSyncingSales(false);
    }
  };

  // Warnings
  const isStale = (() => {
    if (!syncedAt) return true;
    const t = Date.parse(String(syncedAt));
    return !Number.isFinite(t) || Date.now() - t >= STALE_MS;
  })();
  const isLongStale = (() => {
    if (!syncedAt) return true;
    const t = Date.parse(String(syncedAt));
    return !Number.isFinite(t) || Date.now() - t >= 7 * 24 * 60 * 60 * 1000;
  })();

  const onlineGreen = '#22c55e';
  const offlineOrange = '#f59e0b';
  const dotColor = online ? onlineGreen : offlineOrange;

  const label = online ? (
    <span style={{ color: onlineGreen, fontWeight: 700 }}>Online</span>
  ) : (
    <span style={{ color: offlineOrange, fontWeight: 700 }}>Offline Sales Mode</span>
  );

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: 10,
        padding: '6px 16px 2px 16px',
        borderTop: '1px solid rgba(255,255,255,0.03)',
        fontSize: 12,
        color: 'var(--text-main)',
        background: '#05050a',
        flexWrap: 'wrap',
      }}
    >
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '4px 10px',
          borderRadius: 999,
          border: `1px solid ${dotColor}55`,
          background: `${dotColor}14`,
        }}
        title={online ? 'Online' : 'Offline - sales are saved locally'}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: 999,
            background: dotColor,
            boxShadow: `0 0 6px ${dotColor}`,
          }}
        />
        {label}
      </span>

      {cachedCount > 0 ? (
        <span
          style={{ color: isLongStale ? '#ef4444' : isStale ? '#f59e0b' : 'var(--text-muted)' }}
        >
          Products cached: {cachedCount}
          {syncedAt ? ` (${formatAgoShort(syncedAt)})` : ''}
          {(isStale || syncStatus === 'failed') && (
            <span style={{ color: isLongStale ? '#ef4444' : '#f59e0b', marginLeft: 6 }}>
              {syncStatus === 'failed' ? ' - last sync failed' : ' - needs sync'}
            </span>
          )}
        </span>
      ) : (
        <span style={{ color: '#ef4444' }}>Product cache: empty</span>
      )}

      <span style={{ color: pendingCount > 0 ? '#f59e0b' : 'var(--text-muted)' }}>
        Unsynced sales:{' '}
        <strong style={{ color: pendingCount > 0 ? '#f59e0b' : 'inherit' }}>{pendingCount}</strong>
      </span>

      <button
        type="button"
        onClick={handleSyncSales}
        disabled={!online || syncingSales || pendingCount === 0}
        style={{
          padding: '4px 12px',
          borderRadius: 999,
          border: `1px solid ${
            !online || syncingSales || pendingCount === 0
              ? 'var(--border-soft)'
              : pendingCount > 0
                ? '#f59e0b'
                : 'rgba(255,255,255,0.12)'
          }`,
          background: pendingCount > 0 ? '#3a2a10' : '#141420',
          color: !online || syncingSales || pendingCount === 0 ? 'var(--text-muted)' : '#fcd34d',
          cursor: !online || syncingSales || pendingCount === 0 ? 'not-allowed' : 'pointer',
          fontSize: 12,
          fontWeight: 700,
          whiteSpace: 'nowrap',
        }}
        title={
          pendingCount === 0
            ? 'All sales are up to date.'
            : online
              ? 'Sync pending offline sales to the server.'
              : 'Connect to internet first.'
        }
      >
        {syncingSales
          ? 'Syncing sales records...'
          : pendingCount === 0
            ? 'All sales are up to date.'
            : `Sync ${pendingCount} Sale${pendingCount === 1 ? '' : 's'}`}
      </button>

      <button
        type="button"
        onClick={handleRefreshProducts}
        disabled={!online || syncingProducts}
        style={{
          padding: '4px 12px',
          borderRadius: 999,
          border: '1px solid var(--border-soft)',
          background: '#141420',
          color: !online || syncingProducts ? 'var(--text-muted)' : 'var(--text-main)',
          cursor: !online || syncingProducts ? 'not-allowed' : 'pointer',
          fontSize: 12,
          fontWeight: 600,
          whiteSpace: 'nowrap',
        }}
        title="Refresh product cache from server"
      >
        {syncingProducts ? 'Refreshing product data...' : 'Refresh Products'}
      </button>
    </div>
  );
}
