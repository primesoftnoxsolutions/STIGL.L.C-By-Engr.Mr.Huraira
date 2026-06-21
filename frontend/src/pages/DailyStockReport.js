import React, { useCallback, useEffect, useState } from 'react';
import api from '../utils/api';
import toast from 'react-hot-toast';
import { ArrowDownTrayIcon, CalendarDaysIcon, UserCircleIcon } from '@heroicons/react/24/outline';
import { captureElementToPdf, runPdfDownload } from '../utils/pdfDownload';
import { useAuth } from '../context/AuthContext';
import { getUaeDateKey } from '../utils/uaeDate';

const openingCols = ['Full', 'Empty', 'Tool'];
const duringCols = [
  { key: 'emptyPur', label: 'Empty Pur' },
  { key: 'toolPur', label: 'Tool Pur' },
  { key: 'fullPur', label: 'Full Pur' },
  { key: 'refilled', label: 'Refilled' },
  { key: 'fullCylSales', label: 'Full Cyl Sales' },
  { key: 'emptyCylSales', label: 'Empty Cyl Sales' },
  { key: 'toolSales', label: 'Tool Sales' },
  { key: 'gasSales', label: 'Gas Sales' },
  { key: 'depositCylinder', label: 'Deposit Cylinder' },
  { key: 'returnCylinder', label: 'Return Cylinder' },
  { key: 'transferGas', label: 'Transferred Gas' },
  { key: 'transferCylinders', label: 'Transferred Cylinders' },
  { key: 'transferTools', label: 'Transferred Tools' },
  { key: 'receivedGas', label: 'Received Gas' },
  { key: 'receivedCylinders', label: 'Received Cylinders' },
  { key: 'receivedTools', label: 'Received Tools' }
];
const closingCols = ['Full', 'Empty', 'Tool'];

const A4_LANDSCAPE = { width: 297, height: 210 };
const PRINT_MARGIN_MM = 8;
const PDF_MARGIN_MM = 8;
const PDF_CONTENT_WIDTH_MM = A4_LANDSCAPE.width - PDF_MARGIN_MM * 2;
const MM_TO_PX = 96 / 25.4;
const formatStockCell = (value) => ((parseInt(value, 10) || 0) === 0 ? '-' : value);
const rowValueKeys = [
  'openingFull',
  'openingEmpty',
  'openingTool',
  'emptyPur',
  'toolPur',
  'fullPur',
  'refilled',
  'fullCylSales',
  'emptyCylSales',
  'toolSales',
  'gasSales',
  'depositCylinder',
  'returnCylinder',
  'transferGas',
  'transferCylinders',
  'transferTools',
  'receivedGas',
  'receivedCylinders',
  'receivedTools',
  'closingFull',
  'closingEmpty',
  'closingTool'
];
const hasAnyValue = (row) => rowValueKeys.some((key) => (parseInt(row?.[key], 10) || 0) !== 0);
const isCylinderProduct = (productName = '') => String(productName).toLowerCase().includes('cylinder');
const sortDailyStockRows = (reportRows = []) => (
  reportRows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const aIsCylinder = isCylinderProduct(a.row?.productName);
      const bIsCylinder = isCylinderProduct(b.row?.productName);

      if (aIsCylinder === bIsCylinder) {
        return a.index - b.index;
      }

      return aIsCylinder ? -1 : 1;
    })
    .map(({ row }) => row)
);

const DailyStockReport = () => {
  const { user, isEmployee } = useAuth();
  const [employeeId, setEmployeeId] = useState('');
  const [employees, setEmployees] = useState([]);
  const [reportDate, setReportDate] = useState(getUaeDateKey());
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);

  useEffect(() => {
    if (isEmployee) {
      setEmployeeId(user?.id || '');
      return;
    }
    setEmployeeId((prev) => prev || '');
    fetchEmployees();
  }, [isEmployee, user?.id, user?.role]);

  useEffect(() => {
    const handleBeforePrint = () => {
      const element = document.getElementById('daily-stock-report-print');
      const title = document.getElementById('daily-stock-report-print-title');
      if (!element) return;
      const prevTitleDisplay = title ? title.style.display : '';
      if (title) title.style.display = 'block';
      const contentWidthPx = (A4_LANDSCAPE.width - PRINT_MARGIN_MM * 2) * MM_TO_PX;
      const contentHeightPx = (A4_LANDSCAPE.height - PRINT_MARGIN_MM * 2) * MM_TO_PX;
      const width = element.scrollWidth || element.getBoundingClientRect().width;
      const height = element.scrollHeight || element.getBoundingClientRect().height;
      if (!width || !height) {
        if (title) title.style.display = prevTitleDisplay;
        return;
      }
      const scale = Math.min(1, contentWidthPx / width, contentHeightPx / height);
      element.style.setProperty('--daily-stock-print-scale', String(scale));
      if (title) title.style.display = prevTitleDisplay;
    };

    const handleAfterPrint = () => {
      const element = document.getElementById('daily-stock-report-print');
      if (!element) return;
      element.style.removeProperty('--daily-stock-print-scale');
    };

    window.addEventListener('beforeprint', handleBeforePrint);
    window.addEventListener('afterprint', handleAfterPrint);
    return () => {
      window.removeEventListener('beforeprint', handleBeforePrint);
      window.removeEventListener('afterprint', handleAfterPrint);
    };
  }, []);

  const fetchEmployees = async () => {
    try {
      const res = await api.get('/users');
      const list = (res.data.data || []).filter((entry) => entry?.role === 'employee');
      setEmployees(list);
    } catch (e) {
      // ignore
    }
  };

  const fetchData = useCallback(async ({ silent = false, skipLoading = false } = {}) => {
    if (!skipLoading) {
      setLoading(true);
    }
    try {
      const params = {
        startDate: reportDate || undefined,
        _ts: Date.now()
      };
      if (!isEmployee && employeeId) {
        params.employeeId = employeeId;
      }

      const res = await api.get('/reports/daily-stock', {
        params
      });
      const data = sortDailyStockRows(
        (res.data.data || [])
          .filter((r) => r.productName && hasAnyValue(r))
          .map(r => ({
            productName: r.productName,
            openingFull: r.openingFull || 0,
            openingEmpty: r.openingEmpty || 0,
            openingTool: r.openingTool || 0,
            emptyPur: r.emptyPur || 0,
            toolPur: r.toolPur || 0,
            fullPur: r.fullPur || 0,
            refilled: r.refilled || 0,
            fullCylSales: r.fullCylSales || 0,
            emptyCylSales: r.emptyCylSales || 0,
            toolSales: r.toolSales || 0,
            gasSales: r.gasSales || 0,
            depositCylinder: r.depositCylinder || 0,
            returnCylinder: r.returnCylinder || 0,
            transferGas: r.transferGas || 0,
            transferCylinders: r.transferCylinders || 0,
            transferTools: r.transferTools || 0,
            receivedGas: r.receivedGas || 0,
            receivedCylinders: r.receivedCylinders || 0,
            receivedTools: r.receivedTools || 0,
            closingFull: r.closingFull || 0,
            closingEmpty: r.closingEmpty || 0,
            closingTool: r.closingTool || 0
          }))
      );
      setRows(data);
      return data;
    } catch (e) {
      if (!silent) {
        toast.error('Failed to load report');
      }
    } finally {
      if (!skipLoading) {
        setLoading(false);
      }
    }
    return null;
  }, [employeeId, isEmployee, reportDate]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const refreshInterval = setInterval(() => {
      fetchData({ silent: true, skipLoading: true });
    }, 10000);

    const onFocus = () => {
      fetchData({ silent: true, skipLoading: true });
    };

    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(refreshInterval);
      window.removeEventListener('focus', onFocus);
    };
  }, [fetchData]);

  const renderStockTable = ({ compact = false } = {}) => {
    const headCell = compact
      ? 'px-1 py-1 text-left border-r border-slate-200 break-words leading-tight'
      : 'px-2 py-1.5 sm:px-3 sm:py-2 text-left border-r border-slate-200 whitespace-nowrap text-[11px] sm:text-xs text-slate-700';
    const bodyCell = compact
      ? 'px-1 py-1 border-r border-slate-100 text-[8px] break-words'
      : 'px-2 py-1.5 sm:px-3 sm:py-2 border-r border-slate-100 text-[11px] sm:text-sm text-slate-700';
    const productCell = compact
      ? `${bodyCell} font-medium`
      : `${bodyCell} font-medium whitespace-nowrap`;
    const productHeadCell = compact
      ? headCell
      : `${headCell} whitespace-nowrap`;
    const headerRow = compact ? 'bg-slate-100' : 'bg-slate-100 sticky top-0';
    const tableClass = compact ? 'w-full table-fixed border-collapse text-[8px]' : 'min-w-[1180px] table-auto border-collapse';

    return (
      <table className={tableClass}>
        <thead className={headerRow}>
          <tr>
            <th className={productHeadCell} rowSpan={2}>Product</th>
            <th className={headCell.replace('text-left', 'text-center')} colSpan={openingCols.length}>Opening</th>
            <th className={headCell.replace('text-left', 'text-center')} colSpan={duringCols.length}>During the Day</th>
            <th className={headCell.replace('text-left', 'text-center')} colSpan={closingCols.length}>Closing</th>
          </tr>
          <tr>
            {openingCols.map(c => (
              <th key={`open-${c}`} className={headCell}>{c}</th>
            ))}
            {duringCols.map(col => (
              <th key={col.key} className={headCell}>{col.label}</th>
            ))}
            {closingCols.map(c => (
              <th key={`close-${c}`} className={headCell}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={2 + openingCols.length + duringCols.length + closingCols.length} className="p-4 text-center text-slate-500">Loading...</td>
            </tr>
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={2 + openingCols.length + duringCols.length + closingCols.length} className="p-4 sm:p-6 text-center text-slate-500">No data for selected filters</td>
            </tr>
          ) : (
            rows.map((r, idx) => (
              <tr key={idx} className="hover:bg-slate-50">
                <td className={productCell} title={r.productName}>{r.productName}</td>
                <td className={bodyCell}>{formatStockCell(r.openingFull)}</td>
                <td className={bodyCell}>{formatStockCell(r.openingEmpty)}</td>
                <td className={bodyCell}>{formatStockCell(r.openingTool)}</td>
                {duringCols.map(col => (
                  <td key={col.key} className={bodyCell}>{formatStockCell(r[col.key])}</td>
                ))}
                <td className={bodyCell}>{formatStockCell(r.closingFull)}</td>
                <td className={bodyCell}>{formatStockCell(r.closingEmpty)}</td>
                <td className={bodyCell}>{formatStockCell(r.closingTool)}</td>
              </tr>
            ))
          )}
        </tbody>
        <tfoot className="bg-slate-100 font-semibold">
          <tr>
            <td className={bodyCell}>Totals</td>
            <td className={bodyCell}>{rows.reduce((s, r) => s + (parseInt(r.openingFull) || 0), 0)}</td>
            <td className={bodyCell}>{rows.reduce((s, r) => s + (parseInt(r.openingEmpty) || 0), 0)}</td>
            <td className={bodyCell}>{rows.reduce((s, r) => s + (parseInt(r.openingTool) || 0), 0)}</td>
            {duringCols.map(col => (
              <td key={`tot-${col.key}`} className={bodyCell}>{rows.reduce((s, r) => s + (parseInt(r[col.key]) || 0), 0)}</td>
            ))}
            <td className={bodyCell}>{rows.reduce((s, r) => s + (parseInt(r.closingFull) || 0), 0)}</td>
            <td className={bodyCell}>{rows.reduce((s, r) => s + (parseInt(r.closingEmpty) || 0), 0)}</td>
            <td className={bodyCell}>{rows.reduce((s, r) => s + (parseInt(r.closingTool) || 0), 0)}</td>
          </tr>
        </tfoot>
      </table>
    );
  };

  const selectedEmployee = !isEmployee ? employees.find((entry) => entry.id === employeeId) : null;
  const reportTitle = isEmployee
    ? `${user?.fullName || 'Employee'} Daily Stock Report`
    : selectedEmployee
      ? `${selectedEmployee.fullName || 'Employee'} Daily Stock Report`
      : 'Daily Stock Report';
  const reportSubtitle = isEmployee
    ? 'Your accepted stock and your daily stock activity for the selected day.'
    : selectedEmployee
      ? 'Selected employee stock activity for the chosen day.'
      : 'Business-level stock movement snapshot for the selected day.';

  const handleExportPDF = async () => {
    try {
      setPdfLoading(true);
      await runPdfDownload(async () => {
        const latestRows = await fetchData({ silent: true, skipLoading: true });
        const dataRows = latestRows || rows;

        if (!dataRows || dataRows.length === 0) {
          throw new Error('No data to download');
        }

        await new Promise((resolve) => setTimeout(resolve, 200));
        const element = document.getElementById('daily-stock-report-pdf');
        await captureElementToPdf({
          element,
          filename: `daily_stock_report_${reportDate}.pdf`,
          orientation: 'l',
          widthOverride: `${PDF_CONTENT_WIDTH_MM}mm`,
          marginMm: PDF_MARGIN_MM,
          fitToPage: true,
          singlePage: true,
          allowScaleUp: true,
          fitAlign: 'top'
        });
      });
    } finally {
      setPdfLoading(false);
    }
  };

  return (
    <div className="space-y-3 sm:space-y-5">
      <style>{`
        @media print {
          @page { size: A4 landscape; margin: ${PRINT_MARGIN_MM}mm; }
          body * { visibility: hidden; }
          #daily-stock-report-print,
          #daily-stock-report-print * {
            visibility: visible;
          }
          #daily-stock-report-print {
            position: absolute;
            left: 0;
            top: 0;
            overflow: visible !important;
            transform: scale(var(--daily-stock-print-scale, 1));
            transform-origin: top left;
          }
          #daily-stock-report-print-title {
            display: block !important;
            text-align: center;
            font-size: 16px;
            font-weight: 600;
            letter-spacing: 0.6px;
            color: #111827;
            margin-bottom: 6px;
          }
          #daily-stock-report-table table {
            font-size: 9px;
          }
          #daily-stock-report-table th,
          #daily-stock-report-table td {
            padding: 2px 4px !important;
          }
        }
      `}</style>
      <div className="rounded-xl border border-slate-200 bg-gradient-to-r from-white via-slate-50 to-cyan-50 px-4 py-3 shadow-sm sm:rounded-2xl sm:px-5 sm:py-4">
        <div className="flex flex-col gap-2 sm:gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">Daily Stock Report</h1>
            <p className="mt-1 text-xs leading-snug text-slate-600 sm:text-sm">{reportSubtitle}</p>
            <div className="mt-2 flex flex-wrap gap-1.5 sm:mt-3 sm:gap-2">
              <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-[11px] font-medium text-blue-700 sm:px-3 sm:py-1 sm:text-xs">
                {isEmployee || selectedEmployee ? 'Employee Activity' : 'Live Operations'}
              </span>
              <span className="rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-[11px] font-medium text-slate-600 sm:px-3 sm:py-1 sm:text-xs">
                Active Products: {rows.length}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleExportPDF}
              disabled={pdfLoading || loading || rows.length === 0}
              className="w-full sm:w-auto rounded-lg bg-blue-600 px-3.5 py-2 text-sm text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-400 flex items-center justify-center gap-2"
            >
              <ArrowDownTrayIcon className="h-4 w-4" />
              {pdfLoading ? 'Generating...' : 'Download PDF'}
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-md shadow-slate-200/60 sm:p-4">
        <div className="mb-3 grid grid-cols-[1.35fr_1fr] gap-3 sm:mb-4 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
          {!isEmployee && (
            <div className="min-w-0">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Employee View</label>
              <div className="relative mt-1">
                <UserCircleIcon className="pointer-events-none absolute left-3 top-1/2 hidden h-5 w-5 -translate-y-1/2 text-slate-400 sm:block" />
                <select
                  value={employeeId}
                  onChange={(e) => setEmployeeId(e.target.value)}
                  className="block w-full rounded-lg border border-slate-300 bg-white py-1.5 pl-2.5 pr-6 text-left text-[11px] leading-tight text-slate-800 outline-none ring-blue-200 transition focus:ring-2 [text-align-last:left] sm:py-2.5 sm:pl-10 sm:pr-3 sm:text-sm"
                >
                  <option value="">All Operations</option>
                  {employees.map(emp => {
                    const optionLabel = emp.fullName || 'Employee';
                    return (
                      <option key={emp.id} value={emp.id}>{optionLabel}</option>
                    );
                  })}
                </select>
              </div>
            </div>
          )}

          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Report Date</label>
            <div className="relative mt-1">
              <CalendarDaysIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 sm:h-5 sm:w-5" />
              <input
                type="date"
                value={reportDate}
                onChange={(e) => setReportDate(e.target.value)}
                className="block w-full rounded-lg border border-slate-300 bg-white py-1.5 pl-8 pr-3 text-xs leading-tight text-slate-800 outline-none ring-blue-200 transition focus:ring-2 sm:py-2.5 sm:pl-10 sm:text-sm"
              />
            </div>
          </div>

          <div className="hidden items-end sm:flex">
            <div className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-[11px] text-slate-600 sm:px-3 sm:text-xs">
              <div className="font-semibold text-slate-700">Auto Refresh</div>
              <div>Data updates every 10 seconds.</div>
            </div>
          </div>
        </div>

        <div id="daily-stock-report-print">
          <div id="daily-stock-report-print-title" className="hidden">
            {reportTitle}
          </div>
          <div id="daily-stock-report-table" className="overflow-auto rounded-lg border border-slate-200 bg-white sm:rounded-xl">
            {renderStockTable({ compact: false })}
          </div>
        </div>
      </div>

      <div id="daily-stock-report-pdf" style={{ display: 'none' }}>
        <div
          style={{
            width: `${PDF_CONTENT_WIDTH_MM}mm`,
            padding: 0,
            backgroundColor: '#ffffff',
            fontFamily: 'Arial, sans-serif',
            display: 'flex',
            flexDirection: 'column'
          }}
        >
          <div style={{ textAlign: 'center', marginBottom: '4mm' }}>
            <div style={{ fontSize: '16px', fontWeight: 600, letterSpacing: '0.6px', color: '#111827' }}>
              {reportTitle}
            </div>
            <div style={{ fontSize: '10px', color: '#6b7280', marginTop: '1mm' }}>
              Report Date: {reportDate}
            </div>
          </div>
          <div style={{ flex: 1, display: 'flex' }}>
            <div style={{ width: '100%' }}>
              {renderStockTable({ compact: true })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DailyStockReport;
