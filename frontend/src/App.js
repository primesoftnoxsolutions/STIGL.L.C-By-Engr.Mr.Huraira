import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import PrivateRoute from './components/PrivateRoute';
import InstallBanner from './components/InstallBanner';
import Login from './pages/Login';

const MainLayout = lazy(() => import('./components/Layout/MainLayout'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Employees = lazy(() => import('./pages/Employees'));
const Cylinders = lazy(() => import('./pages/Cylinders'));
const Customers = lazy(() => import('./pages/Customers'));
const Products = lazy(() => import('./pages/Products'));
const Reports = lazy(() => import('./pages/Reports'));
const DailyStockReport = lazy(() => import('./pages/DailyStockReport'));
const Sales = lazy(() => import('./pages/Sales'));
const Quotations = lazy(() => import('./pages/Quotations'));
const Rentals = lazy(() => import('./pages/Rentals'));
const Collections = lazy(() => import('./pages/Collections'));
const Suppliers = lazy(() => import('./pages/Suppliers'));
const Purchases = lazy(() => import('./pages/Purchases'));
const Deposits = lazy(() => import('./pages/Deposits'));
const StockTransfers = lazy(() => import('./pages/StockTransfers'));
const Notifications = lazy(() => import('./pages/Notifications'));
const Expenses = lazy(() => import('./pages/Expenses'));
const StaffSalary = lazy(() => import('./pages/StaffSalary'));
const CustomerItemRates = lazy(() => import('./pages/CustomerItemRates'));

const RouteLoader = () => (
  <div className="flex min-h-[40vh] items-center justify-center p-4 sm:p-6">
    <div className="rounded-2xl border border-slate-200 bg-white/90 px-5 py-3 text-sm font-medium text-slate-600 shadow-sm">
      Loading...
    </div>
  </div>
);

function App() {
  return (
    <AuthProvider>
      <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <InstallBanner />
        <Suspense fallback={<RouteLoader />}>
          <Routes>
            <Route path="/login" element={<Login />} />

            <Route element={<PrivateRoute><MainLayout /></PrivateRoute>}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/employees" element={
                <PrivateRoute requiredRole="super_admin">
                  <Employees />
                </PrivateRoute>
              } />
              <Route path="/cylinders" element={<Cylinders />} />
              <Route path="/customers" element={
                <PrivateRoute requiredRole="manager">
                  <Customers />
                </PrivateRoute>
              } />
              <Route path="/products" element={
                <PrivateRoute requiredRole="manager">
                  <Products />
                </PrivateRoute>
              } />
              <Route path="/reports" element={<Reports />} />
              <Route path="/reports/daily-stock" element={<DailyStockReport />} />
              <Route path="/sales" element={<Sales />} />
              <Route path="/deposits" element={
                <PrivateRoute requiredRole="manager">
                  <Deposits />
                </PrivateRoute>
              } />
              <Route path="/quotations" element={
                <PrivateRoute requiredRole="manager">
                  <Quotations />
                </PrivateRoute>
              } />
              <Route path="/rentals" element={
                <PrivateRoute requiredRole="manager">
                  <Rentals />
                </PrivateRoute>
              } />
              <Route path="/collections" element={
                <PrivateRoute requiredRole="manager">
                  <Collections />
                </PrivateRoute>
              } />
              <Route path="/suppliers" element={
                <PrivateRoute requiredRole="manager">
                  <Suppliers />
                </PrivateRoute>
              } />
              <Route path="/purchases" element={<Purchases />} />
              <Route path="/customer-item-rates" element={
                <PrivateRoute requiredRole="manager">
                  <CustomerItemRates />
                </PrivateRoute>
              } />
              <Route path="/stock-transfers" element={<StockTransfers />} />
              <Route path="/expenses" element={<Expenses />} />
              <Route path="/staff-salary" element={
                <PrivateRoute requiredRole="super_admin">
                  <StaffSalary />
                </PrivateRoute>
              } />
              <Route path="/notifications" element={<Notifications />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </Router>
    </AuthProvider>
  );
}

export default App;
