import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import api from '../utils/api';
import toast from 'react-hot-toast';
import { PlusIcon, PencilIcon, TrashIcon, MagnifyingGlassIcon, ArrowUpTrayIcon, ArrowDownTrayIcon, BeakerIcon, CircleStackIcon, WrenchScrewdriverIcon } from '@heroicons/react/24/outline';
import { useAuth } from '../context/AuthContext';
import ConfirmDialog from '../components/ConfirmDialog';

const PRODUCT_TYPE_BY_FIRST_WORD = {
  cylinder: 'Cylinder',
  gas: 'Gas'
};

const inferProductTypeFromName = (name) => {
  const firstWord = (name || '')
    .trim()
    .split(/\s+/)[0]
    ?.replace(/[^a-z]/gi, '')
    .toLowerCase();

  if (!firstWord) {
    return '';
  }

  return PRODUCT_TYPE_BY_FIRST_WORD[firstWord] || 'Tool';
};

const withHardTimeout = (promise, timeoutMs, label) => (
  Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`${label} request timed out`)), timeoutMs);
    })
  ])
);

const getTypeStyles = (productType) => {
  if (productType === 'Gas') {
    return {
      code: 'bg-sky-50 text-sky-700 ring-sky-100',
      badge: 'bg-sky-50 text-sky-700 ring-sky-200',
      icon: BeakerIcon,
      iconBg: 'bg-sky-100 text-sky-600'
    };
  }
  if (productType === 'Cylinder') {
    return {
      code: 'bg-violet-50 text-violet-700 ring-violet-100',
      badge: 'bg-violet-50 text-violet-700 ring-violet-200',
      icon: CircleStackIcon,
      iconBg: 'bg-violet-100 text-violet-600'
    };
  }
  return {
    code: 'bg-orange-50 text-orange-700 ring-orange-100',
    badge: 'bg-orange-50 text-orange-700 ring-orange-200',
    icon: WrenchScrewdriverIcon,
    iconBg: 'bg-orange-100 text-orange-600'
  };
};

const Products = () => {
  const { isSuperAdmin } = useAuth();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importSummary, setImportSummary] = useState(null);
  const [importFailures, setImportFailures] = useState([]);
  const [isExporting, setIsExporting] = useState(false);
  const [formData, setFormData] = useState({
    productName: '',
    productCode: '',
    productType: '',
    productCategory: '',
    costPrice: '',
    leastSellingPrice: '',
    description: ''
  });
  const [editingId, setEditingId] = useState(null);
  const [priceError, setPriceError] = useState('');
  const [generatingCode, setGeneratingCode] = useState(false);
  const codeTimerRef = useRef(null);
  const importInputRef = useRef(null);
  const [confirmDialog, setConfirmDialog] = useState({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: null,
    type: 'warning'
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    const productsRequest = withHardTimeout(
      api.get('/products', { timeout: 10000 }),
      12000,
      'Products'
    );

    try {
      const productsRes = await productsRequest;
      setProducts(productsRes?.data?.data || []);
    } catch (error) {
      toast.error('Failed to fetch products');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    return () => {
      if (codeTimerRef.current) {
        clearTimeout(codeTimerRef.current);
      }
    };
  }, []);

  // Generate product code when product name changes
  const generateProductCode = async (productName) => {
    if (!productName || productName.trim().length === 0 || editingId) {
      return;
    }

    setGeneratingCode(true);
    try {
      const response = await api.post('/products/generate-code', { productName });
      setFormData(prev => ({
        ...prev,
        productCode: response.data.data.productCode
      }));
    } catch (error) {
      console.error('Failed to generate product code:', error);
      setFormData(prev => ({ ...prev, productCode: '' }));
    } finally {
      setGeneratingCode(false);
    }
  };

  const handleProductNameChange = (value) => {
    setFormData((prev) => {
      const inferredType = inferProductTypeFromName(value);
      if (!inferredType) {
        return { ...prev, productName: value };
      }

      return {
        ...prev,
        productName: value,
        productType: inferredType
      };
    });

    if (codeTimerRef.current) {
      clearTimeout(codeTimerRef.current);
    }

    // Generate code after user stops typing (debounce)
    if (value.trim()) {
      codeTimerRef.current = setTimeout(() => {
        generateProductCode(value);
      }, 500);
    } else if (!editingId) {
      setFormData((prev) => ({ ...prev, productCode: '' }));
    }
  };

  const validatePrices = (costPrice, leastPrice) => {
    const cost = parseFloat(costPrice);
    const least = parseFloat(leastPrice);
    
    if (least < cost) {
      setPriceError('Least Selling Price cannot be lower than Cost Price');
      return false;
    }
    setPriceError('');
    return true;
  };

  const handlePriceChange = (field, value) => {
    setFormData({ ...formData, [field]: value });
    
    if (field === 'costPrice' && formData.leastSellingPrice) {
      validatePrices(value, formData.leastSellingPrice);
    } else if (field === 'leastSellingPrice' && formData.costPrice) {
      validatePrices(formData.costPrice, value);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validate product type
    if (!formData.productType) {
      toast.error('Please select a product type');
      return;
    }

    // Final validation
    if (!validatePrices(formData.costPrice, formData.leastSellingPrice)) {
      return;
    }
    
    try {
      if (editingId) {
        await api.put(`/products/${editingId}`, formData);
        toast.success('Product updated successfully');
      } else {
        await api.post('/products', formData);
        toast.success('Product created successfully with auto-generated code');
      }
      
      fetchData();
      resetForm();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Operation failed');
    }
  };

  const handleEdit = (product) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Edit Product',
      message: 'Are you sure you want to edit this product? Make sure to save your changes.',
      type: 'info',
      onConfirm: () => {
        setFormData({
          productName: product.productName,
          productCode: product.productCode,
          productType: product.productType || 'Gas',
          productCategory: product.productCategory || '',
          costPrice: product.costPrice,
          leastSellingPrice: product.leastSellingPrice,
          description: product.description || ''
        });
        setEditingId(product.id);
        setPriceError('');
        setShowModal(true);
        setConfirmDialog({ ...confirmDialog, isOpen: false });
      }
    });
  };

  const handleDelete = async (id) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Delete Product',
      message: 'Are you sure you want to permanently delete this product? This action cannot be undone.',
      type: 'danger',
      onConfirm: async () => {
        try {
          await api.delete(`/products/${id}`);
          toast.success('Product deleted successfully');
          fetchData();
        } catch (error) {
          toast.error('Failed to delete product');
        }
        setConfirmDialog({ ...confirmDialog, isOpen: false });
      }
    });
  };

  const resetForm = () => {
    setFormData({
      productName: '',
      productCode: '',
      productType: '',
      productCategory: '',
      costPrice: '',
      leastSellingPrice: '',
      description: ''
    });
    setEditingId(null);
    setPriceError('');
    setShowModal(false);
  };

  const handleImportClick = () => {
    if (isImporting) {
      return;
    }
    if (importInputRef.current) {
      importInputRef.current.click();
    }
  };

  const handleImportFile = async (event) => {
    const file = event.target.files && event.target.files[0];
    event.target.value = '';
    if (!file) {
      return;
    }

    setIsImporting(true);
    setImportProgress(0);
    setImportSummary(null);
    setImportFailures([]);

    const uploadData = new FormData();
    uploadData.append('file', file);

    try {
      const response = await api.post('/products/import', uploadData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total) {
            const percentage = Math.round((progressEvent.loaded / progressEvent.total) * 100);
            setImportProgress(percentage);
          }
        }
      });

      const summary = response.data?.data || {};
      const successCount = summary.successCount || 0;
      const failedCount = summary.failedCount || 0;
      setImportSummary({ successCount, failedCount });
      setImportFailures(summary.failures || []);

      if (failedCount > 0) {
        toast.error('Some products could not be imported. See details below.');
      } else {
        toast.success('Products imported successfully');
      }

      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to import products');
    } finally {
      setIsImporting(false);
      setImportProgress(0);
    }
  };

  const handleExport = async () => {
    if (isExporting) {
      return;
    }
    setIsExporting(true);
    try {
      const response = await api.get('/products/export', {
        params: { format: 'xlsx' },
        responseType: 'blob'
      });

      const extension = 'xlsx';
      const now = new Date();
      const dateStamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const filename = `products-${dateStamp}.${extension}`;

      const blob = new Blob([response.data], { type: response.headers['content-type'] || 'application/octet-stream' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success('Products export downloaded');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to export products');
    } finally {
      setIsExporting(false);
    }
  };

  const filteredProducts = useMemo(() => {
    const normalizedSearch = searchTerm.toLowerCase();
    return products.filter((product) => (
      product.productName.toLowerCase().includes(normalizedSearch) ||
      product.productCode.toLowerCase().includes(normalizedSearch)
    ));
  }, [products, searchTerm]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-violet-600" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-5 sm:space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">Product Management</h1>
          <p className="mt-1 text-sm text-slate-500">
            Easily manage your product catalog and generate codes automatically.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isSuperAdmin && (
            <>
              <input
                ref={importInputRef}
                type="file"
                accept=".xlsx,.csv"
                onChange={handleImportFile}
                className="hidden"
              />
              <button
                type="button"
                onClick={handleImportClick}
                disabled={isImporting}
                className="dash-btn-secondary disabled:cursor-not-allowed disabled:opacity-60"
              >
                <ArrowUpTrayIcon className="h-4 w-4" />
                {isImporting ? 'Importing...' : 'Import Products'}
              </button>
              <button
                type="button"
                onClick={handleExport}
                disabled={isExporting}
                className="dash-btn-secondary disabled:cursor-not-allowed disabled:opacity-60"
              >
                <ArrowDownTrayIcon className="h-4 w-4" />
                {isExporting ? 'Exporting...' : 'Export Products'}
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => setShowModal(true)}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:from-violet-700 hover:to-blue-700"
          >
            <PlusIcon className="h-4 w-4" />
            Add New Product
          </button>
        </div>
      </div>

      <div className="dash-card p-3 sm:p-4">
        <div className="relative">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 sm:h-5 sm:w-5" />
          <input
            type="text"
            placeholder="Search product by name or code..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 text-sm text-slate-700 placeholder:text-slate-400 focus:border-violet-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-violet-500/20"
          />
        </div>
      </div>

      {isSuperAdmin && isImporting && (
        <div className="dash-card p-4">
          <div className="flex items-center justify-between text-sm text-slate-700">
            <span>Importing products...</span>
            <span>{importProgress}%</span>
          </div>
          <div className="mt-2 h-2 w-full rounded-full bg-slate-200">
            <div
              className="h-2 rounded-full bg-violet-600 transition-all"
              style={{ width: `${importProgress}%` }}
            />
          </div>
        </div>
      )}

      {isSuperAdmin && importSummary && (
        <div className="dash-card p-4">
          <div className="text-sm text-slate-700">
            Import summary: <span className="font-semibold text-emerald-700">{importSummary.successCount} success</span>,{' '}
            <span className="font-semibold text-rose-700">{importSummary.failedCount} failed</span>
          </div>
          {importSummary.failedCount > 0 && (
            <div className="mt-3">
              <p className="text-xs text-rose-600">Product details are incomplete or invalid for this item.</p>
              <ul className="mt-2 space-y-1 text-xs text-rose-700">
                {importFailures.map((failure, index) => (
                  <li key={`${failure.row || 'row'}-${index}`}>
                    Row {failure.row || 'N/A'}: {failure.productName || 'Unknown product'} - {failure.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="dash-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-[760px] w-full sm:min-w-[980px]">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 sm:px-5">Product Code</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 sm:px-5">Product Name</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 sm:px-5">Type</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 sm:px-5">Cost Price</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 sm:px-5">Selling Price</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 sm:px-5">Margin</th>
                <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-500 sm:px-5">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {filteredProducts.map((product) => {
                const margin = ((product.leastSellingPrice - product.costPrice) / product.costPrice * 100).toFixed(1);
                const typeStyles = getTypeStyles(product.productType);
                const ProductIcon = typeStyles.icon;
                return (
                  <tr key={product.id} className="transition-colors hover:bg-slate-50/80">
                    <td className="whitespace-nowrap px-4 py-3 sm:px-5 sm:py-4">
                      <span className={`inline-flex rounded-lg px-2.5 py-1 text-xs font-semibold ring-1 ${typeStyles.code}`}>
                        {product.productCode}
                      </span>
                    </td>
                    <td className="px-4 py-3 sm:px-5 sm:py-4">
                      <div className="flex items-center gap-3">
                        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${typeStyles.iconBg}`}>
                          <ProductIcon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-slate-800">{product.productName}</div>
                          {product.description && (
                            <div className="mt-0.5 max-w-xs truncate text-xs text-slate-500">{product.description}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 sm:px-5 sm:py-4">
                      <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ring-1 ${typeStyles.badge}`}>
                        {product.productType || 'Gas'}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm tabular-nums text-slate-700 sm:px-5 sm:py-4">
                      AED {parseFloat(product.costPrice).toFixed(2)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm font-semibold tabular-nums text-slate-900 sm:px-5 sm:py-4">
                      AED {parseFloat(product.leastSellingPrice).toFixed(2)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 sm:px-5 sm:py-4">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                        margin >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                      }`}>
                        {margin}%
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right sm:px-5 sm:py-4">
                      <div className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleEdit(product)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50"
                        >
                          <PencilIcon className="h-4 w-4" />
                        </button>
                        {isSuperAdmin && (
                          <button
                            type="button"
                            onClick={() => handleDelete(product.id)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-rose-200 bg-rose-50 text-rose-600 transition hover:bg-rose-100"
                          >
                            <TrashIcon className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {filteredProducts.length === 0 && (
          <div className="py-12 text-center">
            <p className="text-sm font-medium text-slate-500">No products found</p>
          </div>
        )}

        <div className="flex flex-col gap-3 border-t border-slate-200 bg-slate-50/80 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <p className="text-sm text-slate-500">
            Showing {filteredProducts.length > 0 ? 1 : 0} to {filteredProducts.length} of {filteredProducts.length} products
          </p>
        </div>
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
          <div className="fixed inset-0 bg-slate-900/30" onClick={resetForm} />

          <div className="relative w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-800">
                  {editingId ? 'Edit Product' : 'Add New Product'}
                </h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  {editingId ? 'Update product details' : 'Create a new product entry'}
                </p>
              </div>
              <button
                type="button"
                onClick={resetForm}
                className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {editingId && (
              <div className="mx-5 mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
                <p className="text-xs leading-relaxed text-slate-600">
                  Product code stays fixed for data integrity. You may update the name freely.
                </p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4 px-5 py-4 sm:px-6 sm:py-5">
              {/* Product Name + Code side by side */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500">
                    Product Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.productName}
                    onChange={(e) => handleProductNameChange(e.target.value)}
                    className="block w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-800 focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-200"
                    placeholder="e.g., Oxygen Gas Cylinder 10L"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500">
                    Product Code
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={
                        formData.productCode
                          || (generatingCode ? 'Generating...' : 'Auto from name')
                      }
                      readOnly
                      className="block w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 font-mono text-sm text-slate-600 focus:outline-none"
                    />
                    {generatingCode && (
                      <div className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
                    )}
                  </div>
                </div>
              </div>

              {/* Product Type */}
              <div>
                <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500">
                  Product Type <span className="text-red-500">*</span>
                </label>
                <select
                  required
                  value={formData.productType}
                  onChange={(e) => setFormData({ ...formData, productType: e.target.value })}
                  className="block w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-200"
                >
                  <option value="">Select product type...</option>
                  <option value="Gas">Gas</option>
                  <option value="Cylinder">Cylinder</option>
                  <option value="Tool">Tool</option>
                </select>
              </div>

              {/* Pricing */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                <p className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-500">Pricing Details</p>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-slate-600">
                      Cost Price (AED) <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      required
                      step="0.01"
                      min="0"
                      value={formData.costPrice}
                      onChange={(e) => handlePriceChange('costPrice', e.target.value)}
                      className="block w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-200"
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-slate-600">
                      Least Selling Price (AED) <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      required
                      step="0.01"
                      min="0"
                      value={formData.leastSellingPrice}
                      onChange={(e) => handlePriceChange('leastSellingPrice', e.target.value)}
                      className={`block w-full rounded-lg border bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200 ${
                        priceError ? 'border-red-300 focus:border-red-300' : 'border-slate-200 focus:border-slate-300'
                      }`}
                      placeholder="0.00"
                    />
                  </div>
                </div>
                {priceError && (
                  <p className="mt-2 text-xs text-red-600">{priceError}</p>
                )}
              </div>

              <div className="flex flex-col gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={resetForm}
                  className="rounded-lg border border-slate-200 px-5 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!!priceError}
                  className="rounded-lg bg-slate-800 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {editingId ? 'Update Product' : 'Save Product'}
                </button>
              </div>
            </form>
          </div>
        </div>
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

export default Products;
