import React, { useEffect, useState, useRef } from 'react';
import api from '../utils/api';
import toast from 'react-hot-toast';
import { XMarkIcon, PrinterIcon, ArrowDownTrayIcon } from '@heroicons/react/24/outline';
import { formatCurrency } from '../utils/currency';
import {
  captureElementToPdfBlob,
  printElementAsPdf,
  runPdfDownload,
  saveBlobAsFile
} from '../utils/pdfDownload';
import { useAuth } from '../context/AuthContext';
import PdfShareDialog from './PdfShareDialog';

const InvoiceView = ({ invoiceId, onClose, autoDownload = false, onAutoDownloadComplete }) => {
  const { user } = useAuth();
  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pdfInvoice, setPdfInvoice] = useState(null);
  const [sharePrompt, setSharePrompt] = useState(null);
  const pdfRef = useRef(null);
  const autoDownloadRef = useRef(false);

  useEffect(() => {
    fetchInvoice();
    autoDownloadRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoiceId]);

  const fetchInvoice = async () => {
    try {
      const response = await api.get(`/sales-invoices/${invoiceId}`);
      setInvoice(response.data.data);
    } catch (error) {
      toast.error('Failed to fetch invoice');
      onClose();
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = async () => {
    await runPdfDownload(async () => {
      await loadLatestInvoiceForPdf();
      const element = pdfRef.current || document.getElementById('invoice-print-content');
      await printElementAsPdf({
        element,
        orientation: 'p'
      });
    }, {
      loadingMessage: 'Preparing print...'
    });
  };

  const loadLatestInvoiceForPdf = async () => {
    const response = await api.get(`/sales-invoices/${invoiceId}`);
    const latestInvoice = response.data?.data;

    if (!latestInvoice || !latestInvoice.items || latestInvoice.items.length === 0) {
      throw new Error('No invoice data available');
    }

    setPdfInvoice(latestInvoice);
    await new Promise((resolve) => setTimeout(resolve, 200));

    return latestInvoice;
  };

  const handleDownloadPDF = async () => {
    await runPdfDownload(async () => {
      const latestInvoice = await loadLatestInvoiceForPdf();
      const element = pdfRef.current || document.getElementById('invoice-print-content');
      const filename = `invoice_${latestInvoice.invoiceNumber}.pdf`;
      const blob = await captureElementToPdfBlob({
        element,
        orientation: 'p'
      });
      const file = typeof File !== 'undefined'
        ? new File([blob], filename, { type: 'application/pdf' })
        : null;

      saveBlobAsFile(blob, filename);
      setSharePrompt({
        latestInvoice,
        filename,
        file,
        title: `Invoice ${latestInvoice.invoiceNumber}`,
        text: `Invoice ${latestInvoice.invoiceNumber} for ${latestInvoice.customer?.name || 'Customer'}`,
        whatsappMessage: `Invoice ${latestInvoice.invoiceNumber} for ${latestInvoice.customer?.name || 'Customer'} is ready. The PDF has already been downloaded as ${filename}. Please attach it from your device.`,
        emailSubject: `Invoice ${latestInvoice.invoiceNumber}`,
        emailBody: `Invoice ${latestInvoice.invoiceNumber} for ${latestInvoice.customer?.name || 'Customer'} is ready.\n\nThe PDF has already been downloaded as ${filename}. Please attach that file to this email before sending.`
      });
    });
  };

  useEffect(() => {
    if (!autoDownload || !invoice || autoDownloadRef.current) return;
    autoDownloadRef.current = true;
    handleDownloadPDF()
      .finally(() => {
        if (onAutoDownloadComplete) onAutoDownloadComplete();
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoDownload, invoice]);

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
      </div>
    );
  }

  if (!invoice) {
    return null;
  }

  return (
    <>
      <div className="fixed inset-0 z-50 overflow-y-auto overflow-x-hidden">
        <div className="flex items-start sm:items-center justify-center min-h-screen px-2 sm:px-4 py-2 sm:py-4">
          <div className="fixed inset-0 bg-gray-900 bg-opacity-75" onClick={onClose}></div>
          
          <div className="relative bg-white rounded-lg max-w-4xl w-full shadow-2xl flex flex-col max-h-[98vh] sm:max-h-[95vh] overflow-hidden">
            {/* Header */}
            <div className="flex items-start sm:items-center justify-between p-3 sm:p-4 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-purple-50 gap-3">
              <h2 className="text-base sm:text-xl font-bold text-gray-900 break-all">Invoice #{invoice.invoiceNumber}</h2>
              <button
                onClick={onClose}
                className="p-2 text-gray-400 hover:text-gray-600 transition-colors shrink-0"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>

            {/* Invoice Content - Scrollable */}
            <div className="hide-scrollbar flex-1 overflow-y-auto overflow-x-auto p-2 sm:p-6">
              <div id="invoice-print-content">
                <InvoicePrintContent invoice={invoice} user={user} />
              </div>
            </div>

            <div ref={pdfRef} style={{ display: 'none' }}>
              <InvoicePrintContent invoice={pdfInvoice || invoice} user={user} />
            </div>

            {/* Action Buttons at Bottom */}
            <div className="flex items-center gap-2 flex-wrap justify-center p-3 sm:p-4 border-t border-gray-200 bg-gradient-to-r from-blue-50 to-purple-50">
              <button
                onClick={handlePrint}
                className="flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors"
              >
                <PrinterIcon className="h-5 w-5 mr-2" />
                Print Invoice
              </button>
              <button
                onClick={handleDownloadPDF}
                className="flex items-center px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 transition-colors"
              >
                <ArrowDownTrayIcon className="h-5 w-5 mr-2" />
                Download PDF
              </button>
            </div>
          </div>
        </div>
      </div>
      <PdfShareDialog shareData={sharePrompt} onClose={() => setSharePrompt(null)} />
    </>
  );
};

// Clean invoice template for printing - NO UI elements
const InvoicePrintContent = ({ invoice, user }) => {
  const subtotal = parseFloat(invoice.subtotal) || 0;
  const deliveryCharges = parseFloat(invoice.deliveryCharges) || 0;
  const tax = parseFloat(invoice.tax) || 0;
  const total = parseFloat(invoice.total) || 0;
  const isSystemAdmin = user && ['manager', 'super_admin'].includes(user.role);
  const adminSignature = isSystemAdmin ? user?.signature : null;
  const adminName = isSystemAdmin ? (user?.fullName || user?.username || invoice.authorizedByName || 'System Administrator') : null;
  const authorizedSignature = adminSignature || invoice.authorizedBySignature || null;
  const authorizedName = adminName || invoice.authorizedByName || 'N/A';
  const receivedSignature = invoice.receivedBySignature || null;
  const receivedName = invoice.receivedByName || 'N/A';

  const renderSignatureBlock = (label, name, signature) => (
    <div style={{ textAlign: 'center' }}>
      <div style={{ marginBottom: '16px' }}>
        {signature ? (
          <div style={{
            padding: '8px',
            height: '120px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'transparent'
          }}>
            <img
              src={signature}
              alt={`${label} Signature`}
              style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain' }}
            />
          </div>
        ) : (
          <div style={{
            height: '120px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'transparent'
          }}>
            <p style={{ fontSize: '14px', color: '#9ca3af' }}>No Signature</p>
          </div>
        )}
      </div>
      <div style={{ borderTop: '2px solid #1f2937', paddingTop: '8px' }}>
        <p style={{ fontWeight: '600', color: '#111827', fontSize: '14px' }}>{label}</p>
        <p style={{ fontSize: '12px', color: '#6b7280' }}>{name || 'N/A'}</p>
      </div>
    </div>
  );

  return (
    <div className="invoice-print-content" style={{ 
      backgroundColor: 'white',
      padding: 'clamp(14px, 3.5vw, 40px)',
      fontFamily: 'Arial, sans-serif',
      color: '#000',
      width: '100%',
      maxWidth: '100%',
      boxSizing: 'border-box'
    }}>
      {/* Company Header */}
      <div style={{ 
        textAlign: 'center', 
        borderBottom: '4px solid #2563eb',
        paddingBottom: '24px',
        marginBottom: '32px'
      }}>
        <h1 style={{ 
          fontSize: 'clamp(20px, 4.8vw, 32px)',
          fontWeight: 'bold',
          color: '#1e3a8a',
          marginBottom: '8px'
        }}>
          SYED TAYYAB INDUSTRIAL GASES LLC
        </h1>
        <p style={{ fontSize: '14px', color: '#4b5563' }}>Industrial Gas Supplier</p>
        <p style={{ fontSize: '14px', color: '#4b5563' }}>United Arab Emirates</p>
      </div>

      {/* Invoice Info Grid */}
      <div className="invoice-info-grid" style={{ 
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
        gap: '32px',
        marginBottom: '32px'
      }}>
        {/* Left Column - Bill To */}
        <div>
          <h3 style={{ 
            fontSize: '12px',
            fontWeight: '600',
            color: '#6b7280',
            textTransform: 'uppercase',
            marginBottom: '8px'
          }}>Bill To:</h3>
          <div style={{ color: '#111827' }}>
            <p style={{ fontWeight: 'bold', fontSize: '18px', marginBottom: '4px' }}>
              {invoice.customer?.name || 'N/A'}
            </p>
            {invoice.customer?.phone && (
              <p style={{ fontSize: '14px', marginBottom: '2px' }}>Ph: {invoice.customer.phone}</p>
            )}
            {invoice.customer?.email && (
              <p style={{ fontSize: '14px', marginBottom: '2px' }}>Email: {invoice.customer.email}</p>
            )}
            {invoice.customer?.address && (
              <p style={{ fontSize: '14px', marginTop: '4px' }}>{invoice.customer.address}</p>
            )}
          </div>
        </div>

        {/* Right Column - Invoice Details */}
        <div className="invoice-right" style={{ textAlign: 'right' }}>
          <div style={{ marginBottom: '16px' }}>
            <p style={{ fontSize: '12px', color: '#6b7280' }}>Invoice Number</p>
            <p style={{ fontSize: '20px', fontWeight: 'bold', color: '#111827' }}>
              {invoice.invoiceNumber}
            </p>
          </div>
          <div style={{ fontSize: '14px' }}>
            <div style={{ marginBottom: '8px' }}>
              <span style={{ color: '#6b7280' }}>Invoice Date: </span>
              <span style={{ fontWeight: '600', color: '#111827' }}>
                {new Date(invoice.invoiceDate).toLocaleDateString('en-GB')}
              </span>
            </div>
            <div style={{ marginBottom: '8px' }}>
              <span style={{ color: '#6b7280' }}>Payment Method: </span>
              <span style={{ fontWeight: '600', color: '#111827', textTransform: 'uppercase' }}>
                {invoice.paymentMethod || 'N/A'}
              </span>
            </div>
            <div>
              <span style={{ color: '#6b7280' }}>Payment Status: </span>
              <span style={{ fontWeight: '600', color: '#111827', textTransform: 'uppercase' }}>
                {invoice.paymentStatus || 'N/A'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Invoice Items Table */}
      <div style={{ marginBottom: '32px' }}>
        <table className="invoice-items-table" style={{ 
          width: '100%',
          borderCollapse: 'collapse',
          border: '1px solid #d1d5db',
          tableLayout: 'fixed'
        }}>
          <thead>
            <tr style={{ backgroundColor: '#1e3a8a', color: 'white' }}>
              <th style={{ 
                border: '1px solid #d1d5db',
                padding: '12px',
                textAlign: 'left',
                fontSize: '14px'
              }}>#</th>
              <th style={{ 
                border: '1px solid #d1d5db',
                padding: '12px',
                textAlign: 'left',
                fontSize: '14px'
              }}>Product/Service</th>
              <th style={{ 
                border: '1px solid #d1d5db',
                padding: '12px',
                textAlign: 'center',
                fontSize: '14px'
              }}>Type</th>
              <th style={{ 
                border: '1px solid #d1d5db',
                padding: '12px',
                textAlign: 'center',
                fontSize: '14px'
              }}>Qty</th>
              <th style={{ 
                border: '1px solid #d1d5db',
                padding: '12px',
                textAlign: 'right',
                fontSize: '14px'
              }}>Unit Price</th>
              <th style={{ 
                border: '1px solid #d1d5db',
                padding: '12px',
                textAlign: 'right',
                fontSize: '14px'
              }}>VAT (5%)</th>
              <th style={{ 
                border: '1px solid #d1d5db',
                padding: '12px',
                textAlign: 'right',
                fontSize: '14px'
              }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {invoice.items?.map((item, index) => (
              <tr key={item.id}>
                <td style={{ 
                  border: '1px solid #d1d5db',
                  padding: '12px',
                  fontSize: '14px'
                }}>{index + 1}</td>
                <td style={{ 
                  border: '1px solid #d1d5db',
                  padding: '12px',
                  fontSize: '14px',
                  fontWeight: '500'
                }}>{item.productName}</td>
                <td style={{ 
                  border: '1px solid #d1d5db',
                  padding: '12px',
                  fontSize: '14px',
                  textAlign: 'center'
                }}>{item.saleType || '-'}</td>
                <td style={{ 
                  border: '1px solid #d1d5db',
                  padding: '12px',
                  fontSize: '14px',
                  textAlign: 'center'
                }}>{item.quantity}</td>
                <td style={{ 
                  border: '1px solid #d1d5db',
                  padding: '12px',
                  fontSize: '14px',
                  textAlign: 'right'
                }}>{formatCurrency(item.unitPrice)}</td>
                <td style={{ 
                  border: '1px solid #d1d5db',
                  padding: '12px',
                  fontSize: '14px',
                  textAlign: 'right'
                }}>{formatCurrency((parseFloat(item.unitPrice) || 0) * 0.05)}</td>
                <td style={{ 
                  border: '1px solid #d1d5db',
                  padding: '12px',
                  fontSize: '14px',
                  textAlign: 'right',
                  fontWeight: '600'
                }}>{formatCurrency(item.quantity * item.unitPrice)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Totals Section */}
      <div style={{ 
        display: 'flex',
        justifyContent: 'flex-end',
        marginBottom: '36px'
      }}>
        <div style={{ width: 'min(100%, 340px)' }}>
          <div style={{
            display: 'grid',
            gap: '6px'
          }}>
            <div style={{ 
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: '12px',
              paddingBottom: '6px',
              borderBottom: '0.8px dashed #dbe4f0'
            }}>
              <span style={{ color: '#374151' }}>Subtotal:</span>
              <span style={{ fontWeight: '600', color: '#111827' }}>{formatCurrency(subtotal)}</span>
            </div>
            {deliveryCharges > 0 && (
              <div style={{ 
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '12px',
                paddingBottom: '6px',
                borderBottom: '0.8px dashed #dbe4f0'
              }}>
                <span style={{ color: '#374151' }}>Delivery Charges:</span>
                <span style={{ fontWeight: '600', color: '#111827' }}>{formatCurrency(deliveryCharges)}</span>
              </div>
            )}
            <div style={{ 
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: '12px',
              paddingBottom: '6px',
              borderBottom: '0.8px dashed #dbe4f0'
            }}>
              <span style={{ color: '#374151' }}>VAT (5%):</span>
              <span style={{ fontWeight: '600', color: '#111827' }}>{formatCurrency(tax)}</span>
            </div>
            <div style={{ 
              display: 'flex',
              justifyContent: 'space-between',
              marginTop: '6px',
              paddingTop: '8px',
              borderTop: '2px solid #3b82f6'
            }}>
              <span style={{ color: '#1d4ed8', fontSize: '18px', fontWeight: 800 }}>Grand Total:</span>
              <span style={{ color: '#1d4ed8', fontSize: '18px', fontWeight: 800 }}>{formatCurrency(total)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Notes Section */}
      {invoice.notes && (
        <div style={{ 
          marginBottom: '32px',
          padding: '16px',
          backgroundColor: '#fef3c7',
          border: '1px solid #fbbf24',
          borderRadius: '8px'
        }}>
          <h4 style={{ 
            fontSize: '14px',
            fontWeight: '600',
            color: '#374151',
            marginBottom: '8px'
          }}>Notes:</h4>
          <p style={{ fontSize: '14px', color: '#374151', whiteSpace: 'pre-wrap' }}>
            {invoice.notes}
          </p>
        </div>
      )}

      {/* Signatures Section */}
      <div className="invoice-signatures" style={{ 
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '24px',
        marginTop: '48px',
        paddingTop: '32px',
        borderTop: '2px solid #e5e7eb'
      }}>
        {renderSignatureBlock('System Administrator', authorizedName, authorizedSignature)}
        {renderSignatureBlock('Received By', receivedName, receivedSignature)}
      </div>

      {/* Footer */}
      <div style={{ 
        marginTop: '48px',
        paddingTop: '24px',
        borderTop: '1px solid #d1d5db',
        textAlign: 'center',
        fontSize: '12px',
        color: '#6b7280'
      }}>
        <p style={{ marginBottom: '4px' }}>Thank you for your business!</p>
        <p>(c) 2026 SYED TAYYAB INDUSTRIAL GASES LLC. All rights reserved.</p>
      </div>
    </div>
  );
};

export default InvoiceView;
