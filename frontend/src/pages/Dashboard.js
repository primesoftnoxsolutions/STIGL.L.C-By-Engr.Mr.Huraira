import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import api from '../utils/api';
import { getUaeMonthKey } from '../utils/uaeDate';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import SignaturePad from '../components/SignaturePad';
import {
  CircleStackIcon,
  ShoppingCartIcon,
  BanknotesIcon,
  PencilSquareIcon,
  WrenchScrewdriverIcon,
  BeakerIcon,
  FunnelIcon,
  EyeIcon,
  BellAlertIcon,
  XMarkIcon,
  SparklesIcon,
  ChevronRightIcon,
  UserGroupIcon,
  DocumentTextIcon,
  CubeIcon
} from '@heroicons/react/24/outline';

const DecorativeSparkline = ({ stroke = '#8b5cf6' }) => (
  <svg viewBox="0 0 80 28" className="h-6 w-16" aria-hidden="true">
    <path
      d="M0 18 L12 14 L24 20 L36 8 L48 12 L60 6 L72 10 L80 4"
      fill="none"
      stroke={stroke}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const OverviewMetricCard = ({ title, value, icon: Icon, iconBg, iconColor }) => (
  <div className="dash-card p-3 sm:p-3.5">
    <div className="flex items-start gap-2.5">
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${iconBg}`}>
        <Icon className={`h-4 w-4 ${iconColor}`} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{title}</p>
        <p className="mt-0.5 text-lg font-bold text-slate-900 sm:text-xl">{value}</p>
      </div>
    </div>
  </div>
);

const QuantityMetricCard = ({ title, value, icon: Icon, iconBg, iconColor, sparkColor }) => (
  <div className="dash-card p-3 sm:p-3.5">
    <div className="flex items-start justify-between gap-2">
      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${iconBg}`}>
        <Icon className={`h-4 w-4 ${iconColor}`} />
      </div>
      <DecorativeSparkline stroke={sparkColor} />
    </div>
    <p className="mt-2 text-[9px] font-bold uppercase tracking-[0.12em] text-slate-500">{title}</p>
    <p className="mt-0.5 text-xl font-bold text-slate-900 sm:text-2xl">{value}</p>
  </div>
);

const SalesTrendPanel = ({ chartData, periodLabel }) => (
  <div className="dash-card p-3 sm:p-4">
    <div className="mb-3 flex items-center justify-between gap-2">
      <h3 className="text-sm font-bold text-slate-900 sm:text-base">Sales Trend</h3>
      <span className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
        {periodLabel}
      </span>
    </div>
    {chartData.length > 0 ? (
      <div className="h-44 w-full sm:h-48">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="salesTrendFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} width={48} />
            <Tooltip
              contentStyle={{
                borderRadius: '12px',
                border: '1px solid #e2e8f0',
                boxShadow: '0 8px 24px rgba(15,23,42,0.08)'
              }}
              formatter={(value) => [`AED ${Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 'Total Sales']}
            />
            <Area type="monotone" dataKey="total" stroke="#7c3aed" strokeWidth={2.5} fill="url(#salesTrendFill)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    ) : (
      <div className="flex h-44 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 text-xs text-slate-500 sm:h-48">
        No recent sales data for this period
      </div>
    )}
  </div>
);

const SignatureSidebarCard = ({ userSignature, onUpdate }) => (
  <div className="dash-card p-3 sm:p-4">
    <h3 className="text-sm font-bold text-slate-900">Company Signature</h3>
    <div className="mt-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-4">
      {userSignature ? (
        <img src={userSignature} alt="Signature" className="mx-auto h-12 max-w-full object-contain" />
      ) : (
        <p className="text-center text-xs text-slate-500">No signature saved yet</p>
      )}
    </div>
    <button type="button" onClick={onUpdate} className="dash-btn-primary mt-3 w-full px-3 py-2 text-xs">
      <PencilSquareIcon className="h-3.5 w-3.5" />
      {userSignature ? 'Update Signature' : 'Add Signature'}
    </button>
  </div>
);

const SnapshotRow = ({ icon: Icon, iconBg, iconColor, label, value, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={!onClick}
    className={`flex w-full items-center gap-2.5 border-b border-slate-100 py-2.5 text-left last:border-b-0 ${onClick ? 'hover:bg-slate-50/80' : 'cursor-default'}`}
  >
    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${iconBg}`}>
      <Icon className={`h-3.5 w-3.5 ${iconColor}`} />
    </div>
    <span className="flex-1 text-xs font-medium text-slate-700">{label}</span>
    <span className="text-xs font-bold text-slate-900">{value}</span>
    {onClick && <ChevronRightIcon className="h-3.5 w-3.5 text-slate-400" />}
  </button>
);

const BusinessSnapshotPanel = ({ stats, inactiveCount, onInactiveClick }) => {
  const totalCylinders = Number(stats?.cylinderStats?.total || 0);
  const availableCylinders = Number(stats?.cylinderStats?.available || 0);
  const stockScore = totalCylinders > 0
    ? Math.min(100, Math.round((availableCylinders / totalCylinders) * 100))
    : 0;

  return (
    <div className="dash-card p-3 sm:p-4">
      <h3 className="text-sm font-bold text-slate-900">Business Snapshot</h3>
      <div className="mt-3 flex flex-col items-center">
        <div
          className="relative flex h-28 w-28 items-center justify-center rounded-full"
          style={{
            background: `conic-gradient(#7c3aed ${stockScore * 3.6}deg, #ede9fe 0deg)`
          }}
        >
          <div className="flex h-[5.5rem] w-[5.5rem] flex-col items-center justify-center rounded-full bg-white shadow-inner">
            <span className="text-2xl font-bold text-violet-700">{stockScore}%</span>
            <span className="mt-0.5 px-1.5 text-center text-[9px] font-semibold uppercase tracking-wide text-slate-500">
              Stock Availability
            </span>
          </div>
        </div>
      </div>
      <div className="mt-3">
        <SnapshotRow
          icon={UserGroupIcon}
          iconBg="bg-violet-100"
          iconColor="text-violet-600"
          label="Active Customers"
          value={Number(stats?.customerStats?.total || 0).toLocaleString('en-US')}
        />
        <SnapshotRow
          icon={DocumentTextIcon}
          iconBg="bg-sky-100"
          iconColor="text-sky-600"
          label="Total Invoices"
          value={Number(stats?.salesStats?.totalInvoices || 0).toLocaleString('en-US')}
        />
        <SnapshotRow
          icon={CubeIcon}
          iconBg="bg-amber-100"
          iconColor="text-amber-600"
          label="Low Stock Items"
          value={Number(stats?.cylinderStats?.empty || 0).toLocaleString('en-US')}
        />
        <SnapshotRow
          icon={EyeIcon}
          iconBg="bg-rose-100"
          iconColor="text-rose-600"
          label="Inactive Customers"
          value={Number(inactiveCount || 0).toLocaleString('en-US')}
          onClick={onInactiveClick}
        />
      </div>
    </div>
  );
};

const Dashboard = () => {
  const { isEmployee, user, updateSignature } = useAuth();
  const initialMonthKey = getUaeMonthKey();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showSignaturePad, setShowSignaturePad] = useState(false);
  const [userSignature, setUserSignature] = useState(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [inactiveOpen, setInactiveOpen] = useState(false);
  const [currentMonthKey, setCurrentMonthKey] = useState(initialMonthKey);
  const [autoMonth, setAutoMonth] = useState(true);
  const [draftFilter, setDraftFilter] = useState(() => ({
    mode: 'month',
    month: initialMonthKey,
    startDate: '',
    endDate: ''
  }));
  const [appliedFilter, setAppliedFilter] = useState(() => ({
    mode: 'month',
    month: initialMonthKey,
    startDate: '',
    endDate: ''
  }));
  const [inactiveCustomers, setInactiveCustomers] = useState([]);
  const [inactiveCount, setInactiveCount] = useState(0);
  const [inactiveLoading, setInactiveLoading] = useState(false);
  const [maintenanceNotification, setMaintenanceNotification] = useState(null);
  const [isMobileView, setIsMobileView] = useState(() => window.innerWidth < 768);
  const fallbackCompanyName = 'SYED TAYYAB INDUSTRIAL GASES LLC';
  const normalizedCompanyName = (stats?.companyName || '').trim().toLowerCase();
  const resolvedCompanyName = normalizedCompanyName && normalizedCompanyName !== 'cylinder management company' && normalizedCompanyName !== 'company'
    ? stats.companyName.trim()
    : fallbackCompanyName;
  const displayName = user?.role === 'super_admin'
    ? resolvedCompanyName
    : (user?.fullName || user?.username || user?.email || 'User');

  const formatAED = (value) => {
    const numberValue = Number(value || 0);
    return `AED ${numberValue.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })}`;
  };

  const formatCount = (value) => Number(value || 0).toLocaleString('en-US');

  const fetchDashboardData = useCallback(async (filterState = appliedFilter, showLoading = false) => {
    try {
      if (showLoading) setLoading(true);
      const params = {};
      if (filterState?.mode === 'month' && filterState?.month) {
        params.month = filterState.month;
      }
      if (filterState?.mode === 'range' && filterState?.startDate && filterState?.endDate) {
        params.startDate = filterState.startDate;
        params.endDate = filterState.endDate;
      }

      const response = await api.get('/dashboard/overview', { params });
      const data = response.data.data;
      setStats(data);
      if (data?.currentMonthKey) {
        setCurrentMonthKey(data.currentMonthKey);
      }
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [appliedFilter]);

  const fetchUserSignature = useCallback(async () => {
    try {
      const response = await api.get('/users/me');
      setUserSignature(response.data.data.signature);
    } catch (error) {
      console.error('Error fetching user signature:', error);
    }
  }, []);

  const handleSaveSignature = useCallback(async (signatureData) => {
    try {
      const result = await updateSignature(signatureData);
      if (result?.success) {
        setUserSignature(signatureData);
        setShowSignaturePad(false);
      }
    } catch (error) {
      console.error('Signature save error:', error);
      console.error('Error response:', error.response?.data);
      const errorMessage = error.response?.data?.message || error.message || 'Failed to save signature. Please try again.';
      toast.error(errorMessage);
    }
  }, [updateSignature]);

  const monthOptions = useMemo(() => {
    const options = [];
    const baseKey = currentMonthKey || getUaeMonthKey();
    const [yearStr, monthStr] = baseKey.split('-');
    const year = parseInt(yearStr, 10);
    const monthIndex = parseInt(monthStr, 10) - 1;
    if (!Number.isNaN(year) && monthIndex >= 0) {
      for (let i = 0; i < 12; i += 1) {
        const date = new Date(year, monthIndex - i, 1);
        const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        const label = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
        options.push({ value, label });
      }
    }
    return options;
  }, [currentMonthKey]);

  const chartData = useMemo(() => {
    const invoices = stats?.recentInvoices || [];
    if (!invoices.length) return [];
    return [...invoices].reverse().map((invoice) => ({
      label: new Date(invoice.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
      total: Number(invoice.total) || 0
    }));
  }, [stats?.recentInvoices]);

  const periodLabel = useMemo(() => {
    if (appliedFilter.mode === 'month' && appliedFilter.month) {
      const [year, month] = appliedFilter.month.split('-');
      const date = new Date(Number(year), Number(month) - 1, 1);
      return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    }
    if (appliedFilter.mode === 'range' && appliedFilter.startDate && appliedFilter.endDate) {
      return 'Custom Range';
    }
    return 'This Month';
  }, [appliedFilter]);

  const applyFilter = () => {
    if (draftFilter.mode === 'range') {
      if (!draftFilter.startDate || !draftFilter.endDate) {
        toast.error('Please select a valid start and end date');
        return;
      }
      if (new Date(draftFilter.startDate) > new Date(draftFilter.endDate)) {
        toast.error('Start date must be before end date');
        return;
      }
    }

    const nextFilter = { ...draftFilter };
    setAppliedFilter(nextFilter);
    const activeMonthKey = currentMonthKey || getUaeMonthKey();
    const shouldAuto = nextFilter.mode === 'month' && nextFilter.month === activeMonthKey;
    setAutoMonth(shouldAuto);
    setFilterOpen(false);
  };

  const resetFilter = () => {
    const defaultMonth = currentMonthKey || getUaeMonthKey();
    const nextFilter = {
      mode: 'month',
      month: defaultMonth,
      startDate: '',
      endDate: ''
    };
    setDraftFilter(nextFilter);
    setAppliedFilter(nextFilter);
    setAutoMonth(true);
    setFilterOpen(false);
  };

  const fetchInactiveCustomers = useCallback(async (showPanelLoading = false) => {
    try {
      if (showPanelLoading) setInactiveLoading(true);
      const response = await api.get('/dashboard/inactive-customers');
      const customers = response.data?.data?.customers || [];
      const count = response.data?.data?.count ?? customers.length;
      setInactiveCustomers(customers);
      setInactiveCount(count);
    } catch (error) {
      console.error('Error fetching inactive customers:', error);
    } finally {
      if (showPanelLoading) setInactiveLoading(false);
    }
  }, []);

  const fetchMaintenanceNotification = useCallback(async () => {
    try {
      const response = await api.get('/maintenance/notification');
      const data = response.data?.data;
      if (data?.visible) {
        setMaintenanceNotification(data);
      } else {
        setMaintenanceNotification(null);
      }
    } catch (error) {
      console.error('Error fetching maintenance notification:', error);
    }
  }, []);

  const handleDismissMaintenanceNotification = useCallback(async () => {
    try {
      await api.post('/maintenance/notification/dismiss');
      setMaintenanceNotification(null);
    } catch (error) {
      console.error('Error dismissing maintenance notification:', error);
      toast.error('Failed to dismiss maintenance notification');
    }
  }, []);

  const handleInactiveToggle = useCallback(() => {
    setInactiveOpen((prev) => {
      const next = !prev;
      if (next) {
        fetchInactiveCustomers(true);
      }
      return next;
    });
  }, [fetchInactiveCustomers]);

  const handleMarkInactiveRead = useCallback(async () => {
    try {
      await api.post('/dashboard/inactive-customers/mark-read');
      setInactiveCustomers([]);
      setInactiveCount(0);
      setInactiveOpen(false);
      toast.success('Inactive customers marked as read');
    } catch (error) {
      console.error('Error marking inactive customers as read:', error);
      toast.error('Failed to mark inactive customers as read');
    }
  }, []);

  useEffect(() => {
    fetchUserSignature();
    if (isMobileView) return;
    const prefetchId = setTimeout(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return;
      }
      fetchInactiveCustomers();
      fetchMaintenanceNotification();
    }, 2000);
    return () => clearTimeout(prefetchId);
  }, [fetchInactiveCustomers, fetchMaintenanceNotification, fetchUserSignature, isMobileView]);

  useEffect(() => {
    const onResize = () => setIsMobileView(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    fetchDashboardData(appliedFilter, true);
    fetchMaintenanceNotification();

    const pollingIntervalMs = isMobileView ? 30000 : 15000;
    let intervalId = null;

    const stopPolling = () => {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };

    const pollDashboard = () => {
      fetchDashboardData(appliedFilter, false);
      fetchMaintenanceNotification();
      if (inactiveOpen) {
        fetchInactiveCustomers();
      }
    };

    const startPolling = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return;
      }
      stopPolling();
      intervalId = setInterval(pollDashboard, pollingIntervalMs);
    };

    const handleVisibilityChange = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        stopPolling();
        return;
      }
      pollDashboard();
      startPolling();
    };

    startPolling();
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    return () => {
      stopPolling();
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
    };
  }, [appliedFilter, fetchDashboardData, fetchInactiveCustomers, fetchMaintenanceNotification, inactiveOpen, isMobileView]);

  useEffect(() => {
    const onSalesChanged = () => {
      fetchDashboardData(appliedFilter, false);
    };
    window.addEventListener('sales:changed', onSalesChanged);
    return () => window.removeEventListener('sales:changed', onSalesChanged);
  }, [appliedFilter, fetchDashboardData]);

  useEffect(() => {
    if (!autoMonth || !currentMonthKey) return;
    setDraftFilter((prev) => {
      if (prev.mode === 'month' && prev.month === currentMonthKey) return prev;
      return {
        mode: 'month',
        month: currentMonthKey,
        startDate: '',
        endDate: ''
      };
    });
    setAppliedFilter((prev) => {
      if (prev?.mode === 'month' && prev.month === currentMonthKey) return prev;
      return {
        mode: 'month',
        month: currentMonthKey,
        startDate: '',
        endDate: ''
      };
    });
  }, [autoMonth, currentMonthKey]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="relative">
          <div className="h-16 w-16 animate-spin rounded-full border-b-4 border-t-4 border-violet-600" />
          <div className="absolute inset-0 animate-ping rounded-full bg-violet-600/20" />
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-page mx-auto w-full max-w-[1400px] space-y-4 sm:space-y-5">
      {maintenanceNotification?.visible && (
        <div className="rounded-2xl border border-emerald-200 bg-white px-4 py-3 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
              <SparklesIcon className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-emerald-900">System Maintenance Completed</p>
              <p className="mt-1 text-sm text-emerald-800">{maintenanceNotification.message}</p>
            </div>
            <button
              type="button"
              onClick={handleDismissMaintenanceNotification}
              className="shrink-0 rounded-lg p-1.5 text-emerald-700 transition hover:bg-emerald-100"
              aria-label="Dismiss maintenance notification"
            >
              <XMarkIcon className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">Dashboard Overview</h1>
          <p className="mt-0.5 text-xs text-slate-500 sm:text-sm">
            Welcome back, {displayName}. Here&apos;s what&apos;s happening today.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <button
            type="button"
            onClick={() => setFilterOpen((prev) => !prev)}
            aria-expanded={filterOpen}
            aria-controls="dashboard-filter-panel"
            className="dash-btn-secondary relative px-3 py-2 text-xs"
          >
            <FunnelIcon className="h-3.5 w-3.5" />
            Filter by Date
          </button>
          <button
            type="button"
            onClick={handleInactiveToggle}
            aria-expanded={inactiveOpen}
            aria-controls="dashboard-inactive-panel"
            className="dash-btn-secondary relative px-3 py-2 text-xs"
          >
            <EyeIcon className="h-3.5 w-3.5" />
            Inactive Customers
            {inactiveCount > 0 && (
              <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white shadow">
                {inactiveCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {filterOpen && (
        <div id="dashboard-filter-panel" className="dash-card p-4 sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row">
            <div className="flex-1 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-slate-600">Filter Mode</p>
                <span className="text-[11px] text-slate-500">Select month or custom range</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setDraftFilter((prev) => ({ ...prev, mode: 'month' }))}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                    draftFilter.mode === 'month' ? 'bg-violet-100 text-violet-700' : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  Month
                </button>
                <button
                  type="button"
                  onClick={() => setDraftFilter((prev) => ({ ...prev, mode: 'range' }))}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                    draftFilter.mode === 'range' ? 'bg-violet-100 text-violet-700' : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  Custom Range
                </button>
              </div>

              {draftFilter.mode === 'month' && (
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">Month</label>
                  <select
                    value={draftFilter.month}
                    onChange={(e) => setDraftFilter((prev) => ({ ...prev, month: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-500/30"
                  >
                    {monthOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {draftFilter.mode === 'range' && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-600">Start Date</label>
                    <input
                      type="date"
                      value={draftFilter.startDate}
                      onChange={(e) => setDraftFilter((prev) => ({ ...prev, startDate: e.target.value }))}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-600">End Date</label>
                    <input
                      type="date"
                      value={draftFilter.endDate}
                      onChange={(e) => setDraftFilter((prev) => ({ ...prev, endDate: e.target.value }))}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-2 sm:flex-row lg:flex-col lg:justify-end">
              <button type="button" onClick={applyFilter} className="dash-btn-primary">
                Apply Filter
              </button>
              <button type="button" onClick={resetFilter} className="dash-btn-secondary">
                Reset
              </button>
            </div>
          </div>
        </div>
      )}

      {inactiveOpen && (
        <div id="dashboard-inactive-panel" className="dash-card p-4 sm:p-5">
          <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div className="flex items-center gap-2">
              <BellAlertIcon className="h-5 w-5 text-amber-500" />
              <h3 className="text-sm font-semibold text-slate-800 sm:text-base">Inactive Customers</h3>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-bold text-slate-700">
                {inactiveCount}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={handleMarkInactiveRead} className="dash-btn-primary">
                Mark All as Read
              </button>
              <button
                type="button"
                onClick={() => setInactiveOpen(false)}
                className="dash-btn-secondary px-2.5"
                aria-label="Close inactive customers list"
              >
                <XMarkIcon className="h-4 w-4" />
              </button>
            </div>
          </div>

          {inactiveLoading && (
            <div className="flex items-center justify-center py-6">
              <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-violet-600" />
            </div>
          )}

          {!inactiveLoading && inactiveCustomers.length === 0 && (
            <div className="py-6 text-center text-sm text-slate-600">
              No inactive customers right now.
            </div>
          )}

          {!inactiveLoading && inactiveCustomers.length > 0 && (
            <div className="hide-scrollbar max-h-72 space-y-2 overflow-y-auto pr-1">
              {inactiveCustomers.map((customer) => {
                const lastPurchase = customer.lastPurchaseDate
                  ? new Date(customer.lastPurchaseDate).toLocaleDateString('en-GB')
                  : 'N/A';
                const inactiveSince = customer.inactiveSince
                  ? new Date(customer.inactiveSince).toLocaleDateString('en-GB')
                  : 'N/A';
                return (
                  <div
                    key={customer.id}
                    className="flex flex-col gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[11px] sm:flex-row sm:items-center sm:justify-between sm:px-4 sm:py-3 sm:text-sm"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[12px] font-semibold text-slate-800 sm:text-sm">
                        {customer.name || customer.customerCode}
                      </p>
                      <p className="mt-0.5 text-[11px] text-slate-600 sm:text-sm">
                        {customer.customerCode ? `Code: ${customer.customerCode}` : 'No code'} - {customer.phone || 'No phone'}
                      </p>
                    </div>
                    <div className="mt-0.5 text-[11px] text-slate-600 sm:mt-0 sm:text-sm">
                      <div>Last Purchase: <span className="font-semibold text-slate-700">{lastPurchase}</span></div>
                      <div>Inactive Since: <span className="font-semibold text-slate-700">{inactiveSince}</span></div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {!isEmployee && (
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-5 xl:gap-3">
          <OverviewMetricCard
            title="Total Sales"
            value={formatAED(stats?.salesStats?.totalSales)}
            icon={ShoppingCartIcon}
            iconBg="bg-violet-100"
            iconColor="text-violet-600"
          />
          <OverviewMetricCard
            title="Total Gas Sales"
            value={formatAED(stats?.salesStats?.totalGasSales)}
            icon={BeakerIcon}
            iconBg="bg-sky-100"
            iconColor="text-sky-600"
          />
          <OverviewMetricCard
            title="Total Cylinder Sales"
            value={formatAED(stats?.salesStats?.totalCylinderSales)}
            icon={CircleStackIcon}
            iconBg="bg-orange-100"
            iconColor="text-orange-600"
          />
          <OverviewMetricCard
            title="Total Outstandings"
            value={formatAED(stats?.salesStats?.pendingPayments)}
            icon={BanknotesIcon}
            iconBg="bg-rose-100"
            iconColor="text-rose-600"
          />
          <OverviewMetricCard
            title="Total Tools Sales"
            value={formatAED(stats?.salesStats?.totalToolSales)}
            icon={WrenchScrewdriverIcon}
            iconBg="bg-emerald-100"
            iconColor="text-emerald-600"
          />
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-12 xl:gap-4">
        <div className="space-y-3 xl:col-span-8">
          {!isEmployee && (
            <SalesTrendPanel chartData={chartData} periodLabel={periodLabel} />
          )}

          <div>
            <h3 className="mb-2 text-sm font-bold text-slate-900 sm:text-base">Quantity-wise Statistics</h3>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3 sm:gap-3">
              <QuantityMetricCard
                title="Gas Units Sold"
                value={formatCount(stats?.salesStats?.gasUnitsSold)}
                icon={BeakerIcon}
                iconBg="bg-sky-100"
                iconColor="text-sky-600"
                sparkColor="#0ea5e9"
              />
              <QuantityMetricCard
                title="Cylinders Sold"
                value={formatCount(stats?.salesStats?.cylinderUnitsSold)}
                icon={CircleStackIcon}
                iconBg="bg-violet-100"
                iconColor="text-violet-600"
                sparkColor="#7c3aed"
              />
              <QuantityMetricCard
                title="Tools Sold"
                value={formatCount(stats?.salesStats?.toolUnitsSold)}
                icon={WrenchScrewdriverIcon}
                iconBg="bg-emerald-100"
                iconColor="text-emerald-600"
                sparkColor="#10b981"
              />
            </div>
          </div>
        </div>

        <div className="space-y-3 xl:col-span-4">
          <SignatureSidebarCard
            userSignature={userSignature}
            onUpdate={() => setShowSignaturePad(true)}
          />
          {!isEmployee && (
            <BusinessSnapshotPanel
              stats={stats}
              inactiveCount={inactiveCount}
              onInactiveClick={handleInactiveToggle}
            />
          )}
        </div>
      </div>

      {showSignaturePad && (
        <SignaturePad
          onSave={handleSaveSignature}
          onClose={() => setShowSignaturePad(false)}
          title="Company / User Signature"
          existingSignature={userSignature}
        />
      )}
    </div>
  );
};

export default Dashboard;
