import React, { useState, useEffect, useMemo, useCallback } from 'react';
import toast from 'react-hot-toast';
import {
  ArrowDownTrayIcon,
  ArrowPathIcon,
  CalendarIcon,
} from '@heroicons/react/24/outline';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';
import { captureElementToPdf, runPdfDownload } from '../utils/pdfDownload';

const getUaeISODate = () => (
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dubai' }).format(new Date())
);

const formatDpNumber = (value) => {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (!digits) return '000000';
  return digits.padStart(6, '0').slice(-6);
};

const formatDpLabel = (value) => `DP NO: ${formatDpNumber(value)}`;
const formatRetLabel = (value) => `RET NO: ${formatDpNumber(value)}`;

const formatCurrency = (value) => `AED ${parseFloat(value || 0).toFixed(2)}`;

const getRoleLabel = (role) => {
  if (!role) return 'User';
  if (role === 'super_admin') return 'Super Admin';
  if (role === 'manager') return 'Manager';
  if (role === 'employee') return 'Employee';
  return role.replace('_', ' ');
};

const SectionTable = React.memo(({
  title,
  columns,
  rows,
  emptyMessage,
  totalLabel,
  totalValue
}) => (
  <div className="border border-gray-300">
    <div
      className="px-2 py-1 text-[11px] font-semibold border-b border-gray-300"
      style={{ backgroundColor: '#ffffff' }}
    >
      {title}
    </div>
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[10px]">
        <thead>
          <tr style={{ backgroundColor: '#ffffff' }}>
            {columns.map((col) => (
              <th key={col} className="border border-gray-300 px-2 py-1 text-left font-semibold text-gray-900">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows && rows.length > 0 ? (
            rows.map((row, idx) => (
              <tr key={idx}>
                {row.map((val, i) => (
                  <td key={i} className="border border-gray-300 px-2 py-1 text-gray-900">
                    {val}
                  </td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={columns.length} className="border border-gray-300 px-2 py-2 text-center text-gray-500">
                {emptyMessage}
              </td>
            </tr>
          )}
          <tr className="font-semibold">
            <td colSpan={columns.length - 1} className="border border-gray-300 px-2 py-1 text-left">
              {totalLabel}
            </td>
            <td className="border border-gray-300 px-2 py-1 text-right">
              {totalValue}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
));

const CashPaperReport = ({ employeeId = null }) => {
  const { user } = useAuth();
  const [startDate, setStartDate] = useState(() => getUaeISODate());
  const [endDate, setEndDate] = useState(() => getUaeISODate());
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [pdfLoading, setPdfLoading] = useState(false);

  const fetchCashPaperData = useCallback(async ({ silent = false, skipLoading = false } = {}) => {
    try {
      if (!skipLoading) {
        setLoading(true);
      }
      const params = { startDate, endDate };
      if (employeeId) {
        params.employeeId = employeeId;
      }
      const response = await api.get('/reports/cash-paper', { params });
      const result = response.data;
      if (result?.success) {
        setData(result.data);
        return result.data;
      } else if (!silent) {
        console.error('API Error:', result);
        toast.error(result.message || 'Failed to fetch cash paper data');
      }
    } catch (error) {
      console.error('Fetch cash paper error:', error);
      if (!silent) {
        toast.error(error.message || 'Failed to load cash paper report');
      }
    } finally {
      if (!skipLoading) {
        setLoading(false);
      }
    }
    return null;
  }, [startDate, endDate, employeeId]);

  useEffect(() => {
    if (startDate && endDate) {
      fetchCashPaperData();
    }
  }, [startDate, endDate, fetchCashPaperData]);

  const handleRefresh = useCallback(() => {
    fetchCashPaperData();
    toast.success('Data refreshed successfully');
  }, [fetchCashPaperData]);

  const hasCashPaperData = useCallback((payload) => {
    if (!payload) return false;
    const lists = ['creditSales', 'cashSales', 'deposits', 'returns', 'rentals'];
    const hasRows = lists.some((key) => (payload[key] || []).length > 0);
    const summaryValues = payload.summary ? Object.values(payload.summary) : [];
    const hasTotals = summaryValues.some((value) => parseFloat(value || 0) > 0);
    return hasRows || hasTotals;
  }, []);

  const generatePDF = useCallback(async () => {
    setPdfLoading(true);
    try {
      await runPdfDownload(async () => {
        const latestData = await fetchCashPaperData({ silent: true, skipLoading: true });
        const sourceData = latestData || data;

        if (!hasCashPaperData(sourceData)) {
          throw new Error('No data to download');
        }

        await new Promise((resolve) => setTimeout(resolve, 200));
        const element = document.getElementById('cash-paper-pdf-content');

        await captureElementToPdf({
          element,
          filename: `cash-paper-report-${startDate}-to-${endDate}.pdf`,
          orientation: 'p',
          widthOverride: '210mm'
        });
      });
    } finally {
      setPdfLoading(false);
    }
  }, [data, fetchCashPaperData, hasCashPaperData, startDate, endDate]);

  const summary = useMemo(() => data?.summary || {}, [data]);

  const creditSalesRows = useMemo(() => (data?.creditSales || []).map(item => ([
    item.invoiceId,
    item.customer,
    <span className="block text-right" key={`${item.invoiceId}-vat`}>{item.vat}</span>,
    <span className="block text-right" key={`${item.invoiceId}-amount`}>{item.amount}</span>
  ])), [data?.creditSales]);

  const cashSalesRows = useMemo(() => (data?.cashSales || []).map(item => ([
    item.invoiceId,
    item.customer,
    <span className="block text-right" key={`${item.invoiceId}-vat`}>{item.vat}</span>,
    <span className="block text-right" key={`${item.invoiceId}-amount`}>{item.amount}</span>
  ])), [data?.cashSales]);

  const depositRows = useMemo(() => (data?.deposits || []).map(item => ([
    formatDpLabel(item.invoiceId),
    item.customer,
    <span className="block text-right" key={`${item.invoiceId}-amount`}>{item.amount}</span>
  ])), [data?.deposits]);

  const returnRows = useMemo(() => (data?.returns || []).map(item => ([
    formatRetLabel(item.invoiceId),
    item.customer,
    <span className="block text-right" key={`${item.invoiceId}-amount`}>{item.amount}</span>
  ])), [data?.returns]);

  const rentalRows = useMemo(() => (data?.rentals || []).map(item => ([
    item.invoiceId,
    item.customer,
    <span className="block text-right" key={`${item.invoiceId}-vat`}>{item.vat}</span>,
    <span className="block text-right" key={`${item.invoiceId}-amount`}>{item.amount}</span>
  ])), [data?.rentals]);

  const reportDateLabel = useMemo(() => {
    if (startDate && endDate && startDate === endDate) return startDate;
    return `${startDate || ''}${startDate && endDate ? ' to ' : ''}${endDate || ''}`;
  }, [startDate, endDate]);

  const renderReportBody = ({ withId = false } = {}) => (
    <div
      className="space-y-3 p-2 text-[10px]"
      style={{ backgroundColor: '#ffffff' }}
      {...(withId ? { id: 'cash-paper-report' } : {})}
    >
      <div className="text-center">
        <h3 className="text-[11px] font-semibold text-gray-900">
          Cash Paper ({getRoleLabel(user?.role)}) - {reportDateLabel || 'N/A'}
        </h3>
      </div>

      <SectionTable
        title="Credit Sale Invoices List"
        columns={['Inv Id', 'Customer', 'VAT 5%', 'Amount']}
        rows={creditSalesRows}
        emptyMessage="No credit sales"
        totalLabel="Total Credit"
        totalValue={formatCurrency(summary.totalCredit)}
      />

      <SectionTable
        title="Cash Sale Invoices List"
        columns={['Inv Id', 'Customer', 'VAT 5%', 'Amount']}
        rows={cashSalesRows}
        emptyMessage="No debit sales"
        totalLabel="Total Debit"
        totalValue={formatCurrency(summary.totalDebit)}
      />

      <SectionTable
        title="Deposit Cylinder Invoice"
        columns={['Inv Id', 'Customer', 'Amount']}
        rows={depositRows}
        emptyMessage="No deposit cylinder transactions"
        totalLabel="Total Deposit Cylinder"
        totalValue={formatCurrency(summary.totalDepositCylinder)}
      />

      <SectionTable
        title="Return Cylinder Invoice"
        columns={['Inv Id', 'Customer', 'Amount']}
        rows={returnRows}
        emptyMessage="No return cylinder transactions"
        totalLabel="Total Return Cylinder"
        totalValue={formatCurrency(summary.totalReturnCylinder)}
      />

      <SectionTable
        title="Rental Collection Invoice"
        columns={['Inv Id', 'Customer', 'VAT 5%', 'Amount']}
        rows={rentalRows}
        emptyMessage="No rental invoices"
        totalLabel="Total Rental Collection"
        totalValue={formatCurrency(summary.totalRentalCollection)}
      />

      <div className="border border-gray-300">
        <div
          className="px-2 py-1 text-[11px] font-semibold border-b border-gray-300"
          style={{ backgroundColor: '#ffffff' }}
        >
          Summary
        </div>
        <table className="w-full border-collapse text-[10px]">
          <tbody>
            <tr>
              <td className="border border-gray-300 px-2 py-1">Total Credit</td>
              <td className="border border-gray-300 px-2 py-1 text-right">{formatCurrency(summary.totalCredit)}</td>
            </tr>
            <tr>
              <td className="border border-gray-300 px-2 py-1">Total Debit</td>
              <td className="border border-gray-300 px-2 py-1 text-right">{formatCurrency(summary.totalDebit)}</td>
            </tr>
            <tr>
              <td className="border border-gray-300 px-2 py-1">Other</td>
              <td className="border border-gray-300 px-2 py-1 text-right">{formatCurrency(summary.other)}</td>
            </tr>
            <tr>
              <td className="border border-gray-300 px-2 py-1">Total Rental Collection</td>
              <td className="border border-gray-300 px-2 py-1 text-right">{formatCurrency(summary.totalRentalCollection)}</td>
            </tr>
            <tr>
              <td className="border border-gray-300 px-2 py-1">Total VAT (5%)</td>
              <td className="border border-gray-300 px-2 py-1 text-right">{formatCurrency(summary.totalVAT)}</td>
            </tr>
            <tr className="font-semibold">
              <td className="border border-gray-300 px-2 py-1">Grand Total</td>
              <td className="border border-gray-300 px-2 py-1 text-right">{formatCurrency(summary.grandTotal)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Cash Paper Report</h2>
          <p className="text-gray-600 mt-1">Daily cash activity and transaction summary</p>
        </div>
      </div>

      {/* Date Filters */}
      <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-4">
          <CalendarIcon className="h-5 w-5 text-gray-500" />
          <div className="grid grid-cols-2 gap-4 w-full sm:flex sm:gap-4 sm:flex-1 sm:min-w-fit">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">From Date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">To Date</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 w-full sm:w-auto sm:flex sm:gap-2">
            <button
              onClick={handleRefresh}
              disabled={loading}
              className="flex items-center justify-center gap-2 px-3 py-2 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ArrowPathIcon className="h-4 w-4" />
              Refresh
            </button>
            <button
              onClick={generatePDF}
              disabled={!data || pdfLoading || loading}
              className="flex items-center justify-center gap-2 px-3 py-2 text-xs bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ArrowDownTrayIcon className="h-4 w-4" />
              {pdfLoading ? 'Generating...' : 'Download PDF'}
            </button>
          </div>
        </div>
      </div>

      {/* Loading Spinner (shown overlay when fetching) */}
      {loading && (
        <div className="flex justify-center items-center h-40">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      )}

      {/* Main Content - Always renders when data exists */}
      {data && renderReportBody({ withId: true })}

      {/* Empty State */}
      {!data && !loading && (
        <div className="text-center py-12 text-gray-500">
          <p>No data available</p>
        </div>
      )}

      {/* PDF Hidden Content - A4 Print Safe */}
      <div id="cash-paper-pdf-content" style={{ display: 'none' }}>
        {data && (
          <div
            style={{
              padding: '12mm',
              fontFamily: 'Arial, sans-serif',
              fontSize: '10px',
              width: '210mm'
            }}
          >
            {renderReportBody()}
          </div>
        )}
      </div>
    </div>
  );
};

export default CashPaperReport;
