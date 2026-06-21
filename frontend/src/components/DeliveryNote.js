import React from 'react';
import { buildPrintHtml } from '../utils/printUtils';

const DeliveryNote = ({ invoice, onClose }) => {
  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Please allow popups to print the delivery note');
      return;
    }

    const printContent = document.getElementById('delivery-note-content').innerHTML;
    const html = buildPrintHtml({
      title: `Delivery Note - ${invoice.invoiceNumber}`,
      body: printContent
    });
    printWindow.document.write(html);
    printWindow.document.close();
    
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 500);
  };

  if (!invoice) return null;

  // Calculate total items delivered
  const totalItemsDelivered = invoice.items?.reduce((sum, item) => sum + parseInt(item.quantity), 0) || 0;

  return (
    <div className="fixed inset-0 z-[9999] overflow-y-auto">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      
      {/* Modal */}
      <div className="flex items-center justify-center min-h-screen px-4 py-6">
        <div className="relative bg-white rounded-xl max-w-4xl w-full shadow-2xl">
          {/* Header */}
          <div className="bg-gradient-to-r from-orange-500 to-red-600 px-6 py-4 rounded-t-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-white">Delivery Note Preview</h2>
              <button
                onClick={onClose}
                className="text-white hover:text-orange-100 transition-colors text-2xl font-bold"
              >
                ×
              </button>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="px-6 py-4 bg-gradient-to-r from-orange-50 to-red-50 border-b border-gray-200">
            <div className="flex justify-center">
              <button
                onClick={handlePrint}
                className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-orange-600 to-red-700 text-white rounded-lg hover:from-orange-700 hover:to-red-800 transition-all shadow-lg font-semibold"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                </svg>
                Print Delivery Note
              </button>
            </div>
          </div>

          {/* Delivery Note Preview */}
          <div className="overflow-y-auto max-h-[calc(100vh-300px)] p-6">
            <div id="delivery-note-content">
              <DeliveryNoteContent invoice={invoice} totalItemsDelivered={totalItemsDelivered} />
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 bg-gray-50 rounded-b-xl border-t border-gray-200">
            <button
              onClick={onClose}
              className="w-full px-6 py-2 bg-white border-2 border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-all font-semibold"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// Clean delivery note template - NO PRICES
export const DeliveryNoteContent = ({ invoice, totalItemsDelivered }) => {
  return (
    <div className="delivery-note-print-content" style={{ 
      backgroundColor: 'white',
      padding: '40px',
      fontFamily: 'Arial, sans-serif',
      color: '#000'
    }}>
      {/* Company Header */}
      <div style={{ 
        textAlign: 'center', 
        borderBottom: '4px solid #ea580c',
        paddingBottom: '24px',
        marginBottom: '32px'
      }}>
        <h1 style={{ 
          fontSize: '32px',
          fontWeight: 'bold',
          color: '#9a3412',
          marginBottom: '8px'
        }}>
          SYED TAYYAB INDUSTRIAL GASES LLC
        </h1>
        <p style={{ fontSize: '14px', color: '#4b5563' }}>Industrial Gas Supplier</p>
        <p style={{ fontSize: '14px', color: '#4b5563' }}>United Arab Emirates</p>
        <div style={{
          marginTop: '16px',
          padding: '8px',
          backgroundColor: '#fed7aa',
          borderRadius: '8px',
          display: 'inline-block'
        }}>
          <h2 style={{ 
            fontSize: '24px',
            fontWeight: 'bold',
            color: '#9a3412'
          }}>
            DELIVERY NOTE
          </h2>
        </div>
      </div>

      {/* Delivery Info Grid */}
      <div style={{ 
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '32px',
        marginBottom: '32px'
      }}>
        {/* Left Column - Delivered To */}
        <div>
          <h3 style={{ 
            fontSize: '12px',
            fontWeight: '600',
            color: '#6b7280',
            textTransform: 'uppercase',
            marginBottom: '8px'
          }}>Delivered To:</h3>
          <div style={{ color: '#111827' }}>
            <p style={{ fontWeight: 'bold', fontSize: '18px', marginBottom: '4px' }}>
              {invoice.customer?.name || 'N/A'}
            </p>
            {invoice.customer?.phone && (
              <p style={{ fontSize: '14px', marginBottom: '2px' }}>Ph: {invoice.customer.phone}</p>
            )}
            {invoice.customer?.address && (
              <p style={{ fontSize: '14px', marginTop: '4px' }}>{invoice.customer.address}</p>
            )}
          </div>
        </div>

        {/* Right Column - Delivery Details */}
        <div style={{ textAlign: 'right' }}>
          <div style={{ marginBottom: '16px' }}>
            <p style={{ fontSize: '12px', color: '#6b7280' }}>Delivery Note Number</p>
            <p style={{ fontSize: '20px', fontWeight: 'bold', color: '#111827' }}>
              DN-{invoice.invoiceNumber}
            </p>
          </div>
          <div style={{ fontSize: '14px' }}>
            <div style={{ marginBottom: '8px' }}>
              <span style={{ color: '#6b7280' }}>Invoice Ref: </span>
              <span style={{ fontWeight: '600', color: '#111827' }}>
                {invoice.invoiceNumber}
              </span>
            </div>
            <div style={{ marginBottom: '8px' }}>
              <span style={{ color: '#6b7280' }}>Delivery Date: </span>
              <span style={{ fontWeight: '600', color: '#111827' }}>
                {new Date(invoice.invoiceDate).toLocaleDateString('en-GB')}
              </span>
            </div>
            <div>
              <span style={{ color: '#6b7280' }}>Delivered By: </span>
              <span style={{ fontWeight: '600', color: '#111827' }}>
                {invoice.employee?.fullName || 'N/A'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Delivery Items Table - NO PRICES */}
      <div style={{ marginBottom: '32px' }}>
        <table className="delivery-note-items-table" style={{ 
          width: '100%',
          borderCollapse: 'collapse',
          border: '1px solid #d1d5db'
        }}>
          <thead>
            <tr style={{ backgroundColor: '#9a3412', color: 'white' }}>
              <th style={{ 
                border: '1px solid #d1d5db',
                padding: '12px',
                textAlign: 'left',
                fontSize: '14px',
                width: '60px'
              }}>#</th>
              <th style={{ 
                border: '1px solid #d1d5db',
                padding: '12px',
                textAlign: 'left',
                fontSize: '14px'
              }}>Item Name</th>
              <th style={{ 
                border: '1px solid #d1d5db',
                padding: '12px',
                textAlign: 'center',
                fontSize: '14px',
                width: '150px'
              }}>Type</th>
              <th style={{ 
                border: '1px solid #d1d5db',
                padding: '12px',
                textAlign: 'center',
                fontSize: '14px',
                width: '100px'
              }}>Quantity</th>
            </tr>
          </thead>
          <tbody>
            {invoice.items?.map((item, index) => (
              <tr key={item.id}>
                <td style={{ 
                  border: '1px solid #d1d5db',
                  padding: '12px',
                  fontSize: '14px',
                  textAlign: 'center'
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
                }}>
                  <span style={{
                    padding: '4px 12px',
                    borderRadius: '12px',
                    backgroundColor: item.saleType === 'Gas' ? '#fed7aa' :
                                   item.saleType === 'Full Cylinder' ? '#bbf7d0' :
                                   item.saleType === 'Empty Cylinder' ? '#e5e7eb' :
                                   '#bfdbfe',
                    color: item.saleType === 'Gas' ? '#9a3412' :
                           item.saleType === 'Full Cylinder' ? '#166534' :
                           item.saleType === 'Empty Cylinder' ? '#374151' :
                           '#1e40af',
                    fontWeight: '600',
                    fontSize: '12px'
                  }}>
                    {item.saleType || 'N/A'}
                  </span>
                </td>
                <td style={{ 
                  border: '1px solid #d1d5db',
                  padding: '12px',
                  fontSize: '16px',
                  textAlign: 'center',
                  fontWeight: 'bold'
                }}>{item.quantity}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Total Quantity Summary */}
      <div style={{ 
        display: 'flex',
        justifyContent: 'flex-end',
        marginBottom: '48px'
      }}>
        <div style={{ 
          backgroundColor: '#fed7aa',
          border: '2px solid #ea580c',
          borderRadius: '12px',
          padding: '20px 40px',
          textAlign: 'center'
        }}>
          <p style={{ 
            fontSize: '14px',
            color: '#9a3412',
            fontWeight: '600',
            marginBottom: '8px'
          }}>
            TOTAL ITEMS DELIVERED
          </p>
          <p style={{ 
            fontSize: '36px',
            fontWeight: 'bold',
            color: '#9a3412'
          }}>
            {totalItemsDelivered}
          </p>
        </div>
      </div>

      {/* Signatures Section */}
      <div style={{ 
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '32px',
        marginTop: '48px',
        paddingTop: '32px',
        borderTop: '2px solid #e5e7eb'
      }}>
        {/* Delivered By Signature */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ marginBottom: '16px', height: '80px' }}>
            {(invoice.employeeSignature || invoice.employee?.signature) ? (
              <div style={{
                padding: '8px',
                height: '80px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'transparent'
              }}>
                <img
                  src={invoice.employeeSignature || invoice.employee?.signature}
                  alt="Delivered By Signature"
                  style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain' }}
                />
              </div>
            ) : (
              <div style={{ height: '80px' }} />
            )}
          </div>
          <div style={{ 
            borderTop: '2px solid #1f2937',
            paddingTop: '8px'
          }}>
            <p style={{ fontWeight: '600', color: '#111827', fontSize: '14px' }}>
              Delivered By
            </p>
            <p style={{ fontSize: '12px', color: '#6b7280' }}>
              {invoice.employee?.fullName || 'N/A'}
            </p>
          </div>
        </div>

        {/* Received By Signature */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ marginBottom: '16px', height: '80px' }}>
            {invoice.receivedBySignature ? (
              <div style={{
                padding: '8px',
                height: '80px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'transparent'
              }}>
                <img
                  src={invoice.receivedBySignature}
                  alt="Customer Signature"
                  style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain' }}
                />
              </div>
            ) : (
              <div style={{ height: '80px' }} />
            )}
          </div>
          <div style={{ 
            borderTop: '2px solid #1f2937',
            paddingTop: '8px'
          }}>
            <p style={{ fontWeight: '600', color: '#111827', fontSize: '14px' }}>
              Received By (Customer)
            </p>
            <p style={{ fontSize: '12px', color: '#6b7280' }}>
              {invoice.receivedByName || 'Signature & Date'}
            </p>
          </div>
        </div>
      </div>

      {/* Important Notice */}
      <div style={{
        marginTop: '32px',
        padding: '16px',
        backgroundColor: '#fef3c7',
        border: '1px solid #fbbf24',
        borderRadius: '8px'
      }}>
        <p style={{ fontSize: '12px', color: '#92400e', fontWeight: '600', marginBottom: '4px' }}>
          Important Notice:
        </p>
        <p style={{ fontSize: '11px', color: '#92400e' }}>
          This is a delivery note only and does not serve as a tax invoice. 
          Please verify all items upon delivery. For pricing and payment details, refer to the official invoice.
        </p>
      </div>

      {/* Footer */}
      <div style={{ 
        marginTop: '32px',
        paddingTop: '16px',
        borderTop: '1px solid #d1d5db',
        textAlign: 'center',
        fontSize: '12px',
        color: '#6b7280'
      }}>
        <p>© 2026 SYED TAYYAB INDUSTRIAL GASES LLC. All rights reserved.</p>
      </div>
    </div>
  );
};

export default DeliveryNote;
