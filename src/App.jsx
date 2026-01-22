// src/App.jsx
import { Route, Routes } from 'react-router-dom';
import AdminRoute from './components/admin/AdminRoute';
import Layout from './components/common/Layout';
import AddProductPage from './pages/AddProductPage';
import AnalyzePage from './pages/AnalyzePage';
import CheckStockPage from './pages/CheckStockPage';
import ExpensesPage from './pages/ExpensesPage';
import GuidesPage from './pages/GuidesPage';
import HomePage from './pages/HomePage';
import InventoryPage from './pages/InventoryPage';
import SalesHistoryPage from './pages/SalesHistoryPage';
import SellPage from './pages/SellPage';
import SettingsPage from './pages/SettingsPage';
import SoldProductPage from './pages/SoldProductPage';
import StaffSoldProductPage from './pages/StaffSoldProductPage';
import ProfitPage from './pages/ProfitPage';

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/sell" element={<SellPage />} />
        <Route path="/inventory" element={<InventoryPage />} />
        <Route path="/sales" element={<SalesHistoryPage />} />
        <Route
          path="/expenses"
          element={
            <AdminRoute>
              <ExpensesPage />
            </AdminRoute>
          }
        />
        <Route
          path="/sold-products"
          element={
            <AdminRoute>
              <SoldProductPage />
            </AdminRoute>
          }
        />
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
        <Route
          path="/profit"
          element={
            <AdminRoute>
              <ProfitPage />
            </AdminRoute>
          }
        />
        <Route path="/staff-sold" element={<StaffSoldProductPage />} />
        <Route path="/check-stock" element={<CheckStockPage />} />
        {/* 404 */}
        <Route path="*" element={<div className="page-card">Page Not Found</div>} />
      </Routes>
    </Layout>
  );
}
