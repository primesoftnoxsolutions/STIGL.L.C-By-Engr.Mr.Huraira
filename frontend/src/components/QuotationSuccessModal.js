import React from 'react';
import { XMarkIcon, PrinterIcon, ArrowDownTrayIcon, CheckCircleIcon } from '@heroicons/react/24/outline';
import { formatCurrency } from '../utils/currency';
import api from '../utils/api';
import { captureHtmlToPdf, runPdfDownload } from '../utils/pdfDownload';
import { buildPrintHtml } from '../utils/printUtils';

import { getQuotationCustomerDisplay } from '../utils/quotationCustomer';

const renderCustomerDetailRows = (customer) => {
  if (customer?.isWalkIn) {
    return `
      <div class="detail-row">
        <span class="detail-label">Customer:</span>
        <span class="detail-value">${customer.name || 'N/A'}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">TR Number:</span>
        <span class="detail-value">${customer.trNumber || 'N/A'}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Customer Type:</span>
        <span class="detail-value">Walk-in Customer</span>
      </div>
    `;
  }

  return `
    <div class="detail-row">
      <span class="detail-label">Customer:</span>
      <span class="detail-value">${customer?.name || 'N/A'}</span>
    </div>
    <div class="detail-row">
      <span class="detail-label">Phone:</span>
      <span class="detail-value">${customer?.phone || 'N/A'}</span>
    </div>
    <div class="detail-row">
      <span class="detail-label">Email:</span>
      <span class="detail-value">${customer?.email || 'N/A'}</span>
    </div>
  `;
};

const QuotationSuccessModal = ({ quotation, customer, items, onClose }) => {
  const handlePrint = () => {
    if (!customer?.name || !items || items.length === 0) {
      alert('Missing quotation data');
      return;
    }

    const styles = `
      body { color: #333; }
      .header {
        text-align: center;
        border-bottom: 1px solid #cbd5e1;
        padding-bottom: 12px;
        margin-bottom: 16px;
      }
      .header h1 {
        margin: 0;
        color: #1e3a8a;
      }
      .details {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 16px;
        margin-bottom: 16px;
      }
      .detail-section {
        margin-bottom: 8px;
      }
      .detail-section h3 {
        color: #1e40af;
        margin-bottom: 6px;
        font-size: 11px;
      }
      .detail-row {
        display: flex;
        justify-content: space-between;
        margin-bottom: 5px;
        font-size: 10px;
      }
      .detail-label {
        font-weight: bold;
        color: #4b5563;
      }
      .detail-value {
        color: #333;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        table-layout: fixed;
        margin: 10px 0;
      }
      thead {
        background: #f3f4f6;
        border-bottom: 0.6px solid #cbd5e1;
      }
      th {
        padding: 5px 6px;
        text-align: left;
        font-size: 10px;
        font-weight: 600;
        color: #4b5563;
        text-transform: uppercase;
        border-bottom: 0.6px solid #e2e8f0;
      }
      td {
        padding: 4px 6px;
        border-bottom: 0.6px solid #e2e8f0;
        font-size: 10px;
        line-height: 1.15;
      }
      th:nth-child(1), td:nth-child(1) {
        width: 6%;
        text-align: center;
      }
      th:nth-child(2), td:nth-child(2) {
        width: 46%;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      th:nth-child(3), td:nth-child(3) {
        width: 10%;
      }
      th:nth-child(4), td:nth-child(4),
      th:nth-child(5), td:nth-child(5) {
        width: 19%;
        white-space: nowrap;
      }
      .note {
        background: #fef3c7;
        border-left: 2px solid #f59e0b;
        padding: 8px;
        margin-top: 12px;
        border-radius: 4px;
        font-size: 10px;
        color: #92400e;
        line-height: 1.4;
      }
      .footer {
        margin-top: 20px;
        padding-top: 10px;
        border-top: 0.6px solid #e5e7eb;
        text-align: center;
        font-size: 10px;
        color: #6b7280;
      }
    `;

    const body = `
      <div class="header">
        <h1>QUOTATION</h1>
        <p style="margin: 5px 0; color: #6b7280;">Quote #${quotation?.id || 'N/A'}</p>
      </div>

      <div class="details">
        <div class="detail-section">
          <h3>Customer Information</h3>
          ${renderCustomerDetailRows(customer)}
        </div>

        <div class="detail-section">
          <h3>Quotation Details</h3>
          <div class="detail-row">
            <span class="detail-label">Date:</span>
            <span class="detail-value">${new Date(quotation?.quotationDate).toLocaleDateString('en-GB')}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Valid Until:</span>
            <span class="detail-value">${new Date(quotation?.validUntil).toLocaleDateString('en-GB')}</span>
          </div>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Product Name</th>
            <th style="text-align: center;">Qty</th>
            <th style="text-align: right;">Unit Price (AED)</th>
            <th style="text-align: right;">Total (AED)</th>
          </tr>
        </thead>
        <tbody>
          ${items.map((item, idx) => {
            const itemTotal = parseFloat(item.unitPrice) * parseInt(item.quantity);
            return `
              <tr>
                <td>${idx + 1}</td>
                <td>${item.productName}</td>
                <td style="text-align: center;">${item.quantity}</td>
                <td style="text-align: right;">AED ${parseFloat(item.unitPrice).toFixed(2)}</td>
                <td style="text-align: right;">AED ${itemTotal.toFixed(2)}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>

      <div class="note">
        <strong>?????? Important Terms & Conditions:</strong><br>
        These rates are valid for 1 week only. After this period, please verify updated rates. Any damaged cylinder items are the responsibility of the customer.
      </div>

      <div class="footer">
        <p>Generated on ${new Date().toLocaleDateString('en-GB')} at ${new Date().toLocaleTimeString()}</p>
        <p>?? SYED TAYYAB INDUSTRIAL GASES LLC</p>
      </div>
    `;

    const htmlContent = buildPrintHtml({
      title: 'Quotation',
      body,
      extraStyles: styles
    });
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Please allow popups to print the quotation');
      return;
    }
    printWindow.document.write(htmlContent);
    printWindow.document.close();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 500);
  };

  const handleDownloadPDF = async () => {
    await runPdfDownload(async () => {
      if (!quotation?.id) {
        throw new Error('Quotation data is missing');
      }

      const res = await api.get(`/quotations/${quotation.id}`);
      const latestQuotation = res.data?.data;

      if (!latestQuotation || !latestQuotation.items || latestQuotation.items.length === 0) {
        throw new Error('No quotation data to download');
      }

      const downloadedQuotation = latestQuotation;
      const customerInfo = getQuotationCustomerDisplay(latestQuotation);
      const items = latestQuotation.items || [];

      const styles = `
        body { color: #333; }
        .header {
          text-align: center;
          border-bottom: 1px solid #cbd5e1;
          padding-bottom: 12px;
          margin-bottom: 16px;
        }
        .header h1 {
          margin: 0;
          color: #1e3a8a;
        }
        .details {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
          margin-bottom: 16px;
        }
        .detail-section {
          margin-bottom: 8px;
        }
        .detail-section h3 {
          color: #1e40af;
          margin-bottom: 6px;
          font-size: 11px;
        }
        .detail-row {
          display: flex;
          justify-content: space-between;
          margin-bottom: 5px;
          font-size: 10px;
        }
        .detail-label {
          font-weight: bold;
          color: #4b5563;
        }
        .detail-value {
          color: #333;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          table-layout: fixed;
          margin: 10px 0;
        }
        thead {
          background: #f3f4f6;
          border-bottom: 0.6px solid #cbd5e1;
        }
        th {
          padding: 5px 6px;
          text-align: left;
          font-size: 10px;
          font-weight: 600;
          color: #4b5563;
          text-transform: uppercase;
          border-bottom: 0.6px solid #e2e8f0;
        }
        td {
          padding: 4px 6px;
          border-bottom: 0.6px solid #e2e8f0;
          font-size: 10px;
          line-height: 1.15;
        }
        th:nth-child(1), td:nth-child(1) {
          width: 6%;
          text-align: center;
        }
        th:nth-child(2), td:nth-child(2) {
          width: 46%;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        th:nth-child(3), td:nth-child(3) {
          width: 10%;
        }
        th:nth-child(4), td:nth-child(4),
        th:nth-child(5), td:nth-child(5) {
          width: 19%;
          white-space: nowrap;
        }
        .note {
          background: #fef3c7;
          border-left: 2px solid #f59e0b;
          padding: 8px;
          margin-top: 12px;
          border-radius: 4px;
          font-size: 10px;
          color: #92400e;
          line-height: 1.4;
        }
        .footer {
          margin-top: 20px;
          padding-top: 10px;
          border-top: 0.6px solid #e5e7eb;
          text-align: center;
          font-size: 10px;
          color: #6b7280;
        }
      `;

      const body = `
        <div class="header">
          <h1>QUOTATION</h1>
          <p style="margin: 5px 0; color: #6b7280;">Quote #${downloadedQuotation?.id || 'N/A'}</p>
        </div>

        <div class="details">
          <div class="detail-section">
            <h3>Customer Information</h3>
            ${renderCustomerDetailRows(customerInfo)}
          </div>

          <div class="detail-section">
            <h3>Quotation Details</h3>
            <div class="detail-row">
              <span class="detail-label">Date:</span>
              <span class="detail-value">${new Date(downloadedQuotation?.quotationDate).toLocaleDateString('en-GB')}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Valid Until:</span>
              <span class="detail-value">${new Date(downloadedQuotation?.validUntil).toLocaleDateString('en-GB')}</span>
            </div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Product Name</th>
              <th style="text-align: center;">Qty</th>
              <th style="text-align: right;">Unit Price (AED)</th>
              <th style="text-align: right;">Total (AED)</th>
            </tr>
          </thead>
          <tbody>
            ${items.map((item, idx) => {
              const itemTotal = parseFloat(item.unitPrice) * parseInt(item.quantity);
              return `
                <tr>
                  <td>${idx + 1}</td>
                  <td>${item.productName}</td>
                  <td style="text-align: center;">${item.quantity}</td>
                  <td style="text-align: right;">AED ${parseFloat(item.unitPrice).toFixed(2)}</td>
                  <td style="text-align: right;">AED ${itemTotal.toFixed(2)}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>

        <div class="note">
          <strong>?????? Important Terms & Conditions:</strong><br>
          These rates are valid for 1 week only. After this period, please verify updated rates. Any damaged cylinder items are the responsibility of the customer.
        </div>

        <div class="footer">
          <p>Generated on ${new Date().toLocaleDateString('en-GB')} at ${new Date().toLocaleTimeString()}</p>
          <p>?? SYED TAYYAB INDUSTRIAL GASES LLC</p>
        </div>
      `;

      const htmlContent = buildPrintHtml({
        title: 'Quotation',
        body,
        extraStyles: styles
      });

      const filename = `Quotation_${customerInfo.name || 'quotation'}_${new Date().toISOString().split('T')[0]}.pdf`;

      await captureHtmlToPdf({
        html: htmlContent,
        filename,
        orientation: 'p',
        widthOverride: '210mm'
      });
    });
  };

  if (!quotation || !customer?.name) return null;

  const quotationDateLabel = quotation?.quotationDate
    ? new Date(quotation.quotationDate).toLocaleDateString('en-GB')
    : 'N/A';
  const validUntilLabel = quotation?.validUntil
    ? new Date(quotation.validUntil).toLocaleDateString('en-GB')
    : 'N/A';
  const totalAmount = (items || []).reduce((sum, item) => {
    const qty = Number(item?.quantity || 0);
    const unitPrice = parseFloat(item?.unitPrice || 0);
    return sum + (Number.isFinite(unitPrice) ? qty * unitPrice : 0);
  }, 0);

  return (
    <div className="fixed inset-0 z-[9999] overflow-y-auto bg-slate-950/65 backdrop-blur-sm">
      <div className="mx-auto flex min-h-screen w-full items-start justify-center px-2 py-3 sm:px-4 sm:py-5">
        <div className="w-full max-w-4xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
          <div className="bg-gradient-to-r from-blue-600 to-indigo-700 px-4 py-4 sm:px-6">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/90 shadow">
                  <CheckCircleIcon className="h-7 w-7 text-blue-600" />
                </div>
                <div className="min-w-0 text-white">
                  <h2 className="truncate text-xl font-bold sm:text-2xl">Quotation Created Successfully</h2>
                  <p className="truncate text-xs text-blue-100 sm:text-sm">{customer?.name || 'Customer'}</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="rounded-lg p-1.5 text-white transition hover:bg-white/10"
                aria-label="Close"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>
          </div>

          <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 sm:px-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-slate-600">Tip: Use Save as PDF in printer options for a file copy.</p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  onClick={handlePrint}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
                >
                  <PrinterIcon className="h-4 w-4" />
                  Print Quotation
                </button>
                <button
                  onClick={handleDownloadPDF}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
                >
                  <ArrowDownTrayIcon className="h-4 w-4" />
                  Download PDF
                </button>
              </div>
            </div>
          </div>

          <div className="max-h-[calc(95vh-185px)] overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
            <div className="rounded-xl border border-slate-200 bg-white">
              <div className="border-b border-slate-200 px-4 py-3 sm:px-5">
                <h3 className="text-base font-semibold text-slate-900 sm:text-lg">Quotation Summary</h3>
              </div>

              <div className="grid gap-4 p-4 sm:grid-cols-2 sm:gap-5 sm:p-5">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-blue-700">Customer Info</h4>
                  <div className="space-y-1.5 text-sm text-slate-700">
                    <p><span className="font-semibold text-slate-900">Name:</span> {customer?.name || 'N/A'}</p>
                    {customer?.isWalkIn ? (
                      <>
                        <p><span className="font-semibold text-slate-900">TR Number:</span> {customer?.trNumber || 'N/A'}</p>
                        <p><span className="font-semibold text-slate-900">Type:</span> Walk-in Customer</p>
                      </>
                    ) : (
                      <>
                        <p><span className="font-semibold text-slate-900">Phone:</span> {customer?.phone || 'N/A'}</p>
                        <p><span className="font-semibold text-slate-900">Email:</span> {customer?.email || 'N/A'}</p>
                      </>
                    )}
                  </div>
                </div>

                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-blue-700">Quote Details</h4>
                  <div className="space-y-1.5 text-sm text-slate-700">
                    <p><span className="font-semibold text-slate-900">Date:</span> {quotationDateLabel}</p>
                    <p><span className="font-semibold text-slate-900">Valid Until:</span> {validUntilLabel}</p>
                    <p><span className="font-semibold text-slate-900">Items:</span> {items?.length || 0}</p>
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-200 px-4 py-4 sm:px-5">
                <h4 className="mb-3 text-sm font-semibold text-slate-900">Items</h4>
                <div className="space-y-2">
                  {(items || []).map((item, idx) => {
                    const qty = Number(item?.quantity || 0);
                    const unitPrice = parseFloat(item?.unitPrice || 0);
                    const itemTotal = Number.isFinite(unitPrice) ? qty * unitPrice : 0;
                    return (
                      <div key={idx} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3 text-sm">
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-slate-800">{item?.productName || 'Product'}</p>
                          <p className="text-xs text-slate-500">Qty: {qty}</p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="font-semibold text-slate-900">{formatCurrency(itemTotal)}</p>
                          <p className="text-xs text-slate-500">@ {formatCurrency(unitPrice)}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-4 flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5 text-sm">
                  <span className="font-semibold text-slate-700">Total Amount</span>
                  <span className="text-base font-bold text-blue-700">{formatCurrency(totalAmount)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default QuotationSuccessModal;

