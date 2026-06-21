import React, { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../utils/api';
import toast from 'react-hot-toast';
import {
  PlusIcon,
  XMarkIcon,
  MagnifyingGlassIcon,
  TruckIcon,
  WrenchScrewdriverIcon,
  ReceiptPercentIcon,
  CalendarDaysIcon,
  DocumentTextIcon,
  BanknotesIcon,
  PrinterIcon,
  PencilSquareIcon,
  TrashIcon
} from '@heroicons/react/24/outline';
import { buildPrintHtml } from '../utils/printUtils';
import ConfirmDialog from '../components/ConfirmDialog';
import TyerIcon from '../components/icons/TyerIcon';

const EXPENSE_TYPES = [
  { value: 'Diesel', label: 'Diesel', icon: TruckIcon, badge: 'bg-amber-100 text-amber-800 ring-amber-200', accent: '#f59e0b', cardBg: 'from-amber-50 via-white to-orange-50/80' },
  { value: 'Maintenance', label: 'Maintenance', icon: WrenchScrewdriverIcon, badge: 'bg-violet-100 text-violet-800 ring-violet-200', accent: '#8b5cf6', cardBg: 'from-violet-50 via-white to-indigo-50/80' },
  { value: 'Tyer', label: 'Tyer', icon: TyerIcon, badge: 'bg-sky-100 text-sky-800 ring-sky-200', accent: '#0ea5e9', cardBg: 'from-sky-50 via-white to-cyan-50/80' }
];

const formatAed = (value) => `AED ${Number(value || 0).toFixed(2)}`;

const getAddedByLabel = (expense) => {
  const role = expense?.employee?.role;
  if (role === 'super_admin') return 'STIG L.L.C';
  return expense?.employee?.fullName || '—';
};

const ExpenseSparkline = ({ stroke, fillId }) => (
  <svg viewBox="0 0 80 32" className="h-8 w-[72px]" aria-hidden="true">
    <defs>
      <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={stroke} stopOpacity="0.22" />
        <stop offset="100%" stopColor={stroke} stopOpacity="0" />
      </linearGradient>
    </defs>
    <path d="M0 22 L12 18 L24 24 L36 12 L48 16 L60 10 L72 14 L80 8 L80 32 L0 32 Z" fill={`url(#${fillId})`} />
    <path d="M0 22 L12 18 L24 24 L36 12 L48 16 L60 10 L72 14 L80 8" fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const ExpenseSummaryCard = ({ title, value, subtitle, icon: Icon, iconBg, iconColor, sparkColor, sparkId }) => (
  <div className="dash-card p-4 sm:p-5">
    <div className="flex items-center gap-3">
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${iconBg}`}>
        <Icon className={`h-5 w-5 ${iconColor}`} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-slate-500">{title}</p>
        <p className="mt-0.5 text-xl font-bold leading-none text-slate-900 sm:text-2xl">{value}</p>
        <p className="mt-1 text-[11px] text-slate-400">{subtitle}</p>
      </div>
      <div className="hidden shrink-0 self-end pb-0.5 sm:block">
        <ExpenseSparkline stroke={sparkColor} fillId={sparkId} />
      </div>
    </div>
  </div>
);

const getTodayInputDate = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const Expenses = () => {
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [isEditMode, setIsEditMode] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [formData, setFormData] = useState({
    expenseType: '',
    invoiceNumber: '',
    expenseDate: getTodayInputDate(),
    amount: ''
  });

  const fetchExpenses = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get('/expenses');
      setExpenses(res.data.data || []);
    } catch (error) {
      toast.error('Failed to load expenses');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchExpenses();
  }, [fetchExpenses]);

  const amountValue = useMemo(() => {
    const parsed = parseFloat(formData.amount);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }, [formData.amount]);

  const vatAmount = useMemo(() => Math.round(amountValue * 0.05 * 100) / 100, [amountValue]);
  const totalAmount = useMemo(() => Math.round((amountValue + vatAmount) * 100) / 100, [amountValue, vatAmount]);

  const summary = useMemo(() => {
    const totals = { Diesel: 0, Maintenance: 0, Tyer: 0, grand: 0 };
    expenses.forEach((expense) => {
      const total = parseFloat(expense.totalAmount || 0);
      totals.grand += total;
      if (totals[expense.expenseType] !== undefined) {
        totals[expense.expenseType] += total;
      }
    });
    return totals;
  }, [expenses]);

  const filteredExpenses = useMemo(() => {
    return expenses.filter((expense) => {
      const matchesType = filterType === 'all' || expense.expenseType === filterType;
      const query = searchTerm.trim().toLowerCase();
      const matchesSearch = !query
        || expense.invoiceNumber?.toLowerCase().includes(query)
        || expense.expenseType?.toLowerCase().includes(query)
        || getAddedByLabel(expense).toLowerCase().includes(query);
      return matchesType && matchesSearch;
    });
  }, [expenses, filterType, searchTerm]);

  const resetForm = () => {
    setFormData({
      expenseType: '',
      invoiceNumber: '',
      expenseDate: getTodayInputDate(),
      amount: ''
    });
  };

  const openModal = () => {
    resetForm();
    setIsEditMode(false);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setIsEditMode(false);
    resetForm();
  };

  const openEditModal = (expense) => {
    setFormData({
      expenseType: expense.expenseType || '',
      invoiceNumber: expense.invoiceNumber || '',
      expenseDate: expense.expenseDate ? String(expense.expenseDate).slice(0, 10) : getTodayInputDate(),
      amount: String(expense.amount ?? '')
    });
    setIsEditMode(true);
    setShowModal(true);
  };

  const handlePrintExpense = (expense) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast.error('Please allow pop-ups to print');
      return;
    }

    const body = `
      <div style="font-family: Arial, sans-serif; color: #0f172a;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h1 style="margin: 0; font-size: 22px;">STIG L.L.C</h1>
          <p style="margin: 8px 0 0; color: #64748b; font-size: 13px;">Expense Receipt</p>
        </div>
        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
          <tr><td style="padding: 10px 0; border-bottom: 1px solid #e2e8f0; color: #64748b;">Expense Type</td><td style="padding: 10px 0; border-bottom: 1px solid #e2e8f0; text-align: right; font-weight: 600;">${expense.expenseType}</td></tr>
          <tr><td style="padding: 10px 0; border-bottom: 1px solid #e2e8f0; color: #64748b;">Invoice Number</td><td style="padding: 10px 0; border-bottom: 1px solid #e2e8f0; text-align: right; font-weight: 600;">${expense.invoiceNumber}</td></tr>
          <tr><td style="padding: 10px 0; border-bottom: 1px solid #e2e8f0; color: #64748b;">Date</td><td style="padding: 10px 0; border-bottom: 1px solid #e2e8f0; text-align: right; font-weight: 600;">${new Date(expense.expenseDate).toLocaleDateString('en-GB')}</td></tr>
          <tr><td style="padding: 10px 0; border-bottom: 1px solid #e2e8f0; color: #64748b;">Amount</td><td style="padding: 10px 0; border-bottom: 1px solid #e2e8f0; text-align: right; font-weight: 600;">${formatAed(expense.amount)}</td></tr>
          <tr><td style="padding: 10px 0; border-bottom: 1px solid #e2e8f0; color: #64748b;">5% VAT</td><td style="padding: 10px 0; border-bottom: 1px solid #e2e8f0; text-align: right; font-weight: 600;">${formatAed(expense.vatAmount)}</td></tr>
          <tr><td style="padding: 12px 0; font-size: 15px; font-weight: 700;">Total</td><td style="padding: 12px 0; text-align: right; font-size: 15px; font-weight: 700;">${formatAed(expense.totalAmount)}</td></tr>
        </table>
        <p style="margin-top: 24px; font-size: 12px; color: #64748b;">Added By: ${getAddedByLabel(expense)}</p>
      </div>
    `;

    const html = buildPrintHtml({ title: `Expense ${expense.invoiceNumber}`, body });
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => printWindow.print(), 250);
  };

  const confirmDeleteExpense = () => {
    if (!deleteTarget) return;
    setExpenses((prev) => prev.filter((item) => item.id !== deleteTarget.id));
    setDeleteTarget(null);
    toast.success('Expense removed from list');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.expenseType) {
      toast.error('Please select expense type');
      return;
    }
    if (!formData.invoiceNumber.trim()) {
      toast.error('Invoice number is required');
      return;
    }
    if (!formData.expenseDate) {
      toast.error('Please select expense date');
      return;
    }
    if (amountValue <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }

    try {
      setSubmitting(true);
      await api.post('/expenses', {
        expenseType: formData.expenseType,
        invoiceNumber: formData.invoiceNumber.trim(),
        expenseDate: formData.expenseDate,
        amount: amountValue
      });
      toast.success('Expense added successfully');
      closeModal();
      fetchExpenses();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to add expense');
    } finally {
      setSubmitting(false);
    }
  };

  const typeMeta = (type) => EXPENSE_TYPES.find((item) => item.value === type) || EXPENSE_TYPES[0];

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-indigo-600" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-5 sm:space-y-6">
      <div className="relative overflow-hidden rounded-2xl border border-indigo-100/80 bg-gradient-to-br from-slate-900 via-indigo-950 to-violet-900 p-5 shadow-[0_20px_50px_rgba(30,27,75,0.25)] sm:p-6">
        <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-violet-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-12 left-10 h-32 w-32 rounded-full bg-indigo-400/15 blur-3xl" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-medium uppercase tracking-wider text-indigo-100">
              <ReceiptPercentIcon className="h-3.5 w-3.5" />
              Company Expenses
            </div>
            <h1 className="text-2xl font-bold text-white sm:text-3xl">Expenses</h1>
            <p className="mt-1 max-w-xl text-sm text-indigo-100/80">
              Track diesel, maintenance, and tyer expenses with automatic 5% VAT calculation.
            </p>
          </div>
          <button
            type="button"
            onClick={openModal}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-indigo-900 shadow-lg transition hover:bg-indigo-50 sm:px-5"
          >
            <PlusIcon className="h-5 w-5" />
            Add Expense
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <ExpenseSummaryCard
          title="Total Expenses"
          value={formatAed(summary.grand)}
          subtitle="All recorded expenses"
          icon={BanknotesIcon}
          iconBg="bg-indigo-100"
          iconColor="text-indigo-600"
          sparkColor="#6366f1"
          sparkId="expense-total"
        />
        <ExpenseSummaryCard
          title="Diesel"
          value={formatAed(summary.Diesel)}
          subtitle="Fuel & diesel costs"
          icon={TruckIcon}
          iconBg="bg-amber-100"
          iconColor="text-amber-600"
          sparkColor="#f59e0b"
          sparkId="expense-diesel"
        />
        <ExpenseSummaryCard
          title="Maintenance"
          value={formatAed(summary.Maintenance)}
          subtitle="Repairs & upkeep"
          icon={WrenchScrewdriverIcon}
          iconBg="bg-violet-100"
          iconColor="text-violet-600"
          sparkColor="#8b5cf6"
          sparkId="expense-maintenance"
        />
        <ExpenseSummaryCard
          title="Tyer"
          value={formatAed(summary.Tyer)}
          subtitle="Tyer related costs"
          icon={TyerIcon}
          iconBg="bg-sky-100"
          iconColor="text-sky-600"
          sparkColor="#0ea5e9"
          sparkId="expense-tyer"
        />
      </div>

      <div className="dash-card overflow-hidden">
        <div className="border-b border-slate-100 p-4 sm:p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Expense Records</h2>
              <p className="text-xs text-slate-500">{filteredExpenses.length} record(s) found</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative">
                <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search invoice or employee..."
                  className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-700 outline-none ring-indigo-500/0 transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/20 sm:w-64"
                />
              </div>
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/20"
              >
                <option value="all">All Types</option>
                {EXPENSE_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>{type.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100">
            <thead className="bg-slate-50/80">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 sm:px-5">Type</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 sm:px-5">Invoice #</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 sm:px-5">Date</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500 sm:px-5">Amount</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500 sm:px-5">5% VAT</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500 sm:px-5">Total</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 sm:px-5">Added By</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500 sm:px-5">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {filteredExpenses.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-12 text-center text-sm text-slate-500">
                    No expenses recorded yet. Click &quot;Add Expense&quot; to create your first entry.
                  </td>
                </tr>
              ) : (
                filteredExpenses.map((expense) => {
                  const meta = typeMeta(expense.expenseType);
                  return (
                    <tr key={expense.id} className="transition hover:bg-slate-50/70">
                      <td className="whitespace-nowrap px-4 py-3 sm:px-5">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${meta.badge}`}>
                          <meta.icon className="h-3.5 w-3.5" />
                          {expense.expenseType}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-slate-800 sm:px-5">{expense.invoiceNumber}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-600 sm:px-5">
                        {new Date(expense.expenseDate).toLocaleDateString('en-GB')}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-slate-700 sm:px-5">{formatAed(expense.amount)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-slate-600 sm:px-5">{formatAed(expense.vatAmount)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right text-sm font-semibold text-slate-900 sm:px-5">{formatAed(expense.totalAmount)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-600 sm:px-5">{getAddedByLabel(expense)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right sm:px-5">
                        <div className="inline-flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => handlePrintExpense(expense)}
                            className="inline-flex items-center gap-1 rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1.5 text-[11px] font-semibold text-sky-700 transition hover:bg-sky-100"
                            title="Print"
                          >
                            <PrinterIcon className="h-3.5 w-3.5" />
                            Print
                          </button>
                          <button
                            type="button"
                            onClick={() => openEditModal(expense)}
                            className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] font-semibold text-amber-700 transition hover:bg-amber-100"
                            title="Edit"
                          >
                            <PencilSquareIcon className="h-3.5 w-3.5" />
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(expense)}
                            className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[11px] font-semibold text-rose-700 transition hover:bg-rose-100"
                            title="Delete"
                          >
                            <TrashIcon className="h-3.5 w-3.5" />
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-6">
          <button type="button" className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={closeModal} aria-label="Close modal" />
          <div className="relative z-10 w-full max-w-lg overflow-hidden rounded-2xl border border-white/20 bg-white shadow-2xl">
            <div className="relative overflow-hidden bg-gradient-to-r from-indigo-700 via-violet-700 to-purple-700 px-5 py-4 sm:px-6">
              <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-white/10 blur-2xl" />
              <div className="relative flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-indigo-100">{isEditMode ? 'Update Entry' : 'New Entry'}</p>
                  <h3 className="text-xl font-bold text-white">{isEditMode ? 'Edit Expense' : 'Add Expense'}</h3>
                </div>
                <button type="button" onClick={closeModal} className="rounded-lg p-1.5 text-white/80 transition hover:bg-white/15 hover:text-white">
                  <XMarkIcon className="h-5 w-5" />
                </button>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 p-5 sm:p-6">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Expense Type</label>
                <select
                  value={formData.expenseType}
                  onChange={(e) => setFormData((prev) => ({ ...prev, expenseType: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
                  required
                >
                  <option value="">Select expense type</option>
                  {EXPENSE_TYPES.map((type) => (
                    <option key={type.value} value={type.value}>{type.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Invoice Number <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <DocumentTextIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={formData.invoiceNumber}
                    onChange={(e) => setFormData((prev) => ({ ...prev, invoiceNumber: e.target.value }))}
                    placeholder="Enter invoice number"
                    className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Date</label>
                <div className="relative">
                  <CalendarDaysIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="date"
                    value={formData.expenseDate}
                    onChange={(e) => setFormData((prev) => ({ ...prev, expenseDate: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Amount (AED)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.amount}
                  onChange={(e) => setFormData((prev) => ({ ...prev, amount: e.target.value }))}
                  placeholder="0.00"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
                  required
                />
              </div>

              <div className="rounded-xl border border-indigo-100 bg-gradient-to-br from-indigo-50/80 via-white to-violet-50/60 p-4">
                <div className="flex items-center justify-between text-sm text-slate-600">
                  <span>Amount</span>
                  <span className="font-medium text-slate-800">{formatAed(amountValue)}</span>
                </div>
                <div className="mt-2 flex items-center justify-between text-sm text-slate-600">
                  <span>5% VAT</span>
                  <span className="font-medium text-indigo-700">{formatAed(vatAmount)}</span>
                </div>
                <div className="mt-3 border-t border-indigo-100 pt-3 flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-800">Total Amount + 5% VAT</span>
                  <span className="text-lg font-bold text-indigo-900">{formatAed(totalAmount)}</span>
                </div>
              </div>

              {isEditMode ? (
                <button
                  type="button"
                  onClick={closeModal}
                  className="w-full rounded-xl border border-slate-200 bg-white py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
                >
                  Close
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 py-3 text-sm font-semibold text-white shadow-lg transition hover:from-indigo-700 hover:to-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitting ? 'Adding...' : 'Add Expense'}
                </button>
              )}
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDeleteExpense}
        title="Delete Expense"
        message={`Are you sure you want to delete expense invoice #${deleteTarget?.invoiceNumber || ''}?`}
        confirmText="Delete"
        cancelText="Cancel"
        type="danger"
      />
    </div>
  );
};

export default Expenses;
