import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import CashPaperReport from '../components/CashPaperReport';
import PdfShareDialog from '../components/PdfShareDialog';
import api from '../utils/api';
import {
  captureElementToPdfBlob,
  runPdfDownload,
  saveBlobAsFile
} from '../utils/pdfDownload';
import {
  ChartBarIcon,
  UserGroupIcon,
  CurrencyDollarIcon,
  ShoppingCartIcon,
  CalendarIcon,
  FunnelIcon,
  ChevronDownIcon,
  ChevronRightIcon
} from '@heroicons/react/24/outline';
// Charts removed - keeping imports for potential future use if needed


const escapeHtml = (value) => {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

const sanitizeFilenamePart = (value, fallback = 'Report') => {
  const normalized = String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) return fallback;
  const withoutReserved = normalized
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/\.+$/g, '')
    .trim();
  const cleaned = Array.from(withoutReserved)
    .filter((char) => char.charCodeAt(0) >= 32)
    .join('')
    .trim();
  return cleaned || fallback;
};

export default function Reports() {
  const { user, isEmployee } = useAuth();
  const [loading, setLoading] = useState(true);
  const [period] = useState('month');
  const [dateRange] = useState({ startDate: '', endDate: '' });
  const [overviewData, setOverviewData] = useState(null);
  const [selectedEmployee, setSelectedEmployee] = useState('');
  const [employeeMonth, setEmployeeMonth] = useState('');
  const [employeeDateRange, setEmployeeDateRange] = useState({ startDate: '', endDate: '' });
  const [employeeList, setEmployeeList] = useState([]);
  const [employeeReport, setEmployeeReport] = useState(null);
  const [loadingEmployee, setLoadingEmployee] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [ledgerStatus, setLedgerStatus] = useState('All');
  const [ledgerCustomerQuery, setLedgerCustomerQuery] = useState('');
  const [ledgerCustomers, setLedgerCustomers] = useState([]);
  const [, setLedgerSelectedCustomer] = useState(null);
  const [ledgerLoaded, setLedgerLoaded] = useState(false);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [ledgerStartDate, setLedgerStartDate] = useState('');
  const [ledgerEndDate, setLedgerEndDate] = useState('');
  const [ledgerInvoices, setLedgerInvoices] = useState([]);
  const [ledgerExpandedCustomers, setLedgerExpandedCustomers] = useState(new Set());
  const [ledgerAppliedFilters, setLedgerAppliedFilters] = useState({
    status: 'All',
    customer: null,
    startDate: '',
    endDate: ''
  });
  const [ledgerFiltersApplied, setLedgerFiltersApplied] = useState(false);
  const [sharePrompt, setSharePrompt] = useState(null);
  const ledgerLoadTokenRef = useRef(0);

  useEffect(() => {
    if (isEmployee) {
      setLoading(false);
      return;
    }
    fetchOverviewData();
    fetchEmployeesList();
  }, [period, dateRange, isEmployee]);

  useEffect(() => {
    if (activeTab !== 'customer-ledger') {
      ledgerLoadTokenRef.current += 1;
      setLedgerLoaded(false);
      setLedgerLoading(false);
      setLedgerCustomers([]);
      setLedgerInvoices([]);
      setLedgerExpandedCustomers(new Set());
      setLedgerCustomerQuery('');
      setLedgerSelectedCustomer(null);
      setLedgerStatus('All');
      setLedgerStartDate('');
      setLedgerEndDate('');
      setLedgerAppliedFilters({
        status: 'All',
        customer: null,
        startDate: '',
        endDate: ''
      });
      setLedgerFiltersApplied(false);
    }
  }, [activeTab]);

  useEffect(() => {
    if (isEmployee && user?.id) {
      setSelectedEmployee(user.id);
    }
  }, [isEmployee, user?.id]);

  useEffect(() => {
    if (!selectedEmployee) {
      setEmployeeReport(null);
      return;
    }

    const { startDate, endDate } = employeeDateRange;
    if ((startDate && !endDate) || (!startDate && endDate)) {
      return;
    }

    fetchEmployeeReport(selectedEmployee);
  }, [selectedEmployee, employeeDateRange.startDate, employeeDateRange.endDate]);

  const fetchOverviewData = async ({ silent = false, skipLoading = false } = {}) => {
    try {
      if (!skipLoading) {
        setLoading(true);
      }
      const params = { period };
      if (dateRange.startDate && dateRange.endDate) {
        params.startDate = dateRange.startDate;
        params.endDate = dateRange.endDate;
      }

      const response = await api.get('/analytics/overview', { params });
      const data = response.data;
      if (data?.success) {
        setOverviewData(data.data);
        return data.data;
      } else if (!silent) {
        toast.error(data.message || 'Failed to fetch analytics');
      }
    } catch (error) {
      console.error('Fetch analytics error:', error);
      if (!silent) {
        toast.error('Failed to load analytics data');
      }
    } finally {
      if (!skipLoading) {
        setLoading(false);
      }
    }
    return null;
  };

  const fetchEmployeesList = async () => {
    try {
      const response = await api.get('/analytics/employees');
      const data = response.data;
      if (data?.success) {
        const list = Array.isArray(data.data) ? data.data : [];
        setEmployeeList(list);
        if (list.length > 0) {
          setSelectedEmployee((prev) => prev || list[0].id);
        }
      }
    } catch (error) {
      console.error('Fetch employees error:', error);
    }
  };

  const fetchEmployeeReport = async (userId) => {
    if (!userId) {
      setEmployeeReport(null);
      return;
    }
    if (isEmployee && user?.id && userId !== user.id) {
      return;
    }

    try {
      setLoadingEmployee(true);
      const params = {};
      const { startDate, endDate } = employeeDateRange;
      if (startDate && endDate) {
        params.startDate = startDate;
        params.endDate = endDate;
      }

      const response = await api.get(`/analytics/employee/${userId}`, { params });
      const data = response.data;
      if (data?.success) {
        setEmployeeReport(data.data);
      } else {
        toast.error(data.message || 'Failed to fetch employee report');
      }
    } catch (error) {
      console.error('Fetch employee report error:', error);
      toast.error('Failed to load employee report');
    } finally {
      setLoadingEmployee(false);
    }
  };

  const handleEmployeeChange = (e) => {
    const userId = e.target.value;
    setSelectedEmployee(userId);
    setEmployeeReport(null);
  };

  const handleEmployeeMonthChange = (value) => {
    setEmployeeMonth(value);
    if (!value) {
      setEmployeeDateRange({ startDate: '', endDate: '' });
      return;
    }

    const [yearStr, monthStr] = value.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);
    if (Number.isNaN(year) || Number.isNaN(month)) {
      return;
    }

    const lastDay = new Date(year, month, 0).getDate();
    const pad = (num) => String(num).padStart(2, '0');
    const monthLabel = pad(month);

    setEmployeeDateRange({
      startDate: `${year}-${monthLabel}-01`,
      endDate: `${year}-${monthLabel}-${pad(lastDay)}`
    });
  };

  const handleEmployeeDateChange = (field, value) => {
    if (employeeMonth) {
      setEmployeeMonth('');
    }
    setEmployeeDateRange((prev) => ({ ...prev, [field]: value }));
  };

  const handleEmployeeFiltersReset = () => {
    setEmployeeMonth('');
    setEmployeeDateRange({ startDate: '', endDate: '' });
  };

  const formatCurrency = (value) => {
    return `AED ${parseFloat(value || 0).toFixed(2)}`;
  };

  const formatNumber = (value) => {
    return new Intl.NumberFormat('en-US').format(value || 0);
  };

  const employeeSalesByType = employeeReport?.salesByType || {
    gas: { quantity: 0, revenue: 0 },
    cylinder: { quantity: 0, revenue: 0 },
    tool: { quantity: 0, revenue: 0 }
  };

  const isPendingInvoice = (invoice) => {
    const balance = parseFloat(invoice.balanceAmount || 0);
    const paymentStatus = (invoice.paymentStatus || '').toLowerCase();
    return balance > 0 || paymentStatus === 'pending' || paymentStatus === 'partial';
  };

  const isClearedInvoice = (invoice) => {
    const balance = parseFloat(invoice.balanceAmount || 0);
    const paymentStatus = (invoice.paymentStatus || '').toLowerCase();
    return paymentStatus === 'paid' || balance <= 0;
  };

  const ledgerInvoicesByCustomer = useMemo(() => {
    const map = new Map();
    ledgerInvoices.forEach((invoice) => {
      const list = map.get(invoice.customerId) || [];
      list.push(invoice);
      map.set(invoice.customerId, list);
    });
    return map;
  }, [ledgerInvoices]);

  const getLedgerFilteredInvoices = (customerId) => {
    const { status, startDate, endDate } = ledgerAppliedFilters;
    const start = startDate ? new Date(startDate) : null;
    const end = endDate ? new Date(endDate) : null;
    const source = customerId ? ledgerInvoicesByCustomer.get(customerId) || [] : ledgerInvoices;

    return source.filter((invoice) => {
      if (customerId && invoice.customerId !== customerId) return false;
      if (start && end) {
        const invoiceDate = new Date(invoice.invoiceDate || invoice.createdAt || '');
        if (invoiceDate < start || invoiceDate > end) return false;
      }
      if (status === 'Pending') return isPendingInvoice(invoice);
      if (status === 'Cleared') return isClearedInvoice(invoice);
      return true;
    });
  };

  const resolveLedgerCustomer = (query, customers) => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return null;
    return (
      customers.find((customer) => {
        const name = (customer.name || '').toLowerCase();
        const code = (customer.customerCode || '').toLowerCase();
        const phone = (customer.phone || '').toLowerCase();
        const email = (customer.email || '').toLowerCase();
        return (
          normalized === name ||
          normalized === code ||
          normalized === phone ||
          normalized === email
        );
      }) || null
    );
  };

  const handleLedgerCustomerInput = (value) => {
    setLedgerCustomerQuery(value);
    if (!ledgerLoaded) {
      setLedgerSelectedCustomer(null);
      return;
    }
    const match = resolveLedgerCustomer(value, ledgerCustomers);
    setLedgerSelectedCustomer(match);
  };

  const handleLedgerApplyFilters = () => {
    const appliedCustomer = ledgerLoaded
      ? resolveLedgerCustomer(ledgerCustomerQuery, ledgerCustomers)
      : null;

    if (ledgerLoaded) {
      setLedgerSelectedCustomer(appliedCustomer);
    }

    setLedgerAppliedFilters({
      status: ledgerStatus,
      customer: appliedCustomer,
      startDate: ledgerStartDate,
      endDate: ledgerEndDate
    });
    setLedgerFiltersApplied(true);
    toast.success('Filters applied');
  };

  const handleLedgerResetFilters = () => {
    setLedgerStatus('All');
    setLedgerCustomerQuery('');
    setLedgerSelectedCustomer(null);
    setLedgerStartDate('');
    setLedgerEndDate('');
    setLedgerAppliedFilters({
      status: 'All',
      customer: null,
      startDate: '',
      endDate: ''
    });
    setLedgerFiltersApplied(false);
  };

  const handleLedgerLoadAllCustomers = async () => {
    if (ledgerLoading) return;
    const requestToken = ledgerLoadTokenRef.current + 1;
    ledgerLoadTokenRef.current = requestToken;
    try {
      setLedgerLoading(true);
      const [customersRes, invoicesRes] = await Promise.all([
        api.get('/customers'),
        api.get('/sales-invoices')
      ]);
      if (ledgerLoadTokenRef.current !== requestToken || activeTab !== 'customer-ledger') {
        return;
      }
      const list = Array.isArray(customersRes.data?.data) ? customersRes.data.data : [];
      const invoices = Array.isArray(invoicesRes.data?.data) ? invoicesRes.data.data : [];
      setLedgerCustomers(list);
      setLedgerInvoices(invoices);
      setLedgerLoaded(true);
      setLedgerExpandedCustomers(new Set());
      if (ledgerCustomerQuery.trim()) {
        setLedgerSelectedCustomer(resolveLedgerCustomer(ledgerCustomerQuery, list));
      }
      toast.success(`Loaded ${list.length} customers.`);
    } catch (error) {
      console.error('Ledger preload error:', error);
      if (ledgerLoadTokenRef.current === requestToken && activeTab === 'customer-ledger') {
        toast.error('Failed to load customer ledger data');
        setLedgerLoaded(false);
      }
    } finally {
      if (ledgerLoadTokenRef.current === requestToken) {
        setLedgerLoading(false);
      }
    }
  };

  const handleLedgerDownload = async (type) => {
    if (!ledgerLoaded) {
      return;
    }

    await runPdfDownload(async () => {
      const appliedCustomer = ledgerAppliedFilters.customer;
      const appliedStartDate = ledgerAppliedFilters.startDate;
      const appliedEndDate = ledgerAppliedFilters.endDate;

      const params = {};
      if (appliedCustomer?.id) {
        params.customerId = appliedCustomer.id;
      }
      if (appliedStartDate && appliedEndDate) {
        params.startDate = appliedStartDate;
        params.endDate = appliedEndDate;
      }

      const res = await api.get('/sales-invoices', { params });
      const invoices = Array.isArray(res.data?.data) ? res.data.data : [];
      const normalizedType = type?.toLowerCase() || 'pending';

      let filtered = invoices;
      if (normalizedType === 'pending') {
        filtered = invoices.filter(isPendingInvoice);
      } else if (normalizedType === 'cleared') {
        filtered = invoices.filter(isClearedInvoice);
      }

      if (filtered.length === 0) {
        const label = normalizedType === 'all' ? 'transactions' : `${normalizedType} invoices`;
        throw new Error(`No ${label} available`);
      }

      const totalAmount = filtered.reduce((sum, inv) => sum + parseFloat(inv.total || 0), 0);

      const customerLabel = appliedCustomer
        ? (appliedCustomer.name || appliedCustomer.customerCode || appliedCustomer.phone || 'Selected Customer')
        : 'All Customers';

      const dateLabel = appliedStartDate && appliedEndDate
        ? `${new Date(appliedStartDate).toLocaleDateString('en-GB')} to ${new Date(appliedEndDate).toLocaleDateString('en-GB')}`
        : 'All Dates';

      const title = normalizedType === 'all'
        ? 'Customer Ledger'
        : normalizedType === 'cleared'
          ? 'Paid Invoice Report'
          : 'Pending Invoice Report';

      const statusBadgeClass = normalizedType === 'cleared'
        ? 'badge-paid'
        : normalizedType === 'pending'
          ? 'badge-pending'
          : 'badge-mixed';

      const statusBadgeLabel = normalizedType === 'cleared'
        ? 'Paid'
        : normalizedType === 'pending'
          ? 'Pending'
          : 'Paid / Pending';

      const generatedAt = new Date();
      const generatedDate = generatedAt.toLocaleDateString('en-GB');
      const docNumber = `LEDGER-${normalizedType.toUpperCase()}-${generatedAt.toISOString().slice(0, 10).replace(/-/g, '')}`;

      const fallbackCompanyName = 'SYED TAYYAB INDUSTRIAL GASES LLC';
      const normalizedCompanyName = (overviewData?.companyName || '').trim().toLowerCase();
      const companyName = normalizedCompanyName
        && normalizedCompanyName !== 'cylinder management company'
        && normalizedCompanyName !== 'company'
        && normalizedCompanyName !== 'cylinder erp'
        ? overviewData.companyName.trim()
        : fallbackCompanyName;
      const companyContact = [user?.email ? `Email: ${user.email}` : null, user?.phone ? `Phone: ${user.phone}` : null]
        .filter(Boolean)
        .join(' | ') || 'Company contact details';
      const companyLogoText = companyName
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map((word) => word[0])
        .join('')
        .toUpperCase() || 'CM';

      const companySignature = user?.signature || '';
      const companySignerName = user?.fullName || user?.username || 'System Administrator';

      const rows = filtered.map((inv, index) => {
        const quantity = Array.isArray(inv.items)
          ? inv.items.reduce((sum, item) => sum + parseFloat(item?.quantity || 0), 0)
          : 1;
        const resolvedQuantity = quantity > 0 ? quantity : 1;
        const price = parseFloat(inv.subtotal || inv.total || 0);
        const explicitTax = parseFloat(inv.tax);
        const vat = Number.isFinite(explicitTax) && explicitTax >= 0 ? explicitTax : price * 0.05;
        const lineTotal = parseFloat(inv.total || price + vat);
        const invoiceDate = inv.invoiceDate ? new Date(inv.invoiceDate).toLocaleDateString('en-GB') : 'N/A';
        const quantityLabel = Number.isInteger(resolvedQuantity)
          ? String(resolvedQuantity)
          : resolvedQuantity.toFixed(2);

        return {
          dateLabel: invoiceDate,
          invoiceNumber: inv.invoiceNumber || `INV-${index + 1}`,
          quantityLabel,
          price,
          vat,
          lineTotal
        };
      });

      const subtotalAmount = rows.reduce((sum, row) => sum + row.price, 0);
      const taxAmount = rows.reduce((sum, row) => sum + row.vat, 0);
      const grandTotal = totalAmount > 0 ? totalAmount : Math.max(0, subtotalAmount + taxAmount);

      const rowsHtml = rows.map((row) => `
        <tr>
          <td>${escapeHtml(row.dateLabel)}</td>
          <td>${escapeHtml(row.invoiceNumber)}</td>
          <td class="text-center">${escapeHtml(row.quantityLabel)}</td>
          <td class="text-right">${formatCurrency(row.price)}</td>
          <td class="text-right">${formatCurrency(row.vat)}</td>
          <td class="text-right">${formatCurrency(row.lineTotal)}</td>
        </tr>
      `).join('');

      const notes = normalizedType === 'pending'
        ? 'Follow up on pending invoices to improve cash flow.'
        : normalizedType === 'cleared'
          ? 'All listed invoices are marked as paid.'
          : 'This ledger includes both paid and pending invoices.';

      const htmlContent = `
        <html>
          <head>
            <title>${title}</title>
            <style>
              @page { size: A4; margin: 20px; }
              :root {
                --text: #0f172a;
                --muted: #64748b;
                --line: #dfe7f0;
                --header-bg: #f3f4f6;
                --table-head-bg: #1f3f8f;
                --table-head-text: #ffffff;
                --zebra: #f8fafc;
                --accent: #0f766e;
                --badge-paid-bg: #dcfce7;
                --badge-paid-text: #166534;
                --badge-pending-bg: #fef3c7;
                --badge-pending-text: #92400e;
                --badge-mixed-bg: #e2e8f0;
                --badge-mixed-text: #334155;
              }
              * { box-sizing: border-box; }
              body {
                font-family: Arial, sans-serif;
                margin: 0;
                padding: 20px;
                color: var(--text);
                background: #ffffff;
                font-size: 12px;
              }
              .page { background: #ffffff; }
              .header {
                display: flex;
                justify-content: space-between;
                gap: 16px;
                border-bottom: 1px solid var(--line);
                padding-bottom: 12px;
              }
              .company-block {
                display: flex;
                gap: 12px;
                align-items: flex-start;
              }
              .logo {
                width: 48px;
                height: 48px;
                border-radius: 10px;
                background: #0f172a;
                color: #ffffff;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 14px;
                font-weight: 700;
                letter-spacing: 0.08em;
                flex-shrink: 0;
              }
              .company-name {
                margin: 0 0 4px;
                font-size: 22px;
                font-weight: 700;
              }
              .company-contact {
                margin: 0;
                color: var(--muted);
                font-size: 11px;
                line-height: 1.4;
              }
              .doc-head {
                text-align: right;
              }
              .doc-head h1 {
                margin: 0;
                font-size: 24px;
                font-weight: 800;
                letter-spacing: 0.08em;
              }
              .doc-head p {
                margin: 4px 0 0;
                color: var(--muted);
                font-size: 11px;
              }
              .meta-grid {
                margin-top: 14px;
                border: 1px solid var(--line);
                border-radius: 10px;
                padding: 14px 16px;
                display: flex;
                justify-content: space-between;
                gap: 24px;
              }
              .meta-column {
                flex: 1;
                min-width: 0;
                display: flex;
                flex-direction: column;
                gap: 10px;
              }
              .meta-row {
                min-height: 34px;
              }
              .meta-label {
                margin: 0 0 2px;
                color: var(--muted);
                font-size: 11px;
                font-weight: 600;
              }
              .meta-value {
                margin: 0;
                font-size: 13px;
                font-weight: 600;
                line-height: 1.3;
                word-break: break-word;
              }
              .status-wrap {
                min-height: 26px;
                display: flex;
                align-items: center;
              }
              .badge {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                min-height: 24px;
                padding: 2px 12px;
                border-radius: 999px;
                font-size: 11px;
                line-height: 1;
                font-weight: 700;
                text-transform: uppercase;
                letter-spacing: 0.04em;
              }
              .badge-paid {
                background: var(--badge-paid-bg);
                color: var(--badge-paid-text);
              }
              .badge-pending {
                background: var(--badge-pending-bg);
                color: var(--badge-pending-text);
              }
              .badge-mixed {
                background: var(--badge-mixed-bg);
                color: var(--badge-mixed-text);
              }
              .table-wrap {
                margin-top: 16px;
                border: 1px solid var(--line);
                border-radius: 10px;
                overflow: hidden;
              }
              table {
                width: 100%;
                border-collapse: collapse;
                table-layout: fixed;
              }
              th, td {
                padding: 7px 8px;
                border-bottom: 0.9px solid var(--line);
                font-size: 11.5px;
                line-height: 1.25;
                vertical-align: middle;
              }
              th {
                background: var(--table-head-bg);
                color: var(--table-head-text);
                text-align: left;
                font-weight: 700;
                font-size: 11px;
              }
              tbody tr:nth-child(even) td {
                background: var(--zebra);
              }
              tbody tr:last-child td {
                border-bottom: none;
              }
              th:nth-child(1), td:nth-child(1) { width: 18%; white-space: nowrap; }
              th:nth-child(2), td:nth-child(2) { width: 22%; white-space: nowrap; }
              th:nth-child(3), td:nth-child(3) { width: 10%; white-space: nowrap; }
              th:nth-child(4), td:nth-child(4),
              th:nth-child(5), td:nth-child(5),
              th:nth-child(6), td:nth-child(6) { width: 16.67%; white-space: nowrap; }
              .text-center {
                text-align: center;
              }
              .text-right {
                text-align: right;
              }
              .summary {
                margin-top: 16px;
                margin-left: auto;
                width: 320px;
                padding: 4px 0 0;
              }
              .summary-row {
                display: flex;
                justify-content: space-between;
                margin-bottom: 8px;
                font-size: 13px;
                padding: 0 0 7px;
                border-bottom: 1px dashed #d7dee8;
              }
              .summary-row:last-child {
                margin-bottom: 0;
                border-bottom: none;
              }
              .summary-total {
                margin-top: 8px;
                padding-top: 8px;
                border-top: 1px dashed var(--line);
                font-size: 16px;
                font-weight: 800;
                color: var(--accent);
              }
              .footer {
                margin-top: 20px;
                border-top: 1px solid var(--line);
                padding-top: 12px;
              }
              .notes {
                margin: 0 0 14px;
                color: var(--muted);
                font-size: 11px;
                line-height: 1.5;
              }
              .signatures {
                display: flex;
                justify-content: center;
                margin-bottom: 10px;
              }
              .signature-card {
                width: 340px;
                text-align: center;
              }
              .signature-media {
                min-height: 74px;
                display: flex;
                align-items: flex-end;
                justify-content: center;
                margin-bottom: 8px;
              }
              .signature-media img {
                max-height: 70px;
                max-width: 240px;
                object-fit: contain;
              }
              .signature-empty {
                color: #94a3b8;
                font-size: 11px;
              }
              .signature-line {
                border-top: 1px solid #94a3b8;
                padding-top: 6px;
              }
              .signature-role {
                font-size: 11px;
                font-weight: 600;
                color: #334155;
              }
              .signature-name {
                margin-top: 2px;
                font-size: 10px;
                color: #64748b;
              }
              .thanks {
                margin: 0;
                text-align: center;
                font-size: 11px;
                font-weight: 600;
                color: #334155;
              }
            </style>
          </head>
          <body>
            <div class="page">
              <div class="header">
                <div class="company-block">
                  <div class="logo">${escapeHtml(companyLogoText)}</div>
                  <div>
                    <p class="company-name">${escapeHtml(companyName)}</p>
                    <p class="company-contact">${escapeHtml(companyContact)}</p>
                  </div>
                </div>
                <div class="doc-head">
                  <h1>${escapeHtml(title)}</h1>
                  <p>Generated: ${escapeHtml(generatedDate)}</p>
                </div>
              </div>

              <div class="meta-grid">
                <div class="meta-column">
                  <div class="meta-row">
                    <p class="meta-label">DOC NO :</p>
                    <p class="meta-value">${escapeHtml(docNumber)}</p>
                  </div>
                  <div class="meta-row">
                    <p class="meta-label">Customer Name :</p>
                    <p class="meta-value">${escapeHtml(appliedCustomer?.name || customerLabel)}</p>
                  </div>
                </div>
                <div class="meta-column">
                  <div class="meta-row">
                    <p class="meta-label">Date :</p>
                    <p class="meta-value">${escapeHtml(generatedDate)}</p>
                  </div>
                  <div class="meta-row">
                    <p class="meta-label">Status :</p>
                    <div class="status-wrap">
                      <span class="badge ${statusBadgeClass}">${escapeHtml(statusBadgeLabel)}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div class="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Invoice Number</th>
                      <th class="text-center">Qty</th>
                      <th class="text-right">Price</th>
                      <th class="text-right">5% VAT</th>
                      <th class="text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${rowsHtml}
                  </tbody>
                </table>
              </div>

              <div class="summary">
                <div class="summary-row"><span>Subtotal</span><strong>${formatCurrency(subtotalAmount)}</strong></div>
                <div class="summary-row"><span>Tax</span><strong>${formatCurrency(taxAmount)}</strong></div>
                <div class="summary-row summary-total"><span>Grand Total</span><strong>${formatCurrency(grandTotal)}</strong></div>
              </div>

              <div class="footer">
                <p class="notes">
                  Notes: ${escapeHtml(notes)} | Customer: ${escapeHtml(customerLabel)} | Date Range: ${escapeHtml(dateLabel)}.
                </p>
                <div class="signatures">
                  <div class="signature-card">
                    <div class="signature-media">
                      ${companySignature
                        ? `<img src="${escapeHtml(companySignature)}" alt="Company Signature" />`
                        : '<span class="signature-empty">No company signature saved on Dashboard</span>'}
                    </div>
                    <div class="signature-line">
                      <div class="signature-role">Authorized Company Signature</div>
                      <div class="signature-name">${escapeHtml(companySignerName)}</div>
                    </div>
                  </div>
                </div>
                <p class="thanks">Thank you for your business.</p>
              </div>
            </div>
          </body>
        </html>
      `;

      const statusLabelForFile = normalizedType === 'pending'
        ? 'Pending Invoices'
        : normalizedType === 'cleared'
          ? 'Cleared Invoices'
          : 'All Transactions';
      const customerNameForFile = appliedCustomer?.name
        || appliedCustomer?.customerCode
        || appliedCustomer?.phone
        || 'All Customers';
      const filename = `${sanitizeFilenamePart(customerNameForFile, 'Customer')} (${sanitizeFilenamePart(statusLabelForFile, 'Invoices')}).pdf`;

      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.left = '-9999px';
      iframe.style.top = '0';
      iframe.style.width = '210mm';
      iframe.style.height = '1px';
      iframe.style.opacity = '0';
      iframe.style.pointerEvents = 'none';
      iframe.style.border = '0';
      document.body.appendChild(iframe);

      try {
        const doc = iframe.contentDocument;
        if (!doc) {
          throw new Error('Unable to prepare PDF content');
        }
        doc.open();
        doc.write(htmlContent);
        doc.close();

        await new Promise((resolve) => setTimeout(resolve, 300));
        doc.body.style.margin = '0';
        doc.body.style.background = '#ffffff';
        const bodyHeight = doc.body.scrollHeight || 1;
        iframe.style.height = `${bodyHeight}px`;
        await new Promise((resolve) => setTimeout(resolve, 100));

        const blob = await captureElementToPdfBlob({
          element: doc.body,
          orientation: 'p',
          widthOverride: '210mm',
          skipStyleAdjust: true
        });
        const file = typeof File !== 'undefined'
          ? new File([blob], filename, { type: 'application/pdf' })
          : null;

        saveBlobAsFile(blob, filename);
        setSharePrompt({
          filename,
          file,
          title,
          text: `${title} for ${customerLabel}`,
          whatsappMessage: `${title} for ${customerLabel} is ready. The PDF has already been downloaded as ${filename}. Please attach it from your device.`,
          emailSubject: title,
          emailBody: `${title} for ${customerLabel} is ready.\n\nThe PDF has already been downloaded as ${filename}. Please attach that file to this email before sending.`
        });
      } finally {
        document.body.removeChild(iframe);
      }
    }, {
      loadingMessage: `Preparing ${type} invoices...`
    });
  };

  const ledgerFilteredCustomers = ledgerLoaded && ledgerCustomerQuery.trim()
    ? ledgerCustomers.filter((customer) => {
        const q = ledgerCustomerQuery.trim().toLowerCase();
        return (
          (customer.name || '').toLowerCase().includes(q) ||
          (customer.customerCode || '').toLowerCase().includes(q) ||
          (customer.phone || '').toLowerCase().includes(q) ||
          (customer.email || '').toLowerCase().includes(q)
        );
      }).slice(0, 8)
    : [];

  const ledgerAppliedCustomerId = ledgerAppliedFilters.customer?.id || null;
  const ledgerAppliedInvoices = ledgerLoaded
    ? getLedgerFilteredInvoices(ledgerAppliedCustomerId)
    : [];
  const ledgerDownloadType = ledgerAppliedFilters.status === 'Pending'
    ? 'pending'
    : ledgerAppliedFilters.status === 'Cleared'
      ? 'cleared'
      : 'all';
  const ledgerHasSelectedCustomer = Boolean(ledgerAppliedFilters.customer?.id);
  const ledgerCanDownload = ledgerAppliedInvoices.length > 0
    && (ledgerHasSelectedCustomer || ledgerAppliedFilters.status === 'Pending');
  const ledgerDownloadLabel = ledgerDownloadType === 'pending'
    ? (ledgerHasSelectedCustomer ? 'Download Pending Invoices' : 'Download All Pending Invoices')
    : ledgerDownloadType === 'cleared'
      ? 'Download Cleared Invoices'
      : 'Download All Transactions';
  const activeEmployeeId = isEmployee ? user?.id : selectedEmployee;
  const cashPaperTabEmployeeId = user?.id || null;

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-7" id="reports-pdf-content">
      {/* Header */}
      <div className="relative overflow-hidden rounded-3xl border border-slate-200/70 bg-gradient-to-r from-white via-slate-50 to-cyan-50 p-4 sm:p-6 shadow-sm sm:p-8">
        <div className="pointer-events-none absolute -top-16 right-10 h-44 w-44 rounded-full bg-white/70 blur-3xl"></div>
        <div className="pointer-events-none absolute -bottom-20 left-12 h-52 w-52 rounded-full bg-cyan-100/50 blur-3xl"></div>
        <div className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Business Intelligence</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">Reports & Analytics</h1>
            <p className="mt-1 text-sm text-slate-600">Comprehensive system overview and employee performance</p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/80 px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm">
            <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
            Live Insights
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="overflow-x-auto rounded-2xl border border-slate-200/70 bg-white/80 p-2 shadow-sm backdrop-blur">
        <div className="flex min-w-max gap-2 sm:min-w-0 sm:grid sm:grid-cols-3">
          <button
            onClick={() => setActiveTab('overview')}
            className={`inline-flex items-center justify-center whitespace-nowrap rounded-xl px-5 py-3 text-sm font-semibold transition ${
              activeTab === 'overview'
                ? 'bg-slate-900 text-white shadow-lg shadow-slate-900/20'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <ChartBarIcon className="mr-2 h-5 w-5" />
            {isEmployee ? 'My Sales Overview' : 'Employee Sales Overview'}
          </button>
          <button
            onClick={() => setActiveTab('customer-ledger')}
            className={`inline-flex items-center justify-center whitespace-nowrap rounded-xl px-5 py-3 text-sm font-semibold transition ${
              activeTab === 'customer-ledger'
                ? 'bg-slate-900 text-white shadow-lg shadow-slate-900/20'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <UserGroupIcon className="mr-2 h-5 w-5" />
            Customer Ledger
          </button>
          <button
            onClick={() => setActiveTab('cash-paper')}
            className={`inline-flex items-center justify-center whitespace-nowrap rounded-xl px-5 py-3 text-sm font-semibold transition ${
              activeTab === 'cash-paper'
                ? 'bg-slate-900 text-white shadow-lg shadow-slate-900/20'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <CurrencyDollarIcon className="mr-2 h-5 w-5" />
            Cash Paper Report
          </button>
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="space-y-4 sm:space-y-6">
      {/* Overview Section removed */}

      {/* Employee Reports Section */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold text-slate-900">
          {isEmployee ? 'My Performance Report' : 'Employee Performance Reports'}
        </h2>
        
        <div className="rounded-2xl border border-slate-200/70 bg-white/90 p-4 sm:p-6 shadow-sm">
          {!isEmployee && (
            <div className="mb-6">
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">Select Employee</label>
              <select
                value={selectedEmployee}
                onChange={handleEmployeeChange}
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-slate-800 outline-none ring-slate-200 transition focus:ring-2 md:w-96"
              >
                <option value="">-- Select an employee --</option>
                {employeeList.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.fullName} (@{emp.username}) - {emp.role.replace('_', ' ')}
                  </option>
                ))}
              </select>
            </div>
          )}

          {!loadingEmployee && employeeReport && (
            <div className="mb-6 rounded-2xl border border-sky-200/80 bg-sky-50/80 p-4">
              <div className="flex items-center gap-4">
                <div className="rounded-2xl bg-white/80 p-3 shadow-sm">
                  <UserGroupIcon className="h-8 w-8 text-sky-600" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">
                    {employeeReport.employee.fullName}
                  </h3>
                  <p className="text-sm text-slate-600">
                    @{employeeReport.employee.username} - {employeeReport.employee.role.replace('_', ' ')}
                  </p>
                  <p className="text-sm text-slate-500">{employeeReport.employee.email}</p>
                </div>
              </div>
            </div>
          )}

          <div className="mb-6 rounded-2xl border border-slate-200/80 bg-gradient-to-r from-slate-50 to-white p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-600">
              <CalendarIcon className="h-4 w-4 text-slate-500" />
              <span>Filter Employee Performance</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Month
                </label>
                <input
                  type="month"
                  value={employeeMonth}
                  onChange={(e) => handleEmployeeMonthChange(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-800 outline-none ring-slate-200 transition focus:ring-2"
                />
              </div>
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Start Date
                </label>
                <input
                  type="date"
                  value={employeeDateRange.startDate}
                  onChange={(e) => handleEmployeeDateChange('startDate', e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-800 outline-none ring-slate-200 transition focus:ring-2"
                />
              </div>
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  End Date
                </label>
                <input
                  type="date"
                  value={employeeDateRange.endDate}
                  onChange={(e) => handleEmployeeDateChange('endDate', e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-800 outline-none ring-slate-200 transition focus:ring-2"
                />
              </div>
              <div className="flex items-end">
                <button
                  type="button"
                  onClick={handleEmployeeFiltersReset}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Clear Filters
                </button>
              </div>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Selecting a month will auto-fill the custom date range.
            </p>
          </div>

          {loadingEmployee && (
            <div className="flex justify-center py-8">
              <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-slate-700"></div>
            </div>
          )}

          {!loadingEmployee && employeeReport && (
            <div className="space-y-4 sm:space-y-6">
              {/* Sales Quantity Breakdown */}
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-700">
                  <ShoppingCartIcon className="h-4 w-4 text-slate-500" />
                  <span>Sales Quantity Breakdown</span>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                    <p className="text-sm text-slate-600">Gas Sold</p>
                    <p className="text-2xl font-bold text-slate-900">
                      {formatNumber(employeeSalesByType.gas.quantity)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                    <p className="text-sm text-slate-600">Cylinders Sold</p>
                    <p className="text-2xl font-bold text-slate-900">
                      {formatNumber(employeeSalesByType.cylinder.quantity)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                    <p className="text-sm text-slate-600">Tools Sold</p>
                    <p className="text-2xl font-bold text-slate-900">
                      {formatNumber(employeeSalesByType.tool.quantity)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Sales Revenue Breakdown */}
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-700">
                  <CurrencyDollarIcon className="h-4 w-4 text-slate-500" />
                  <span>Sales Revenue Breakdown</span>
                </div>
                <div className="flex flex-col gap-4 lg:grid lg:grid-cols-3 lg:gap-4">
                  <div className="w-full rounded-xl border border-emerald-100 bg-emerald-50 p-4">
                    <p className="text-sm text-slate-600">Gas Revenue</p>
                    <p className="text-2xl font-bold text-emerald-700">
                      {formatCurrency(employeeSalesByType.gas.revenue)}
                    </p>
                  </div>
                  <div className="w-full rounded-xl border border-emerald-100 bg-emerald-50 p-4">
                    <p className="text-sm text-slate-600">Cylinder Revenue</p>
                    <p className="text-2xl font-bold text-emerald-700">
                      {formatCurrency(employeeSalesByType.cylinder.revenue)}
                    </p>
                  </div>
                  <div className="w-full rounded-xl border border-emerald-100 bg-emerald-50 p-4">
                    <p className="text-sm text-slate-600">Tool Revenue</p>
                    <p className="text-2xl font-bold text-emerald-700">
                      {formatCurrency(employeeSalesByType.tool.revenue)}
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold text-slate-900">Employee Cash Paper Report</h3>
                    <p className="text-xs text-slate-500">Cash paper is scoped to the currently selected employee.</p>
                  </div>
                </div>
                {activeEmployeeId ? (
                  <CashPaperReport key={`overview-cash-paper-${activeEmployeeId}`} employeeId={activeEmployeeId} />
                ) : (
                  <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                    Select an employee to load cash paper details.
                  </div>
                )}
              </div>

            </div>
          )}

          {!loadingEmployee && !employeeReport && selectedEmployee === '' && (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 py-12 text-center text-slate-500">
              <ChartBarIcon className="mx-auto mb-4 h-12 w-12 text-slate-400" />
              <p>Select an employee to view their performance report</p>
            </div>
          )}
        </div>
      </div>
        </div>
      )}

      {activeTab === 'customer-ledger' && (
        <div className="space-y-4 sm:space-y-6">
          <div className="relative overflow-hidden rounded-2xl border border-slate-200/70 bg-gradient-to-br from-slate-50 via-white to-slate-100 p-4 sm:p-6 shadow-sm sm:p-8">
            <div className="pointer-events-none absolute -top-16 right-8 h-40 w-40 rounded-full bg-white/60 blur-3xl"></div>
            <div className="pointer-events-none absolute -bottom-20 left-10 h-48 w-48 rounded-full bg-slate-200/60 blur-3xl"></div>
            <div className="relative z-10 space-y-4 sm:space-y-6">
              <div className="space-y-2">
                <h2 className="text-2xl font-semibold text-slate-900">Enhanced Customer Ledger</h2>
                <p className="text-sm text-slate-600">
                  Review ledger activity with streamlined filters and a refined, glass-style layout.
                </p>
              </div>

              <div className="rounded-2xl border border-white/60 bg-white/70 p-4 sm:p-5 shadow-[0_12px_30px_rgba(15,23,42,0.08)] backdrop-blur-xl">
                <div className="flex items-center gap-2 text-sm font-medium text-slate-600">
                  <FunnelIcon className="h-4 w-4 text-slate-500" />
                  Filter Customers
                </div>
                <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Customer Search
                    </label>
                    <input
                      type="text"
                      placeholder="Name, reference, or number"
                      value={ledgerCustomerQuery}
                      onChange={(e) => handleLedgerCustomerInput(e.target.value)}
                      list="ledger-customer-options"
                      className="w-full rounded-xl border border-white/70 bg-white/60 px-3 py-2 text-sm text-slate-700 shadow-sm outline-none transition focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
                    />
                    <datalist id="ledger-customer-options">
                      {ledgerFilteredCustomers.map((customer) => (
                        <option
                          key={customer.id}
                          value={customer.name || customer.customerCode || customer.phone || ''}
                          label={`${customer.customerCode || ''}${customer.phone ? ` - ${customer.phone}` : ''}`.trim()}
                        />
                      ))}
                    </datalist>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Status
                    </label>
                    <select
                      value={ledgerStatus}
                      onChange={(e) => setLedgerStatus(e.target.value)}
                      className="w-full rounded-xl border border-white/70 bg-white/60 px-3 py-2 text-sm text-slate-700 shadow-sm outline-none transition focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
                    >
                      <option>All</option>
                      <option>Pending</option>
                      <option>Cleared</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Start Date
                    </label>
                    <input
                      type="date"
                      value={ledgerStartDate}
                      onChange={(e) => setLedgerStartDate(e.target.value)}
                      className="w-full rounded-xl border border-white/70 bg-white/60 px-3 py-2 text-sm text-slate-700 shadow-sm outline-none transition focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      End Date
                    </label>
                    <input
                      type="date"
                      value={ledgerEndDate}
                      onChange={(e) => setLedgerEndDate(e.target.value)}
                      className="w-full rounded-xl border border-white/70 bg-white/60 px-3 py-2 text-sm text-slate-700 shadow-sm outline-none transition focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
                    />
                  </div>
                </div>
                <div className="mt-5 grid grid-cols-2 gap-3 sm:flex sm:items-center">
                  <button
                    onClick={handleLedgerApplyFilters}
                    className="flex-1 rounded-xl bg-slate-900/90 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-slate-900/20 transition hover:bg-slate-900"
                  >
                    Apply Filters
                  </button>
                  <button
                    onClick={handleLedgerResetFilters}
                    className="flex-1 rounded-xl border border-white/70 bg-white/60 px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-white"
                  >
                    Reset
                  </button>
                </div>
                {ledgerFiltersApplied && (
                  <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                    {ledgerCanDownload ? (
                      <button
                        onClick={() => handleLedgerDownload(ledgerDownloadType)}
                        disabled={!ledgerLoaded || ledgerLoading}
                        className="flex-1 rounded-xl border border-white/70 bg-white/70 px-4 py-2 text-sm font-semibold text-slate-800 shadow-lg shadow-slate-200/70 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {ledgerDownloadLabel}
                      </button>
                    ) : ledgerAppliedInvoices.length === 0 ? (
                      <div className="flex-1 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800">
                        No matching invoices found for selected filters.
                      </div>
                    ) : (
                      <div className="flex-1 rounded-xl border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-medium text-sky-800">
                        Select a customer for All/Cleared download, or choose Pending for system-wide pending PDF.
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-white/60 bg-white/70 p-8 text-center shadow-[0_12px_30px_rgba(15,23,42,0.08)] backdrop-blur-xl">
                {ledgerLoaded ? (
                  <div className="space-y-4 sm:space-y-6 text-left">
                    {ledgerLoading && (
                      <div className="flex items-center gap-3 text-sm text-slate-600">
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600"></span>
                        Loading customer ledger...
                      </div>
                    )}
                    {(() => {
                      const baseCustomers = ledgerAppliedFilters.customer
                        ? ledgerCustomers.filter((customer) => customer.id === ledgerAppliedFilters.customer.id)
                        : ledgerCustomers;

                      const displayCustomers = baseCustomers
                        .map((customer) => ({
                          customer,
                          customerInvoices: getLedgerFilteredInvoices(customer.id)
                        }))
                        .filter(({ customerInvoices }) => !ledgerFiltersApplied || customerInvoices.length > 0);

                      if (displayCustomers.length === 0) {
                        return (
                          <p className="text-sm text-slate-600">No customers match the selected filters.</p>
                        );
                      }

                      return displayCustomers.map(({ customer, customerInvoices }) => {
                        const pendingInvoices = customerInvoices.filter(isPendingInvoice);
                        const clearedInvoices = customerInvoices.filter(isClearedInvoice);
                        const showPendingSection = ledgerAppliedFilters.status !== 'Cleared';
                        const showClearedSection = ledgerAppliedFilters.status !== 'Pending';
                        const isExpanded = ledgerExpandedCustomers.has(customer.id);

                        return (
                          <div key={customer.id} className="rounded-xl border border-white/70 bg-white/60 p-4 shadow-sm">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setLedgerExpandedCustomers((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(customer.id)) {
                                      next.delete(customer.id);
                                    } else {
                                      next.add(customer.id);
                                    }
                                    return next;
                                  });
                                }}
                                className="flex items-start gap-2 text-left"
                              >
                                {isExpanded ? (
                                  <ChevronDownIcon className="h-4 w-4 text-slate-500 mt-1" />
                                ) : (
                                  <ChevronRightIcon className="h-4 w-4 text-slate-500 mt-1" />
                                )}
                                <div>
                                  <p className="text-sm font-semibold text-slate-900">
                                    {customer.name || customer.customerCode || 'Unnamed Customer'}
                                  </p>
                                  <p className="text-xs text-slate-500">
                                    {customer.customerCode || 'N/A'}{customer.phone ? ` - ${customer.phone}` : ''}
                                  </p>
                                </div>
                              </button>
                              <div className="text-xs text-slate-500">
                                Matching Invoices: {customerInvoices.length}
                              </div>
                            </div>

                            {isExpanded && (
                              <div className={`mt-4 grid grid-cols-1 gap-4 ${showPendingSection && showClearedSection ? 'lg:grid-cols-2' : ''}`}>
                                {showPendingSection && (
                                  <div className="space-y-2">
                                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                      Pending Invoices
                                    </p>
                                    {pendingInvoices.length === 0 ? (
                                      <p className="text-xs text-slate-500">No pending invoices.</p>
                                    ) : (
                                      <div className="space-y-2">
                                        {pendingInvoices.map((invoice) => (
                                          <div key={invoice.id} className="rounded-lg border border-slate-200/70 bg-white/70 p-2 text-xs text-slate-700">
                                            <div className="flex items-center justify-between gap-2">
                                              <span className="font-semibold">{invoice.invoiceNumber || 'N/A'}</span>
                                              <span>{formatCurrency(invoice.total)}</span>
                                            </div>
                                            <div className="flex items-center justify-between text-[11px] text-slate-500">
                                              <span>{invoice.invoiceDate ? new Date(invoice.invoiceDate).toLocaleDateString('en-GB') : 'N/A'}</span>
                                              <span>Balance: {formatCurrency(invoice.balanceAmount)}</span>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                )}
                                {showClearedSection && (
                                  <div className="space-y-2">
                                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                      Cleared Invoices
                                    </p>
                                    {clearedInvoices.length === 0 ? (
                                      <p className="text-xs text-slate-500">No cleared invoices.</p>
                                    ) : (
                                      <div className="space-y-2">
                                        {clearedInvoices.map((invoice) => (
                                          <div key={invoice.id} className="rounded-lg border border-slate-200/70 bg-white/70 p-2 text-xs text-slate-700">
                                            <div className="flex items-center justify-between gap-2">
                                              <span className="font-semibold">{invoice.invoiceNumber || 'N/A'}</span>
                                              <span>{formatCurrency(invoice.total)}</span>
                                            </div>
                                            <div className="flex items-center justify-between text-[11px] text-slate-500">
                                              <span>{invoice.invoiceDate ? new Date(invoice.invoiceDate).toLocaleDateString('en-GB') : 'N/A'}</span>
                                              <span>Paid: {formatCurrency(invoice.paidAmount)}</span>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      });
                    })()}
                  </div>
                ) : (
                  <>
                    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-white/70 shadow-md">
                      <UserGroupIcon className="h-8 w-8 text-slate-500" />
                    </div>
                    <h3 className="mt-4 text-lg font-semibold text-slate-900">No ledger data available</h3>
                    <p className="mt-2 text-sm text-slate-600">
                      Adjust the filters above or load all customers to begin exploring the ledger.
                    </p>
                    <button
                      onClick={handleLedgerLoadAllCustomers}
                      disabled={ledgerLoading}
                      className="mt-5 inline-flex items-center justify-center rounded-xl bg-white/70 px-5 py-2 text-sm font-semibold text-slate-800 shadow-lg shadow-slate-200/70 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Load All Customers
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cash Paper Report Tab */}
      {activeTab === 'cash-paper' && (
        <div className="space-y-1">
          <div className="rounded-2xl border border-slate-200/70 bg-white/90 p-4 shadow-sm sm:p-6">
            <CashPaperReport key={`cash-paper-tab-${cashPaperTabEmployeeId || 'system'}`} employeeId={cashPaperTabEmployeeId} />
          </div>
        </div>
      )}

      <PdfShareDialog shareData={sharePrompt} onClose={() => setSharePrompt(null)} />
    </div>
  );
}
