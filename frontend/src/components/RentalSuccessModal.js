import React from 'react';
import { XMarkIcon, PrinterIcon, CheckCircleIcon } from '@heroicons/react/24/outline';
import { buildPrintHtml } from '../utils/printUtils';

const RentalSuccessModal = ({ rental, customer, items, totalAmount, onClose }) => {
  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Please allow popups to print');
      return;
    }

    const pricePerDay = 10;
    const itemsHTML = items.map(item => {
      const subtotal = item.quantity * pricePerDay * item.rentalDays;
      return `<tr><td>${item.productName}</td><td style="text-align: center;">${item.quantity}</td><td style="text-align: right;">10</td><td style="text-align: right;">${item.rentalDays}</td><td style="text-align: right;">AED ${subtotal.toFixed(2)}</td></tr>`;
    }).join('');

    const styles = `
      .container{max-width:900px;margin:0 auto}
      .header{text-align:center;border-bottom:3px solid #1e40af;padding-bottom:20px;margin-bottom:30px}
      .header h1{color:#1e3a8a;font-size:24px}
      .content{margin-bottom:30px}
      .section{margin-bottom:20px}
      .row{display:flex;justify-content:space-between;margin-bottom:8px;font-size:13px}
      table{width:100%;border-collapse:collapse;margin:20px 0}
      thead{background:#f3f4f6;border-bottom:2px solid #1e40af}
      th{padding:12px;text-align:left;font-size:12px;font-weight:600}
      td{padding:12px;border-bottom:1px solid #e5e7eb;font-size:13px}
      .total{text-align:right;font-weight:bold;margin-top:10px;font-size:16px}
      .footer{margin-top:40px;text-align:center;font-size:12px;color:#6b7280}
    `;

    const body = `
      <div class="container">
        <div class="header">
          <h1>RENTAL AGREEMENT</h1>
          <p>Rental #${rental?.rentalNumber || 'N/A'}</p>
        </div>
        <div class="content">
          <h3>Customer</h3>
          <div class="row"><strong>Name:</strong><span>${customer?.name}</span></div>
          <div class="row"><strong>Phone:</strong><span>${customer?.phone || 'N/A'}</span></div>
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>Qty</th>
                <th>Price/Day</th>
                <th>Days</th>
                <th style="text-align:right;">Total</th>
              </tr>
            </thead>
            <tbody>${itemsHTML}</tbody>
          </table>
          <div class="total">Total Amount: AED ${totalAmount.toFixed(2)}</div>
        </div>
        <div class="footer"><p>Thank you!</p></div>
      </div>
    `;

    const htmlContent = buildPrintHtml({
      title: `Rental ${rental?.rentalNumber}`,
      body,
      extraStyles: styles
    });

    printWindow.document.write(htmlContent);
    printWindow.document.close();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 500);
  };

  if (!rental || !customer || !items || items.length === 0) return null;

  return (
    <div className="fixed inset-0 z-[9999] overflow-y-auto">
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" />
      
      <div className="flex items-center justify-center min-h-screen px-4 py-6 relative z-[10000]">
        <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden">
          <div className="bg-gradient-to-r from-green-600 to-emerald-600 px-8 py-8 text-white">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <CheckCircleIcon className="h-10 w-10" />
                <div>
                  <h2 className="text-2xl font-bold">Rental Created!</h2>
                  <p className="text-green-100 text-sm mt-1">Rental #{rental?.rentalNumber}</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="text-white/80 hover:text-white transition-colors"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>
          </div>

          <div className="overflow-y-auto max-h-[calc(100vh-400px)] p-6">
            <div className="border-b-2 border-blue-600 pb-4 mb-6">
              <h3 className="text-lg font-bold text-gray-900">Rental Summary</h3>
            </div>
            
            <div className="mb-6">
              <h4 className="text-sm font-semibold text-blue-600 mb-3">Customer Information</h4>
              <div className="space-y-2 text-sm text-gray-700">
                <p><strong>Name:</strong> {customer.name}</p>
                <p><strong>Phone:</strong> {customer.phone || 'N/A'}</p>
                <p><strong>Email:</strong> {customer.email || 'N/A'}</p>
              </div>
            </div>

            <div className="border-t pt-6">
              <h4 className="text-sm font-semibold text-blue-600 mb-4">Items</h4>
              <div className="space-y-3">
                {items.map((item, index) => (
                  <div key={index} className="flex justify-between text-sm text-gray-700 pb-2 border-b">
                    <div>
                      <strong>{item.productName}</strong>
                      <span className="text-xs text-gray-600 block">({item.quantity} × 10 AED/day × {item.rentalDays} days)</span>
                    </div>
                    <span className="font-semibold">AED {(item.quantity * 10 * item.rentalDays).toFixed(2)}</span>
                  </div>
                ))}
                <div className="flex justify-between text-base font-bold text-blue-600 pt-2 border-t-2 border-blue-600">
                  <span>Total Amount:</span>
                  <span>AED {totalAmount.toFixed(2)}</span>
                </div>
              </div>
            </div>

            <div className="mt-6 bg-blue-50 border-l-4 border-blue-600 p-4 rounded">
              <p className="text-xs text-gray-700">
                <strong>Note:</strong> Rental begins from the agreed start date. Customer is responsible for item safekeeping.
              </p>
            </div>
          </div>

          <div className="bg-gray-50 px-8 py-4 flex gap-3 justify-end border-t">
            <button
              onClick={onClose}
              className="px-6 py-2 border-2 border-gray-300 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-100 transition-colors"
            >
              Close
            </button>
            <button
              onClick={handlePrint}
              className="px-6 py-2 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-lg text-sm font-semibold hover:from-blue-700 hover:to-cyan-700 transition-all flex items-center gap-2"
            >
              <PrinterIcon className="h-4 w-4" />
              Print Agreement
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RentalSuccessModal;
