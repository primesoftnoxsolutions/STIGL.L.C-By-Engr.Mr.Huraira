import React, { useState, useEffect, useRef, useMemo } from 'react';
import api from '../utils/api';
import { getUaeDateKey } from '../utils/uaeDate';
import toast from 'react-hot-toast';
import { PlusIcon, PencilIcon, TrashIcon, PrinterIcon } from '@heroicons/react/24/outline';
import ConfirmDialog from '../components/ConfirmDialog';
import QuotationSuccessModal from '../components/QuotationSuccessModal';
import SearchableSelect from '../components/SearchableSelect';
import { getQuotationCustomerDisplay } from '../utils/quotationCustomer';

const Quotations = () => {
  const productSearchInputRef = useRef(null);
  const [quotations, setQuotations] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [, setSelectedQuotation] = useState(null);
  const [editingItemIndex, setEditingItemIndex] = useState(null);
  const [selectedProduct, setSelectedProduct] = useState(null);
  
  const [formData, setFormData] = useState({
    customerType: 'existing',
    customerId: '',
    walkInCustomerName: '',
    walkInTrNumber: '',
    quotationDate: getUaeDateKey(),
    validUntil: '',
    items: []
  });

  const [currentItem, setCurrentItem] = useState({
    productId: '',
    productName: '',
    quantity: 1,
    unitPrice: 0
  });

  const [confirmDialog, setConfirmDialog] = useState({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: null,
    type: 'warning'
  });

  const [productSearch, setProductSearch] = useState('');
  const [successModal, setSuccessModal] = useState({
    isOpen: false,
    quotation: null,
    items: []
  });

  // Filter products based on search
  const filteredProducts = useMemo(() => {
    if (!productSearch.trim()) {
      return products;
    }
    return products.filter(p => 
      p.productName.toLowerCase().includes(productSearch.toLowerCase())
    );
  }, [products, productSearch]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [quotationsRes, customersRes, productsRes] = await Promise.all([
        api.get('/quotations'),
        api.get('/customers'),
        api.get('/products')
      ]);
      setQuotations(quotationsRes.data.data);
      setCustomers(customersRes.data.data);
      setProducts(productsRes.data.data);
    } catch (error) {
      toast.error('Failed to fetch data');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (formData.customerType === 'existing' && !formData.customerId) {
      toast.error('Please select a customer');
      return;
    }

    if (formData.customerType === 'walk_in') {
      if (!formData.walkInCustomerName.trim()) {
        toast.error('Please enter customer name');
        return;
      }
      if (!formData.walkInTrNumber.trim()) {
        toast.error('Please enter TR Number');
        return;
      }
    }

    if (formData.items.length === 0) {
      toast.error('Please add at least one item');
      return;
    }

    try {
      const response = await api.post('/quotations', formData);
      const createdQuotation = response.data.data;
      
      // Show success modal with print/download options
      setSuccessModal({
        isOpen: true,
        quotation: createdQuotation,
        items: formData.items
      });
      
      fetchData();
      resetForm();
    } catch (error) {
      toast.error('Failed to create quotation');
    }
  };
    
  const resetForm = () => {
    setFormData({
      customerType: 'existing',
      customerId: '',
      walkInCustomerName: '',
      walkInTrNumber: '',
      quotationDate: getUaeDateKey(),
      validUntil: '',
      items: []
    });
    setCurrentItem({
      productId: '',
      productName: '',
      quantity: 1,
      unitPrice: 0
    });
    setSelectedProduct(null);
    setProductSearch('');
    setEditingItemIndex(null);
    setSelectedQuotation(null);
    setShowModal(false);
  };

  const addItem = () => {
    if (!currentItem.productId || !currentItem.quantity || !currentItem.unitPrice) {
      toast.error('Please select a product and fill in quantity and price');
      return;
    }

    if (editingItemIndex !== null) {
      // Update existing item
      const newItems = [...formData.items];
      newItems[editingItemIndex] = currentItem;
      setFormData({ ...formData, items: newItems });
      setEditingItemIndex(null);
    } else {
      // Add new item
      setFormData({
        ...formData,
        items: [...formData.items, currentItem]
      });
    }

    setCurrentItem({
      productId: '',
      productName: '',
      quantity: 1,
      unitPrice: 0
    });
    setSelectedProduct(null);
    toast.success('Item added successfully');
  };

  const editItem = (index) => {
    setCurrentItem(formData.items[index]);
    setEditingItemIndex(index);
  };

  const removeItem = (index) => {
    const newItems = formData.items.filter((_, i) => i !== index);
    setFormData({ ...formData, items: newItems });
    toast.success('Item removed');
  };

  const handlePrint = (quotation) => {
    try {
      const customerInfo = getQuotationCustomerDisplay(quotation, customers);
      const items = quotation.items || [];

      const htmlContent = `
        <html>
          <head>
            <title>Quotation ${quotation.quotationNumber}</title>
            <style>
              body {
                font-family: Arial, sans-serif;
                margin: 20px;
                color: #333;
              }
              .header {
                text-align: center;
                border-bottom: 3px solid #1e40af;
                padding-bottom: 20px;
                margin-bottom: 30px;
              }
              .header h1 {
                margin: 0;
                color: #1e3a8a;
              }
              .details {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 30px;
                margin-bottom: 30px;
              }
              .detail-section {
                margin-bottom: 20px;
              }
              .detail-section h3 {
                color: #1e40af;
                margin-bottom: 10px;
                font-size: 14px;
              }
              .detail-row {
                display: flex;
                justify-content: space-between;
                margin-bottom: 8px;
                font-size: 13px;
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
                margin: 20px 0;
              }
              thead {
                background: #f3f4f6;
                border-bottom: 2px solid #1e40af;
              }
              th {
                padding: 12px;
                text-align: left;
                font-size: 12px;
                font-weight: 600;
                color: #4b5563;
                text-transform: uppercase;
              }
              td {
                padding: 12px;
                border-bottom: 1px solid #e5e7eb;
                font-size: 14px;
              }
              .total-section {
                margin-top: 30px;
                padding-top: 20px;
                border-top: 2px solid #e5e7eb;
              }
              .total-row {
                display: flex;
                justify-content: flex-end;
                margin-bottom: 10px;
                font-size: 14px;
              }
              .total-row.grand {
                font-weight: bold;
                font-size: 18px;
                color: #1e3a8a;
                border-top: 2px solid #1e40af;
                padding-top: 10px;
              }
              .total-label {
                flex: 1;
                text-align: right;
                margin-right: 20px;
              }
              .total-value {
                width: 150px;
                text-align: right;
              }
              .footer {
                margin-top: 40px;
                padding-top: 20px;
                border-top: 1px solid #e5e7eb;
                text-align: center;
                font-size: 12px;
                color: #6b7280;
              }
              .note {
                background: #fef3c7;
                border-left: 4px solid #f59e0b;
                padding: 15px;
                margin-top: 20px;
                border-radius: 4px;
                font-size: 12px;
                color: #92400e;
                line-height: 1.6;
              }
            </style>
          </head>
          <body>
            <div class="header">
              <h1>QUOTATION</h1>
              <p style="margin: 5px 0; color: #6b7280;">Quotation #: <strong>${quotation.quotationNumber}</strong></p>
            </div>

            <div class="details">
              <div class="detail-section">
                <h3>Customer Information</h3>
                <div class="detail-row">
                  <span class="detail-label">Customer:</span>
                  <span class="detail-value">${customerInfo.name}</span>
                </div>
                ${customerInfo.isWalkIn ? `
                <div class="detail-row">
                  <span class="detail-label">TR Number:</span>
                  <span class="detail-value">${customerInfo.trNumber || 'N/A'}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Customer Type:</span>
                  <span class="detail-value">Walk-in Customer</span>
                </div>
                ` : `
                <div class="detail-row">
                  <span class="detail-label">Phone:</span>
                  <span class="detail-value">${customerInfo.phone}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Email:</span>
                  <span class="detail-value">${customerInfo.email}</span>
                </div>
                `}
              </div>

              <div class="detail-section">
                <h3>Quotation Details</h3>
                <div class="detail-row">
                  <span class="detail-label">Date:</span>
                  <span class="detail-value">${new Date(quotation.quotationDate).toLocaleDateString('en-GB')}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Valid Until:</span>
                  <span class="detail-value">${new Date(quotation.validUntil).toLocaleDateString('en-GB')}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Status:</span>
                  <span class="detail-value">${quotation.status || 'Draft'}</span>
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
              <strong>⚠️ Important Terms & Conditions:</strong><br>
              These rates are valid for 1 week only. After this period, please verify updated rates. Any damaged cylinder items are the responsibility of the customer.
            </div>

            <div class="footer">
              <p>Generated on ${new Date().toLocaleDateString('en-GB')} at ${new Date().toLocaleTimeString()}</p>
              <p>© SYED TAYYAB INDUSTRIAL GASES LLC</p>
            </div>
          </body>
        </html>
      `;

      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        toast.error('Please allow popups to print quotations');
        return;
      }
      printWindow.document.write(htmlContent);
      printWindow.document.close();
      setTimeout(() => {
        printWindow.print();
        printWindow.close();
      }, 500);
    } catch (error) {
      toast.error('Failed to generate quotation');
    }
  };

  if (loading) {
    return <div className="flex justify-center items-center h-64">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
    </div>;
  }

  return (
    <div className="form-viewport-page space-y-4 sm:space-y-6">
      <div className="relative overflow-hidden rounded-[14px] border border-transparent bg-gradient-to-br from-blue-50 via-slate-50 to-white p-4 sm:p-6 shadow-lg">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(129,140,248,0.22),_transparent_60%)]"></div>
        <div className="relative flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Quotations</h1>
            <p className="mt-1 text-sm text-gray-600">Create and track customer quotations from a single workspace.</p>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="w-full sm:w-auto inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-primary-600 px-4 text-sm font-semibold text-white shadow transition hover:bg-primary-700"
          >
            <PlusIcon className="h-4 w-4" />
            Create Quotation
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white/95 shadow-xl shadow-slate-200/70">
        <div className="block sm:hidden border-b border-slate-200 bg-gradient-to-r from-blue-50 to-slate-100 px-4 py-2 text-center text-xs font-medium text-slate-600">
          Swipe to view all columns
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[900px] w-full">
            <thead className="bg-gradient-to-r from-slate-100 to-blue-50">
              <tr>
                <th className="px-5 py-3 sm:py-4 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-600">Quotation #</th>
                <th className="px-5 py-3 sm:py-4 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-600">Customer</th>
                <th className="px-5 py-3 sm:py-4 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-600">Date</th>
                <th className="px-5 py-3 sm:py-4 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-600">Valid Until</th>
                <th className="px-5 py-3 sm:py-4 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-600">Total</th>
                <th className="px-5 py-3 sm:py-4 text-right text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/80 bg-white">
              {quotations.map((quotation) => (
                <tr key={quotation.id} className="transition-colors duration-200 hover:bg-blue-50/35">
                  <td className="whitespace-nowrap px-5 py-3 sm:py-4">
                    <span className="inline-flex rounded-md bg-blue-50 px-2 py-1 text-xs font-mono font-bold tracking-wide text-primary-600 ring-1 ring-blue-100">
                      {quotation.quotationNumber}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 sm:py-4 text-sm text-slate-800">
                    {getQuotationCustomerDisplay(quotation, customers).name}
                    {quotation.customerType === 'walk_in' && (
                      <span className="ml-2 inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                        Walk-in
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 sm:py-4 text-sm text-slate-700">
                    {new Date(quotation.quotationDate).toLocaleDateString()}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 sm:py-4 text-sm text-slate-700">
                    {new Date(quotation.validUntil).toLocaleDateString()}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 sm:py-4 text-sm font-bold tabular-nums text-slate-800">
                    AED {parseFloat(quotation.total).toFixed(2)}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 sm:py-4 text-right">
                    <button
                      onClick={() => handlePrint(quotation)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-blue-200 bg-blue-50 text-blue-600 transition hover:bg-blue-100"
                      title="Print Quotation"
                    >
                      <PrinterIcon className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {quotations.length === 0 && (
          <div className="py-14 text-center">
            <p className="text-sm font-medium text-slate-500">No quotations found</p>
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showModal && (
        <div className="form-modal-overlay">
          <div className="form-modal-wrap px-4">
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75" onClick={resetForm}></div>
            
            <div className="form-modal-panel form-modal-body relative bg-white rounded-2xl max-w-3xl w-full p-4 sm:p-5">
              <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-3">Create Quotation</h3>
              
              <form onSubmit={handleSubmit} className="space-y-3.5">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Customer Type</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setFormData((prev) => ({
                        ...prev,
                        customerType: 'existing',
                        walkInCustomerName: '',
                        walkInTrNumber: ''
                      }))}
                      className={`rounded-xl border px-4 py-3 text-left transition ${
                        formData.customerType === 'existing'
                          ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
                          : 'border-gray-300 bg-white hover:border-gray-400'
                      }`}
                    >
                      <p className="text-sm font-semibold text-gray-900">Existing Customer</p>
                      <p className="mt-1 text-xs text-gray-500">Select from saved customer database</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormData((prev) => ({
                        ...prev,
                        customerType: 'walk_in',
                        customerId: ''
                      }))}
                      className={`rounded-xl border px-4 py-3 text-left transition ${
                        formData.customerType === 'walk_in'
                          ? 'border-amber-500 bg-amber-50 ring-2 ring-amber-200'
                          : 'border-gray-300 bg-white hover:border-gray-400'
                      }`}
                    >
                      <p className="text-sm font-semibold text-gray-900">Walk-in Customer</p>
                      <p className="mt-1 text-xs text-gray-500">One-time customer, not saved to database</p>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {formData.customerType === 'existing' ? (
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Customer</label>
                      <SearchableSelect
                        required
                        value={formData.customerId}
                        options={customers}
                        onChange={(nextValue) => setFormData((prev) => ({ ...prev, customerId: nextValue }))}
                        placeholder="Search customer by name, code, phone"
                        getOptionValue={(customer) => customer.id}
                        getOptionLabel={(customer) => customer.name || customer.customerCode || 'Customer'}
                        getOptionSubLabel={(customer) =>
                          `${customer.customerCode || 'No code'}${customer.phone ? ` - ${customer.phone}` : ''}`
                        }
                        getOptionSearchText={(customer) =>
                          `${customer.name || ''} ${customer.customerCode || ''} ${customer.phone || ''} ${customer.email || ''}`
                        }
                        inputClassName="mt-1 block w-full px-3 py-2.5 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                        menuClassName="absolute z-50 mt-1 w-full rounded-lg border border-gray-300 bg-white shadow-lg max-h-52 overflow-y-auto"
                      />
                    </div>
                  ) : (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Customer Name</label>
                        <input
                          type="text"
                          required
                          value={formData.walkInCustomerName}
                          onChange={(e) => setFormData((prev) => ({ ...prev, walkInCustomerName: e.target.value }))}
                          placeholder="Enter walk-in customer name"
                          className="mt-1 block w-full px-3 py-2.5 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700">TR Number</label>
                        <input
                          type="text"
                          required
                          value={formData.walkInTrNumber}
                          onChange={(e) => setFormData((prev) => ({ ...prev, walkInTrNumber: e.target.value }))}
                          placeholder="Enter TR number"
                          className="mt-1 block w-full px-3 py-2.5 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                        />
                      </div>
                    </>
                  )}

                  <div className={formData.customerType === 'walk_in' ? 'sm:col-span-2' : ''}>
                    <label className="block text-sm font-medium text-gray-700">Valid Until</label>
                    <input
                      type="date"
                      required
                      value={formData.validUntil}
                      onChange={(e) => setFormData({ ...formData, validUntil: e.target.value })}
                      className="mt-1 block w-full px-3 py-2.5 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                  </div>
                </div>

                <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-4 sm:p-5">
                  <h4 className="text-base font-bold text-gray-900 mb-3">Add Items</h4>
                  
                  <div className="space-y-3.5 mb-3">
                    {/* Product Search with Dropdown Results */}
                    <div>
                      <label className="block text-sm font-semibold text-gray-900 mb-2">
                        Search & Select Product <span className="text-red-500">*</span>
                      </label>
                      <input
                        ref={productSearchInputRef}
                        type="text"
                        placeholder="Type product name (e.g., Oxygen, Nitrogen)..."
                        value={productSearch}
                        onChange={(e) => setProductSearch(e.target.value)}
                        className="block w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      />
                      
                      {/* Filtered Products List */}
                      {productSearch && filteredProducts.length > 0 && (
                        <div className="mt-2 border border-gray-300 rounded-lg bg-white max-h-48 overflow-y-auto shadow-lg">
                          {filteredProducts.map((product) => (
                            <button
                              key={product.id}
                              type="button"
                              onClick={() => {
                                setSelectedProduct(product);
                                setCurrentItem({
                                  ...currentItem,
                                  productId: product.id,
                                  productName: product.productName,
                                  unitPrice: parseFloat(product.costPrice) || 0
                                });
                                setProductSearch('');
                              }}
                              className="w-full text-left px-3 py-2.5 hover:bg-blue-50 border-b border-gray-200 last:border-b-0 transition-colors"
                            >
                              <div className="font-medium text-gray-900">{product.productName}</div>
                              <div className="text-xs text-gray-600">
                                Type: {product.productType} • Cost: AED {parseFloat(product.costPrice).toFixed(2)}
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                      
                      {productSearch && filteredProducts.length === 0 && (
                        <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                          <p className="text-sm text-red-700">❌ No products found matching "{productSearch}"</p>
                        </div>
                      )}
                    </div>

                    {/* Selected Product Info */}
                    {selectedProduct && (
                      <div className="bg-gradient-to-r from-blue-50 to-green-50 border border-green-300 rounded-lg p-3.5">
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="font-bold text-gray-900">{selectedProduct.productName}</p>
                            <p className="text-xs text-gray-700">
                              <span className="font-semibold">Type:</span> {selectedProduct.productType}
                            </p>
                            <p className="text-xs text-gray-700">
                              <span className="font-semibold">Cost Price:</span> AED {parseFloat(selectedProduct.costPrice).toFixed(2)}
                            </p>
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                setProductSearch(selectedProduct.productName || '');
                                setTimeout(() => {
                                  productSearchInputRef.current?.focus();
                                  productSearchInputRef.current?.select();
                                }, 0);
                              }}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-blue-200 bg-blue-50 text-blue-600 hover:bg-blue-100"
                              title="Edit selection"
                            >
                              <PencilIcon className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedProduct(null);
                                setCurrentItem({
                                  productId: '',
                                  productName: '',
                                  quantity: 1,
                                  unitPrice: 0
                                });
                                setProductSearch('');
                              }}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-red-200 bg-red-50 text-red-600 hover:bg-red-100"
                              title="Clear selection"
                            >
                              <TrashIcon className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Quantity and Price */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-sm font-semibold text-gray-900 mb-2">
                          Quantity <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="number"
                          required
                          min="1"
                          value={currentItem.quantity}
                          onChange={(e) => setCurrentItem({ ...currentItem, quantity: parseInt(e.target.value) || 1 })}
                          className="block w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-gray-900 mb-2">
                          Unit Price (AED) <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="number"
                          required
                          step="0.01"
                          value={currentItem.unitPrice}
                          onChange={(e) => setCurrentItem({ ...currentItem, unitPrice: parseFloat(e.target.value) || 0 })}
                          className="block w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                        />
                      </div>
                    </div>

                    {/* Add/Update Button */}
                    <button
                      type="button"
                      onClick={addItem}
                      className="w-full px-4 py-2.5 bg-gradient-to-r from-blue-600 to-blue-700 text-white font-semibold rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all shadow-md"
                    >
                      {editingItemIndex !== null ? 'Update Item' : 'Add Item'}
                    </button>
                  </div>

                  {/* Items List */}
                  {formData.items.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-blue-200">
                      <h5 className="text-sm font-bold text-gray-900 mb-3">Items Added ({formData.items.length})</h5>
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {formData.items.map((item, index) => (
                          <div key={index} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between p-3 bg-white border border-blue-100 rounded-lg hover:shadow-md transition-shadow">
                            <div className="flex-1">
                              <p className="font-medium text-sm text-gray-900">{index + 1}. {item.productName}</p>
                              <p className="text-xs text-gray-600">Qty: {item.quantity} × AED {parseFloat(item.unitPrice).toFixed(2)} = <strong>AED {(item.quantity * parseFloat(item.unitPrice)).toFixed(2)}</strong></p>
                            </div>
                            <div className="flex gap-2 ml-3">
                              <button
                                type="button"
                                onClick={() => editItem(index)}
                                className="p-2 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors"
                                title="Edit item"
                              >
                                <PencilIcon className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => removeItem(index)}
                                className="p-2 text-red-600 hover:bg-red-100 rounded-lg transition-colors"
                                title="Remove item"
                              >
                                <TrashIcon className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-2.5 sm:flex-row sm:justify-end mt-4 pt-3 border-t">
                  <button
                    type="button"
                    onClick={resetForm}
                    className="px-4 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2.5 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700"
                  >
                    Create Quotation
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Success Modal */}
      {successModal.isOpen && (
        <QuotationSuccessModal
          quotation={successModal.quotation}
          customer={getQuotationCustomerDisplay(successModal.quotation, customers)}
          items={successModal.items}
          onClose={() => setSuccessModal({ ...successModal, isOpen: false })}
        />
      )}

      {/* Confirmation Dialog */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        onClose={() => setConfirmDialog({ ...confirmDialog, isOpen: false })}
        onConfirm={confirmDialog.onConfirm}
        title={confirmDialog.title}
        message={confirmDialog.message}
        type={confirmDialog.type}
      />
    </div>
  );
};

export default Quotations;

