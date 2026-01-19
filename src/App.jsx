// src/App.jsx
import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import AdminRoute from './components/admin/AdminRoute';
import Layout from './components/common/Layout';
import AddProductPage from './pages/AddProductPage';
import AnalyzePage from './pages/AnalyzePage';
import CheckStockPage from './pages/CheckStockPage';
import GuidesPage from './pages/GuidesPage';
import HomePage from './pages/HomePage';
import InventoryPage from './pages/InventoryPage';
import SalesHistoryPage from './pages/SalesHistoryPage';
import SellPage from './pages/SellPage';
import SettingsPage from './pages/SettingsPage';

const LogsPageDev = import.meta.env.DEV ? lazy(() => import('./pages/LogsPage')) : null;

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/sell" element={<SellPage />} />
        <Route path="/inventory" element={<InventoryPage />} />
        <Route path="/sales" element={<SalesHistoryPage />} />
        <Route
          path="/analyze"
          element={
            <AdminRoute>
              <AnalyzePage />
            </AdminRoute>
          }
        />
        <Route
          path="/guides"
          element={
            <AdminRoute>
              <GuidesPage />
            </AdminRoute>
          }
        />
        {LogsPageDev && (
          <Route
            path="/logs"
            element={
              <AdminRoute>
                <Suspense fallback={<div className="page-card">Loading...</div>}>
                  <LogsPageDev />
                </Suspense>
              </AdminRoute>
            }
          />
        )}
        <Route
          path="/add"
          element={
            <AdminRoute>
              <AddProductPage />
            </AdminRoute>
          }
        />
        <Route
          path="/settings"
          element={
            <AdminRoute>
              <SettingsPage />
            </AdminRoute>
          }
        />
        <Route path="/check-stock" element={<CheckStockPage />} />
        {/* 404 */}
        <Route path="*" element={<div className="page-card">Page Not Found</div>} />
      </Routes>
    </Layout>
  );
}
