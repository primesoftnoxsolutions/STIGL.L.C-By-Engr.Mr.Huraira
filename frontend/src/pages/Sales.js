import React, { useState, useEffect, useMemo, useRef } from 'react';
import api from '../utils/api';
import toast from 'react-hot-toast';
import { PlusIcon, TrashIcon, PrinterIcon, PencilSquareIcon, PencilIcon, DocumentTextIcon } from '@heroicons/react/24/outline';
import { DeliveryNoteContent } from '../components/DeliveryNote';
import { useAuth } from '../context/AuthContext';
import { formatCurrency, VAT_RATE } from '../utils/currency';
import InvoiceView from '../components/InvoiceView';
import InvoiceSuccessModal from '../components/InvoiceSuccessModal';
import CustomerSignaturePad from '../components/CustomerSignaturePad';
import ConfirmDialog from '../components/ConfirmDialog';
import SearchableSelect from '../components/SearchableSelect';
import { captureElementToPdf, runPdfDownload } from '../utils/pdfDownload';
import { getUaeDateKey } from '../utils/uaeDate';
import { buildCustomerRateKey } from '../utils/customerRate';

const SALE_TYPE_TO_INVENTORY_CATEGORY = {
  Gas: 'Full Cylinder',
  'Full Cylinder': 'Full Cylinder',
  'Empty Cylinder': 'Empty Cylinder',
  Tool: 'Tool'
};

const Sales = () => {
  const { isSuperAdmin, isManager, isEmployee, user } = useAuth();
  const canEditInvoices = isSuperAdmin;
  const canDeleteInvoices = isSuperAdmin;
  const [invoices, setInvoices] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [inventoryData, setInventoryData] = useState([]);
  const [customerRates, setCustomerRates] = useState({});
  const [priceAlert, setPriceAlert] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showInvoiceView, setShowInvoiceView] = useState(false);
  const [showInvoiceSuccess, setShowInvoiceSuccess] = useState(false);
  const [createdInvoice, setCreatedInvoice] = useState(null);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState(null);
  const [editingInvoice, setEditingInvoice] = useState(null);
  const [deliveryNoteInvoice, setDeliveryNoteInvoice] = useState(null);
  const [showCustomerSignature, setShowCustomerSignature] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [pendingDeleteIds, setPendingDeleteIds] = useState(new Set());
  const [gasSeriesStatus, setGasSeriesStatus] = useState({ loaded: false, configured: true, preview: null });
  const [showGasSeriesModal, setShowGasSeriesModal] = useState(false);
  const [gasSeriesInput, setGasSeriesInput] = useState('');
  const [gasSeriesSaving, setGasSeriesSaving] = useState(false);
  const [gasSeriesError, setGasSeriesError] = useState('');
  const savingRef = useRef(false);
  const pendingDeleteIdsRef = useRef(new Set());
  const deleteQueueRef = useRef(Promise.resolve());
  const deliveryNoteRef = useRef(null);
  const SALES_INVOICE_TIMEOUT_MS = 120000;
  const notifySalesMutation = () => window.dispatchEvent(new Event('sales:changed'));
  
  // Main form data
  const [formData, setFormData] = useState({
    customerId: '',
    invoiceDate: getUaeDateKey(),
    deliveryCharges: 0,
    paymentMethod: '',
    amountPaid: 0,
    items: []
  });
  
  // Current item being added
  const [currentItem, setCurrentItem] = useState({
    saleType: '',
    productId: '',
    productName: '',
    quantity: 1,
    unitPrice: 0,
    cylinderId: '',
    inventoryItemId: ''
  });
  
  const [, setSelectedProduct] = useState(null);
  const [editingItemIndex, setEditingItemIndex] = useState(null);
  
  const [confirmDialog, setConfirmDialog] = useState({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: null,
    type: 'warning'
  });

  useEffect(() => {
    fetchData();
    fetchGasSeriesStatus();
  }, []);

  useEffect(() => {
    if (isEmployee) {
      setCurrentItem((prev) => (prev.saleType ? prev : { ...prev, saleType: 'Gas' }));
    }
  }, [isEmployee]);

  useEffect(() => {
    if (isSuperAdmin && gasSeriesStatus.loaded && !gasSeriesStatus.configured) {
      setShowGasSeriesModal(true);
    }
    if (gasSeriesStatus.configured) {
      setShowGasSeriesModal(false);
    }
    if (gasSeriesStatus.configured) {
      setGasSeriesError('');
    }
  }, [isSuperAdmin, gasSeriesStatus.loaded, gasSeriesStatus.configured]);

  useEffect(() => {
    fetchCustomerRates(formData.customerId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.customerId]);

  useEffect(() => {
    if (!currentItem.productId) return;
    const minRate = getConfiguredItemRate(currentItem.productId, currentItem.saleType);
    if (minRate && parseFloat(currentItem.unitPrice) < minRate) {
      setCurrentItem((prev) => ({ ...prev, unitPrice: minRate }));
      setPriceAlert({ minRate, productName: currentItem.productName });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerRates]);

  // Real-time invoice summary calculation
  const invoiceSummary = useMemo(() => {
    const subtotal = formData.items.reduce((sum, item) => {
      return sum + (parseFloat(item.quantity) || 0) * (parseFloat(item.unitPrice) || 0);
    }, 0);

    const deliveryCharges = parseFloat(formData.deliveryCharges) || 0;
    const taxableAmount = subtotal + deliveryCharges;
    const vat = taxableAmount * VAT_RATE;
    const grandTotal = taxableAmount + vat;

    return {
      subtotal,
      deliveryCharges,
      vat,
      grandTotal
    };
  }, [formData.items, formData.deliveryCharges]);

  const fetchData = async () => {
    try {
      const [invoicesRes, customersRes, productsRes, inventoryRes] = await Promise.all([
        api.get('/sales-invoices', { params: { compact: 1 }, timeout: 20000 }),
        api.get('/customers'),
        api.get('/products'),
        api.get('/inventory')
      ]);
      setInvoices(invoicesRes.data.data);
      setCustomers(customersRes.data.data);
      setProducts(productsRes.data.data);
      setInventoryData(inventoryRes.data.data || []);
    } catch (error) {
      toast.error('Failed to fetch data');
    } finally {
      setLoading(false);
    }
  };

  const fetchGasSeriesStatus = async () => {
    try {
      const res = await api.get('/sales-invoices/gas-series');
      const data = res.data?.data || {};
      setGasSeriesStatus({
        loaded: true,
        configured: !!data.configured,
        preview: data.preview || null
      });
    } catch (error) {
      setGasSeriesStatus((prev) => ({ ...prev, loaded: true }));
    }
  };

  const saveGasSeries = async () => {
    const trimmed = gasSeriesInput.trim();
    if (!trimmed) {
      const message = 'Please enter a starting invoice number (e.g., INV-1001).';
      setGasSeriesError(message);
      toast.error(message);
      return;
    }
    if (!/\d+$/.test(trimmed)) {
      const message = 'Starting number must end with digits (e.g., INV-1001).';
      setGasSeriesError(message);
      toast.error(message);
      return;
    }
    setGasSeriesSaving(true);
    try {
      setGasSeriesError('');
      const response = await api.put('/sales-invoices/gas-series', {
        startingNumber: trimmed
      });
      if (response?.data?.success === false) {
        throw new Error(response?.data?.message || 'Failed to set invoice series');
      }
      toast.success('Invoice series updated');
      setGasSeriesInput('');
      setGasSeriesError('');
      await fetchGasSeriesStatus();
    } catch (error) {
      const message = error.response?.data?.message || error.message || 'Failed to set invoice series';
      setGasSeriesError(message);
      toast.error(message);
    } finally {
      setGasSeriesSaving(false);
    }
  };

  const fetchCustomerRates = async (customerId) => {
    if (!customerId) {
      setCustomerRates({});
      setPriceAlert(null);
      return;
    }
    try {
      const res = await api.get('/customer-item-rates', { params: { customerId } });
      const list = res.data?.data || [];
      const map = {};
      list.forEach((rate) => {
        const productId = rate.itemId || rate.product?.id;
        const rateKey = buildCustomerRateKey(rate.itemType, productId);
        const value = parseFloat(rate.rate);
        if (rateKey && Number.isFinite(value)) {
          map[rateKey] = value;
        }
      });
      setCustomerRates(map);
      setPriceAlert(null);
    } catch (error) {
      setCustomerRates({});
      setPriceAlert(null);
    }
  };

  const getConfiguredItemRate = (productId, saleType) => {
    if (!productId) return null;
    const rateKey = buildCustomerRateKey(saleType, productId);
    const rate = rateKey ? customerRates[rateKey] : null;
    const customerRate = Number.isFinite(rate) && rate > 0 ? rate : 0;
    const product = products.find((p) => p.id === productId);
    const leastSellingPrice = parseFloat(product?.leastSellingPrice);
    const leastPrice = Number.isFinite(leastSellingPrice) && leastSellingPrice > 0 ? leastSellingPrice : 0;
    if (customerRate > 0) return customerRate;
    return leastPrice > 0 ? leastPrice : null;
  };

  const ensurePriceAtOrAboveRate = (priceValue, productId, saleType, productName) => {
    const minRate = getConfiguredItemRate(productId, saleType);
    const parsed = parseFloat(priceValue);
    if (minRate && Number.isFinite(parsed) && parsed < minRate) {
      setPriceAlert({
        minRate,
        productName
      });
      return minRate;
    }
    setPriceAlert(null);
    return priceValue;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSaving) return;
    
    // Validation before showing signature modal
    if (!formData.customerId) {
      toast.error('Please select a customer');
      return;
    }
    if (formData.items.length === 0) {
      toast.error('Please add at least one item');
      return;
    }
    const invalidRateItem = formData.items.find((item) => {
      const minRate = getConfiguredItemRate(item.productId, item.saleType);
      return minRate && parseFloat(item.unitPrice) < minRate;
    });
    if (invalidRateItem) {
      const minRate = getConfiguredItemRate(invalidRateItem.productId, invalidRateItem.saleType);
      setPriceAlert({ minRate, productName: invalidRateItem.productName });
      toast.error(`Minimum allowed price for this item is AED ${minRate.toFixed(2)}.`);
      return;
    }
    if (!formData.paymentMethod) {
      toast.error('Please select a payment method');
      return;
    }

    // If Cash payment, validate full payment
    if (formData.paymentMethod === 'cash') {
      const paidAmount = parseFloat(formData.amountPaid) || 0;
      if (paidAmount < invoiceSummary.grandTotal) {
        toast.error(`For cash payment, amount must be at least AED ${invoiceSummary.grandTotal.toFixed(2)}`);
        return;
      }
    }
    
    // For new invoices, require customer signature
    if (!editingInvoice) {
      setShowCustomerSignature(true);
      return;
    }

    // For edits, submit without requiring new signature
    await submitInvoice(null, null);
  };

  const handleCustomerSignatureSave = async (signature, customerName) => {
    if (isSaving) return;
    setShowCustomerSignature(false);
    
    // Submit invoice with customer signature and name
    await submitInvoice(signature, customerName);
  };

  const submitInvoice = async (customerSig, customerName) => {
    if (savingRef.current) return;
    savingRef.current = true;
    setIsSaving(true);
    try {
      if (editingInvoice && !canEditInvoices) {
        toast.error('Only Super Admin can edit invoices');
        return;
      }
      // Determine payment status based on payment method
      const paidAmount = formData.paymentMethod === 'cash' ? invoiceSummary.grandTotal : 0;
      const paymentStatus = formData.paymentMethod === 'cash' ? 'paid' : 'pending';
      
      const invoiceData = {
        ...formData,
        status: 'active',
        paymentStatus,
        paidAmount,
        balanceAmount: invoiceSummary.grandTotal - paidAmount,
        employeeSignature: user?.signature || null,
        receivedBySignature: customerSig,
        receivedByName: customerName
      };

      if (editingInvoice) {
        // Update existing invoice
        const response = await api.put(
          `/sales-invoices/${editingInvoice.id}`,
          invoiceData,
          { timeout: SALES_INVOICE_TIMEOUT_MS }
        );
        if (response?.data?.success === false) {
          throw new Error(response?.data?.message || 'Failed to update invoice');
        }
        toast.success('Invoice updated successfully');
        fetchData();
        notifySalesMutation();
        resetForm();
      } else {
        // Create new invoice
        const response = await api.post(
          '/sales-invoices',
          invoiceData,
          { timeout: SALES_INVOICE_TIMEOUT_MS }
        );
        if (response?.data?.success === false) {
          throw new Error(response?.data?.message || 'Failed to create invoice');
        }
        const newInvoice = response?.data?.data || response?.data?.invoice;
        
        toast.success(formData.paymentMethod === 'cash' 
          ? 'Invoice created - Payment received!' 
          : 'Invoice created - Added to pending payments');
        
        // Show success modal with PDF/Print options
        if (newInvoice) {
          setCreatedInvoice(newInvoice);
          setShowInvoiceSuccess(true);
        }
        
        fetchData();
        notifySalesMutation();
        resetForm();
      }
    } catch (error) {
      toast.error(error.response?.data?.message || error.message || `Failed to ${editingInvoice ? 'update' : 'create'} invoice`);
    } finally {
      setIsSaving(false);
      savingRef.current = false;
    }
  };

  const handleDelete = async (id) => {
    if (!canDeleteInvoices) {
      toast.error('Only Super Admin can delete invoices');
      return;
    }
    if (pendingDeleteIdsRef.current.has(id)) {
      toast.error('This invoice delete is already in progress');
      return;
    }

    const markDeletePending = (invoiceId) => {
      pendingDeleteIdsRef.current.add(invoiceId);
      setPendingDeleteIds(new Set(pendingDeleteIdsRef.current));
    };

    const clearDeletePending = (invoiceId) => {
      pendingDeleteIdsRef.current.delete(invoiceId);
      setPendingDeleteIds(new Set(pendingDeleteIdsRef.current));
    };

    setConfirmDialog({
      isOpen: true,
      title: 'Delete Invoice',
      message: 'Are you sure you want to delete this invoice? This will reverse all stock changes.',
      type: 'danger',
      onConfirm: () => {
        markDeletePending(id);

        // Queue deletes so rapid clicks are accepted but processed safely one-by-one.
        deleteQueueRef.current = deleteQueueRef.current.then(async () => {
          try {
            const response = await api.delete(`/sales-invoices/${id}`, { timeout: SALES_INVOICE_TIMEOUT_MS });
            const message = response?.data?.message || 'Invoice deleted and stock restored';
            toast.success(message);
            setInvoices((prev) => prev.filter((invoice) => invoice.id !== id));
            notifySalesMutation();
          } catch (error) {
            const apiMessage = error?.response?.data?.message;
            const apiDetails = error?.response?.data?.error;
            toast.error(
              (apiMessage && apiMessage !== 'Server error' ? apiMessage : null) ||
              apiDetails ||
              'Failed to delete invoice'
            );
          } finally {
            clearDeletePending(id);
          }
        });

        setConfirmDialog((prev) => ({ ...prev, isOpen: false, onConfirm: null }));
      }
    });
  };

  // Normalize product names by removing leading type word and punctuation
  const normalizeName = (name = '') => {
    if (!name) return '';
    const parts = name.trim().split(/\s+/);
    if (parts.length > 1 && /^(cylinder|gas|tool)$/i.test(parts[0])) {
      parts.shift();
    }
    return parts.join(' ')
      .replace(/[^a-z0-9\s]/gi, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  };

  const getInventoryCategoryBySaleType = (saleType) => SALE_TYPE_TO_INVENTORY_CATEGORY[saleType] || null;

  const getInventoryItemForEntry = (entry) => {
    if (!entry?.saleType) return null;

    if (entry.inventoryItemId) {
      const inventoryItem = inventoryData.find((item) => item.id === entry.inventoryItemId);
      if (inventoryItem) return inventoryItem;
    }

    const category = getInventoryCategoryBySaleType(entry.saleType);
    if (!category) return null;

    if (entry.productId) {
      const inventoryByProductId = inventoryData.find(
        (item) => item.inventoryCategory === category && item.productId === entry.productId
      );
      if (inventoryByProductId) return inventoryByProductId;
    }

    const targetName = normalizeName(
      entry.productName || products.find((product) => product.id === entry.productId)?.productName
    );
    if (!targetName) return null;

    return inventoryData.find(
      (item) => item.inventoryCategory === category && normalizeName(item.product?.productName) === targetName
    ) || null;
  };

  const getEntryInventoryKey = (entry) => {
    const inventoryItem = getInventoryItemForEntry(entry);
    if (inventoryItem?.id) {
      return `inv:${inventoryItem.id}`;
    }

    const category = getInventoryCategoryBySaleType(entry?.saleType);
    if (!category || !entry?.productId) return null;
    return `fallback:${category}:${entry.productId}`;
  };

  const getReservedQuantityForEntry = (entry, excludeIndex = null) => {
    const targetKey = getEntryInventoryKey(entry);
    if (!targetKey) return 0;

    return formData.items.reduce((sum, line, index) => {
      if (excludeIndex !== null && index === excludeIndex) return sum;
      if (getEntryInventoryKey(line) !== targetKey) return sum;
      return sum + (parseInt(line.quantity, 10) || 0);
    }, 0);
  };

  const getRemainingStockForEntry = (entry, { excludeIndex = null } = {}) => {
    const inventoryItem = getInventoryItemForEntry(entry);
    if (!inventoryItem) return 0;
    const baseStock = parseInt(inventoryItem.stockQuantity, 10) || 0;
    const reservedQty = getReservedQuantityForEntry(entry, excludeIndex);
    return Math.max(0, baseStock - reservedQty);
  };

  // Get filtered products based on sale type and draft allocations.
  const getFilteredProducts = () => {
    if (!currentItem.saleType) return [];

    const typeMapping = {
      Gas: 'Gas',
      'Full Cylinder': 'Cylinder',
      'Empty Cylinder': 'Cylinder',
      Tool: 'Tool'
    };
    const targetType = typeMapping[currentItem.saleType];
    if (!targetType) return [];

    return products
      .filter((product) => product.productType === targetType)
      .map((product) => {
        const remainingStock = getRemainingStockForEntry(
          {
            saleType: currentItem.saleType,
            productId: product.id,
            productName: product.productName
          },
          { excludeIndex: editingItemIndex }
        );
        return {
          ...product,
          availableStock: remainingStock
        };
      })
      .filter((product) => product.availableStock > 0 || product.id === currentItem.productId);
  };

  // Get available inventory for selected sale type
  const getAvailableInventory = () => {
    if (!currentItem.saleType) return [];

    const category = getInventoryCategoryBySaleType(currentItem.saleType);
    if (!category) return [];

    return inventoryData
      .filter((item) => item.inventoryCategory === category)
      .map((item) => ({
        ...item,
        remainingStock: getRemainingStockForEntry(
          {
            saleType: currentItem.saleType,
            productId: item.productId,
            productName: item.product?.productName,
            inventoryItemId: item.id
          },
          { excludeIndex: editingItemIndex }
        )
      }))
      .filter((item) => item.remainingStock > 0 || item.id === currentItem.inventoryItemId);
  };

  // Get selected inventory item stock
  const getSelectedInventoryStock = () => {
    return getRemainingStockForEntry(currentItem, { excludeIndex: editingItemIndex });
  };

  // Handle sale type change
  const handleSaleTypeChange = (saleType) => {
    if (isEmployee && saleType !== 'Gas') {
      return;
    }
    setCurrentItem({
      ...currentItem,
      saleType,
      productId: '',
      productName: '',
      unitPrice: 0,
      inventoryItemId: ''
    });
    setSelectedProduct(null);
    setPriceAlert(null);
  };

  // Handle product selection
  const handleProductSelect = (productId) => {
    if (!productId) {
      setSelectedProduct(null);
      setCurrentItem((prev) => ({
        ...prev,
        productId: '',
        productName: '',
        unitPrice: 0,
        inventoryItemId: ''
      }));
      setPriceAlert(null);
      return;
    }

    const product = products.find(p => p.id === productId);
    setSelectedProduct(product);
    if (product) {
      // Find inventory item for this product based on selected sale type/category.
      const category = getInventoryCategoryBySaleType(currentItem.saleType);
      const targetName = normalizeName(product.productName);
      const inventoryItem = inventoryData.find(i => 
        i.inventoryCategory === category &&
        (i.productId === product.id || normalizeName(i.product?.productName) === targetName)
      );

      const minRate = getConfiguredItemRate(product.id, currentItem.saleType);
      const fallbackPrice = parseFloat(product.leastSellingPrice) || 0;
      const defaultPrice = Number.isFinite(minRate) ? minRate : fallbackPrice;
      setCurrentItem((prev) => ({
        ...prev,
        productId: product.id,
        productName: product.productName,
        unitPrice: defaultPrice,
        inventoryItemId: inventoryItem?.id || ''
      }));
      setPriceAlert(null);
    }
  };

  // Handle inventory selection for Gas sales
  const handleInventorySelect = (inventoryItemId) => {
    if (!inventoryItemId) {
      setSelectedProduct(null);
      setCurrentItem((prev) => ({
        ...prev,
        inventoryItemId: '',
        productId: '',
        productName: '',
        unitPrice: 0
      }));
      setPriceAlert(null);
      return;
    }

    const inventoryItem = inventoryData.find(i => i.id === inventoryItemId);
    if (inventoryItem && inventoryItem.product) {
      const minRate = getConfiguredItemRate(inventoryItem.product.id, currentItem.saleType);
      const fallbackPrice = parseFloat(inventoryItem.product.leastSellingPrice) || 0;
      const defaultPrice = Number.isFinite(minRate) ? minRate : fallbackPrice;
      setSelectedProduct(inventoryItem.product);
      setCurrentItem((prev) => ({
        ...prev,
        inventoryItemId: inventoryItemId,
        productId: inventoryItem.product.id,
        productName: inventoryItem.product.productName,
        unitPrice: defaultPrice
      }));
      setPriceAlert(null);
    }
  };

  // Validate current item
  const validateCurrentItem = () => {
    if (!currentItem.saleType) {
      toast.error('Please select a sale type');
      return false;
    }
    if (!currentItem.productName) {
      toast.error('Please select a product');
      return false;
    }
    if (!currentItem.quantity || parseInt(currentItem.quantity) < 1) {
      toast.error('Quantity must be greater than zero');
      return false;
    }
    if (!currentItem.unitPrice || parseFloat(currentItem.unitPrice) <= 0) {
      toast.error('Please enter a valid price');
      return false;
    }
    const minRate = getConfiguredItemRate(currentItem.productId, currentItem.saleType);
    if (minRate && parseFloat(currentItem.unitPrice) < minRate) {
      setPriceAlert({ minRate, productName: currentItem.productName });
      toast.error(`Minimum allowed price for this item is AED ${minRate.toFixed(2)}.`);
      return false;
    }
    
    // Check stock availability
    const availableStock = getSelectedInventoryStock();
    if (currentItem.saleType === 'Gas' || currentItem.saleType === 'Full Cylinder' || 
        currentItem.saleType === 'Empty Cylinder' || currentItem.saleType === 'Tool') {
      if (availableStock <= 0) {
        toast.error('No stock available for selected item');
        return false;
      }
      if (parseInt(currentItem.quantity) > availableStock) {
        toast.error(`Insufficient stock! Available: ${availableStock}`);
        return false;
      }
    }

    // Ensure product and inventory item (when both present) match by normalized base name
    if (currentItem.productId && currentItem.inventoryItemId) {
      const prod = products.find(p => p.id === currentItem.productId);
      const inv = inventoryData.find(i => i.id === currentItem.inventoryItemId);
      if (prod && inv && normalizeName(prod.productName) !== normalizeName(inv.product?.productName)) {
        toast.error('Selected product and selected cylinder do not match');
        return false;
      }
    }
    
    return true;
  };

  // Add item to list
  const handleAddItem = () => {
    if (!validateCurrentItem()) return;
    
    // Merge only truly-identical lines. Keep Empty/Full/Tool/Gas separate.
    const getMergeKey = (line) => ([
      line.saleType || '',
      line.productId || '',
      line.inventoryItemId || '',
      line.cylinderId || ''
    ].join('|'));
    const currentKey = getMergeKey(currentItem);
    const existingIndex = formData.items.findIndex((item, index) =>
      index !== editingItemIndex && getMergeKey(item) === currentKey
    );
    
    if (existingIndex !== -1 && editingItemIndex === null) {
      // Merge quantities
      const updatedItems = [...formData.items];
      updatedItems[existingIndex].quantity = parseInt(updatedItems[existingIndex].quantity) + parseInt(currentItem.quantity);
      setFormData({ ...formData, items: updatedItems });
      toast.success('Quantity merged with existing item');
    } else if (editingItemIndex !== null) {
      // Update existing item
      const updatedItems = [...formData.items];
      updatedItems[editingItemIndex] = { ...currentItem };
      setFormData({ ...formData, items: updatedItems });
      setEditingItemIndex(null);
      toast.success('Item updated');
    } else {
      // Add new item
      setFormData({ ...formData, items: [...formData.items, { ...currentItem }] });
      toast.success('Item added');
    }
    
    resetCurrentItem();
  };

  // Edit item
  const handleEditItem = (index) => {
    const item = formData.items[index];
    const minRate = getConfiguredItemRate(item.productId, item.saleType);
    const nextPrice = minRate && parseFloat(item.unitPrice) < minRate ? minRate : item.unitPrice;
    const resolvedInventoryItem = getInventoryItemForEntry(item);
    if (minRate && parseFloat(item.unitPrice) < minRate) {
      setPriceAlert({ minRate, productName: item.productName });
    } else {
      setPriceAlert(null);
    }
    setCurrentItem({
      ...item,
      inventoryItemId: item.inventoryItemId || resolvedInventoryItem?.id || '',
      unitPrice: nextPrice
    });
    setSelectedProduct(products.find(p => p.id === item.productId) || null);
    setEditingItemIndex(index);
  };

  // Delete item
  const handleDeleteItem = (index) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Remove Item',
      message: 'Are you sure you want to remove this item from the invoice?',
      type: 'danger',
      onConfirm: () => {
        const updatedItems = formData.items.filter((_, i) => i !== index);
        setFormData({ ...formData, items: updatedItems });
        toast.success('Item removed');
        setConfirmDialog({ ...confirmDialog, isOpen: false });
      }
    });
  };

  // Reset current item
  const resetCurrentItem = () => {
    setCurrentItem({
      saleType: isEmployee ? 'Gas' : '',
      productId: '',
      productName: '',
      quantity: 1,
      unitPrice: 0,
      cylinderId: '',
      inventoryItemId: ''
    });
    setSelectedProduct(null);
    setEditingItemIndex(null);
    setPriceAlert(null);
  };

  const resetForm = () => {
    setFormData({
      customerId: '',
      invoiceDate: getUaeDateKey(),
      deliveryCharges: 0,
      paymentMethod: '',
      amountPaid: 0,
      items: []
    });
    resetCurrentItem();
    setEditingInvoice(null);
    setShowModal(false);
  };

  const handleViewInvoice = (invoiceId) => {
    setSelectedInvoiceId(invoiceId);
    setShowInvoiceView(true);
  };

  const handleDownloadDeliveryNote = async (invoiceId) => {
    await runPdfDownload(async () => {
      const response = await api.get(`/sales-invoices/${invoiceId}`);
      const invoice = response.data?.data;
      if (!invoice || !Array.isArray(invoice.items)) {
        throw new Error('No delivery note data to download');
      }

      setDeliveryNoteInvoice(invoice);
      await new Promise((resolve) => setTimeout(resolve, 200));

      const element = deliveryNoteRef.current;
      if (!element) {
        throw new Error('Delivery note content not found');
      }

      await captureElementToPdf({
        element,
        filename: `delivery_note_${invoice.invoiceNumber}.pdf`,
        orientation: 'p',
        widthOverride: '210mm'
      });

      setDeliveryNoteInvoice(null);
    });
  };

  const handleEditInvoice = async (invoice) => {
    if (!canEditInvoices) {
      toast.error('Only Super Admin can edit invoices');
      return;
    }
    setConfirmDialog({
      isOpen: true,
      title: 'Edit Invoice',
      message: 'Are you sure you want to edit this invoice? Changes will update all calculations including stock and customer balance.',
      type: 'warning',
      onConfirm: async () => {
        try {
          // Fetch full invoice details
          const response = await api.get(`/sales-invoices/${invoice.id}`);
          const fullInvoice = response.data.data;
          
          setEditingInvoice(fullInvoice);
          setFormData({
            customerId: fullInvoice.customerId,
            invoiceDate: fullInvoice.invoiceDate.split('T')[0],
            deliveryCharges: fullInvoice.deliveryCharges || 0,
            paymentMethod: fullInvoice.paymentMethod || (fullInvoice.paymentStatus === 'paid' ? 'cash' : 'credit'),
            amountPaid: fullInvoice.paidAmount || 0,
            items: fullInvoice.items.map(item => ({
              saleType: item.saleType || 'Tool',
              productId: item.productId || '',
              cylinderId: item.cylinderId || '',
              productName: item.productName,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              inventoryItemId: item.inventoryItemId || ''
            }))
          });
          setShowModal(true);
        } catch (error) {
          toast.error('Failed to load invoice details');
        }
        setConfirmDialog({ ...confirmDialog, isOpen: false });
      }
    });
  };

  // Calculate item total
  const calculateItemTotal = () => {
    return (parseFloat(currentItem.quantity) || 0) * (parseFloat(currentItem.unitPrice) || 0);
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
            <h1 className="text-3xl font-bold text-gray-900">Sales Invoices</h1>
            <p className="mt-1 text-sm text-gray-600">Track and manage all customer invoices with quick actions.</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            {isSuperAdmin && (
              <button
                onClick={() => setShowGasSeriesModal(true)}
                className="w-full sm:w-auto flex h-10 items-center justify-center rounded-xl border border-orange-200 bg-white/90 px-4 text-sm font-medium text-orange-700 shadow-sm transition hover:bg-orange-50"
              >
                Invoice Series
              </button>
            )}
            {(isEmployee || isManager || isSuperAdmin) && (
              <button
                onClick={() => setShowModal(true)}
                className="w-full sm:w-auto flex h-10 items-center justify-center gap-2 rounded-xl bg-primary-600 px-4 text-sm font-semibold text-white shadow transition hover:bg-primary-700"
              >
                <PlusIcon className="h-4 w-4" />
                Create Invoice
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white/95 shadow-xl shadow-slate-200/70">
        <div className="block sm:hidden border-b border-slate-200 bg-gradient-to-r from-blue-50 to-slate-100 px-4 py-2 text-center text-xs font-medium text-slate-600">
          Swipe to view all columns
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[1100px] w-full">
            <thead className="bg-gradient-to-r from-slate-100 to-blue-50">
              <tr>
                <th className="px-5 py-3 sm:py-4 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-600">Invoice #</th>
                <th className="px-5 py-3 sm:py-4 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-600">Customer</th>
                <th className="px-5 py-3 sm:py-4 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-600">Reference Name</th>
                <th className="px-5 py-3 sm:py-4 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-600">Created At</th>
                <th className="px-5 py-3 sm:py-4 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-600">Total</th>
                <th className="px-5 py-3 sm:py-4 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-600">Payment</th>
                <th className="px-5 py-3 sm:py-4 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-600">Balance</th>
                <th className="px-5 py-3 sm:py-4 text-right text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/80 bg-white">
              {invoices
                .sort((a, b) => {
                  // Extract numeric part from invoice number (e.g., INV000001 -> 1)
                  const numA = parseInt(a.invoiceNumber?.replace(/\D/g, '') || 0);
                  const numB = parseInt(b.invoiceNumber?.replace(/\D/g, '') || 0);
                  // Sort in descending order (newest first)
                  return numB - numA;
                })
                .map((invoice) => {
                  const employeeName = invoice.employee?.fullName || invoice.employee?.email || 'N/A';
                  const createdAtLabel = invoice.createdAt ? new Date(invoice.createdAt).toLocaleString() : 'N/A';
                  return (
                <tr key={invoice.id} className="transition-colors duration-200 hover:bg-blue-50/35">
                  <td className="whitespace-nowrap px-5 py-3 sm:py-4">
                    <span className="inline-flex rounded-md bg-blue-50 px-2 py-1 text-xs font-mono font-bold tracking-wide text-primary-600 ring-1 ring-blue-100">
                      {invoice.invoiceNumber}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 sm:py-4 text-sm text-slate-800">
                    {invoice.customer?.name || 'N/A'}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 sm:py-4 text-sm text-slate-700">
                    {employeeName}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 sm:py-4 text-sm text-slate-700">
                    {createdAtLabel}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 sm:py-4 text-sm font-bold tabular-nums text-slate-800">
                    AED {parseFloat(invoice.total).toFixed(2)}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 sm:py-4">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-sm font-semibold ${
                      invoice.paymentStatus === 'paid' ? 'bg-green-50 text-green-700' :
                      invoice.paymentStatus === 'partial' ? 'bg-yellow-50 text-yellow-700' :
                      'bg-red-50 text-red-700'
                    }`}>
                      {invoice.paymentStatus === 'paid' ? 'Paid' :
                       invoice.paymentStatus === 'partial' ? 'Partial' :
                       'Pending'}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 sm:py-4 text-sm tabular-nums">
                    {parseFloat(invoice.balanceAmount || 0) > 0 ? (
                      <span className="font-semibold text-red-600">
                        AED {parseFloat(invoice.balanceAmount || 0).toFixed(2)}
                      </span>
                    ) : (
                      <span className="font-semibold text-green-600">-</span>
                    )}
                  </td>
                    <td className="whitespace-nowrap px-5 py-3 sm:py-4 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          onClick={() => handleViewInvoice(invoice.id)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-blue-200 bg-blue-50 text-blue-600 transition hover:bg-blue-100"
                          title="Print Again"
                        >
                          <PrinterIcon className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDownloadDeliveryNote(invoice.id)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-orange-200 bg-orange-50 text-orange-600 transition hover:bg-orange-100"
                          title="Download Delivery Note"
                        >
                          <DocumentTextIcon className="h-4 w-4" />
                        </button>
                        {canEditInvoices && (
                          <button
                            onClick={() => handleEditInvoice(invoice)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-purple-200 bg-purple-50 text-purple-600 transition hover:bg-purple-100"
                            title="Edit Invoice"
                          >
                            <PencilSquareIcon className="h-4 w-4" />
                          </button>
                        )}
                        {canDeleteInvoices && (
                          <button
                            onClick={() => handleDelete(invoice.id)}
                            disabled={pendingDeleteIds.has(invoice.id)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-red-200 bg-red-50 text-red-600 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                            title="Delete Invoice"
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
        {invoices.length === 0 && (
          <div className="py-14 text-center">
            <p className="text-sm font-medium text-slate-500">No invoices found</p>
          </div>
        )}
      </div>

      {/* Create Invoice Modal */}
      {showModal && (
        <div className="form-modal-overlay">
          <div className="form-modal-wrap px-2 sm:px-4 py-3 sm:py-4">
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75" onClick={resetForm}></div>
            
            <div className="form-modal-panel form-modal-body relative bg-white rounded-lg max-w-4xl w-full p-3 sm:p-6">
              <h3 className="text-base sm:text-lg font-medium text-gray-900 mb-3 sm:mb-4">
                {editingInvoice ? `Edit Invoice #${editingInvoice.invoiceNumber}` : 'Create Sales Invoice'}
              </h3>
              
              <form onSubmit={handleSubmit} noValidate className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                  <div>
                    <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">Customer <span className="text-red-500">*</span></label>
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
                      inputClassName="block w-full px-2 sm:px-3 py-2 text-sm border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                      menuClassName="absolute z-50 mt-1 w-full rounded-lg border border-gray-300 bg-white shadow-lg max-h-52 overflow-y-auto"
                    />
                  </div>

                  <div>
                    <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">Invoice Date</label>
                    <input
                      type="date"
                      required
                      value={formData.invoiceDate}
                      onChange={(e) => setFormData({ ...formData, invoiceDate: e.target.value })}
                      className="block w-full px-2 sm:px-3 py-2 text-sm border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                    />
                  </div>
                </div>

                {/* Add Item Section */}
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                    {/* Sale Type Selection */}
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Sale Type <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={currentItem.saleType}
                        onChange={(e) => handleSaleTypeChange(e.target.value)}
                        disabled={isEmployee}
                        className="block w-full px-2 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500 disabled:bg-gray-100"
                      >
                        <option value="">Select Type...</option>
                        <option value="Gas">🔥 Gas</option>
                        {!isEmployee && (
                          <>
                            <option value="Full Cylinder">🟢 Full Cylinder</option>
                            <option value="Empty Cylinder">⚪ Empty Cylinder</option>
                            <option value="Tool">🔧 Tool</option>
                          </>
                        )}
                      </select>
                      {currentItem.saleType === 'Gas' && (
                        <p className="text-xs text-blue-600 mt-1">
                          {isEmployee ? '💡 Uses assigned gas stock' : null}
                        </p>
                      )}
                    </div>
                    {/* Product/Inventory Selection based on Sale Type */}
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        {currentItem.saleType === 'Gas'
                          ? (isEmployee ? 'Select Assigned Gas' : 'Select Full Cylinder')
                          : 'Product'} <span className="text-red-500">*</span>
                      </label>
                      {currentItem.saleType === 'Gas' ? (
                        <SearchableSelect
                          value={currentItem.inventoryItemId}
                          options={getAvailableInventory()}
                          onChange={(nextValue) => handleInventorySelect(nextValue)}
                          placeholder={isEmployee ? 'Search gas...' : 'Search cylinder...'}
                          getOptionValue={(item) => item.id}
                          getOptionLabel={(item) => item.product?.productName || 'Item'}
                          getOptionSubLabel={(item) => `Remaining: ${item.remainingStock ?? 0}`}
                          getOptionSearchText={(item) =>
                            `${item.product?.productName || ''} ${item.product?.productCode || ''} ${item.remainingStock ?? 0}`
                          }
                          disabled={!currentItem.saleType}
                          inputClassName="block w-full px-2 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500 disabled:bg-gray-100"
                          menuClassName="absolute z-50 mt-1 w-full rounded-lg border border-gray-300 bg-white shadow-lg max-h-52 overflow-y-auto"
                          noResultsText="No stock available"
                        />
                      ) : (
                        <SearchableSelect
                          value={currentItem.productId}
                          options={getFilteredProducts()}
                          onChange={(nextValue) => handleProductSelect(nextValue)}
                          placeholder="Search product..."
                          getOptionValue={(product) => product.id}
                          getOptionLabel={(product) => product.productName}
                          getOptionSubLabel={(product) => `Remaining: ${product.availableStock ?? 0}`}
                          getOptionSearchText={(product) =>
                            `${product.productName || ''} ${product.productCode || ''} ${product.productType || ''} ${product.availableStock ?? 0}`
                          }
                          disabled={!currentItem.saleType}
                          inputClassName="block w-full px-2 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500 disabled:bg-gray-100"
                          menuClassName="absolute z-50 mt-1 w-full rounded-lg border border-gray-300 bg-white shadow-lg max-h-52 overflow-y-auto"
                          noResultsText="No matching products"
                        />
                      )}
                      {currentItem.saleType && getAvailableInventory().length === 0 && (
                        <p className="text-xs text-red-500 mt-1">No stock available</p>
                      )}
                    </div>

                    {/* Quantity */}
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Quantity <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="number"
                        min="1"
                        max={getSelectedInventoryStock() || undefined}
                        value={currentItem.quantity}
                        onChange={(e) => setCurrentItem({ ...currentItem, quantity: e.target.value })}
                        className="block w-full px-2 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                      />
                      {currentItem.inventoryItemId && (
                        <p className="text-xs text-blue-600 mt-1">
                          Remaining now: {getSelectedInventoryStock()}
                        </p>
                      )}
                    </div>

                    {/* Unit Price */}
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Unit Price (AED) <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min={getConfiguredItemRate(currentItem.productId, currentItem.saleType) || 0}
                        value={currentItem.unitPrice}
                        onChange={(e) => {
                          const nextValue = e.target.value;
                          if (nextValue === '') {
                            setCurrentItem({ ...currentItem, unitPrice: '' });
                            setPriceAlert(null);
                            return;
                          }
                          const normalized = ensurePriceAtOrAboveRate(
                            nextValue,
                            currentItem.productId,
                            currentItem.saleType,
                            currentItem.productName
                          );
                          setCurrentItem({ ...currentItem, unitPrice: normalized });
                        }}
                        className="block w-full px-2 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                      />
                      {getConfiguredItemRate(currentItem.productId, currentItem.saleType) && (
                        <p className="mt-1 text-[11px] text-slate-500">
                          Minimum price: AED {getConfiguredItemRate(currentItem.productId, currentItem.saleType).toFixed(2)}
                        </p>
                      )}
                      {priceAlert && (
                        <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] text-amber-700">
                          Minimum allowed price for this item is AED {priceAlert.minRate.toFixed(2)}.
                        </div>
                      )}
                    </div>

                    {/* Add Button */}
                    <div className="flex items-end">
                      <button
                        type="button"
                        onClick={handleAddItem}
                        disabled={!currentItem.productName || !currentItem.saleType}
                        className="w-full px-4 py-2 bg-green-600 text-white rounded-md text-xs font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                      >
                        <PlusIcon className="h-4 w-4 mr-1" />
                        {editingItemIndex !== null ? 'Update' : 'Add'}
                      </button>
                    </div>
                  </div>

                  {/* Item Total Preview */}
                  {currentItem.productName && (
                    <div className="flex justify-between items-center mt-4 pt-3 border-t border-gray-200">
                      <div className="text-sm text-gray-600">
                        Item Total: <span className="font-bold text-gray-900">AED {calculateItemTotal().toFixed(2)}</span>
                      </div>
                      {editingItemIndex !== null && (
                        <button
                          type="button"
                          onClick={resetCurrentItem}
                          className="px-3 py-1 border border-gray-300 rounded-md text-xs font-medium text-gray-700 hover:bg-gray-50"
                        >
                          Cancel Edit
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Items Summary Table */}
                {formData.items.length > 0 && (
                  <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                    <div className="bg-gradient-to-r from-green-600 to-teal-600 px-4 py-3">
                      <h4 className="text-white font-semibold flex items-center">
                        🛒 Invoice Items ({formData.items.length})
                      </h4>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">#</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
                            <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Qty</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Rate</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total</th>
                            <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {formData.items.map((item, index) => (
                            <tr key={index} className="hover:bg-gray-50">
                              <td className="px-4 py-3 text-sm text-gray-500">{index + 1}</td>
                              <td className="px-4 py-3">
                                <span className={`px-2 py-1 text-xs rounded-full ${
                                  item.saleType === 'Gas' ? 'bg-orange-100 text-orange-800' :
                                  item.saleType === 'Full Cylinder' ? 'bg-green-100 text-green-800' :
                                  item.saleType === 'Empty Cylinder' ? 'bg-gray-100 text-gray-800' :
                                  'bg-blue-100 text-blue-800'
                                }`}>
                                  {item.saleType}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                <div className="text-sm font-medium text-gray-900">{item.productName}</div>
                              </td>
                              <td className="px-4 py-3 text-sm text-center font-medium text-gray-900">{item.quantity}</td>
                              <td className="px-4 py-3 text-sm text-right text-gray-600">
                                AED {parseFloat(item.unitPrice).toFixed(2)}
                              </td>
                              <td className="px-4 py-3 text-sm text-right font-semibold text-gray-900">
                                AED {(parseFloat(item.unitPrice) * parseInt(item.quantity)).toFixed(2)}
                              </td>
                              <td className="px-4 py-3 text-center">
                                <button
                                  type="button"
                                  onClick={() => handleEditItem(index)}
                                  className="text-blue-600 hover:text-blue-800 mr-2"
                                  title="Edit"
                                >
                                  <PencilIcon className="h-4 w-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteItem(index)}
                                  className="text-red-600 hover:text-red-800"
                                  title="Delete"
                                >
                                  <TrashIcon className="h-4 w-4" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Delivery Charges */}
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
                    Delivery Charges (Optional)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.deliveryCharges}
                    onChange={(e) => setFormData({ ...formData, deliveryCharges: parseFloat(e.target.value) || 0 })}
                    placeholder="0.00"
                    className="block w-full sm:w-1/3 px-2 sm:px-3 py-2 text-sm border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">Delivery charges will be included in VAT calculation</p>
                </div>

                {/* Payment Method Section */}
                {formData.items.length > 0 && (
                  <div className="bg-white border border-gray-200 rounded-lg p-3 sm:p-6 shadow-sm">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="black text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
                          💳 Payment Type <span className="text-red-500">*</span>
                        </label>
                        <select
                          value={formData.paymentMethod}
                          onChange={(e) => {
                            const method = e.target.value;
                            setFormData({
                              ...formData,
                              paymentMethod: method,
                              amountPaid: method === 'cash' ? invoiceSummary.grandTotal : 0
                            });
                          }}
                          className="block w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white hover:bg-gray-50 transition-colors"
                        >
                          <option value="">Select Payment Type...</option>
                          <option value="cash">💵 Cash Payment (Full payment required)</option>
                          <option value="credit">📋 Credit (Pending)</option>
                        </select>
                        <p className="text-xs text-gray-500 mt-1.5">
                          {formData.paymentMethod === 'cash' && '✓ Amount will be collected immediately'}
                          {formData.paymentMethod === 'credit' && '✓ Invoice will be added to pending payments'}
                          {!formData.paymentMethod && 'Select how the customer will pay'}
                        </p>
                      </div>

                      {/* Divider for visual separation */}
                      <div className="hidden sm:block sm:col-span-1"></div>
                    </div>

                    {/* Cash Amount Input */}
                    {formData.paymentMethod === 'cash' && (
                      <div className="mt-4 p-4 bg-green-50 rounded-lg border border-green-200">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-900 mb-1.5">
                              Amount Received (AED) <span className="text-red-500">*</span>
                            </label>
                            <input
                              type="number"
                              step="0.01"
                              min={invoiceSummary.grandTotal}
                              value={formData.amountPaid}
                              onChange={(e) => setFormData({ ...formData, amountPaid: parseFloat(e.target.value) || 0 })}
                              className="block w-full px-3 py-2.5 text-sm border border-green-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white"
                            />
                            <p className="text-xs text-green-700 mt-1">Minimum: <strong>AED {invoiceSummary.grandTotal.toFixed(2)}</strong></p>
                          </div>
                          {parseFloat(formData.amountPaid) > invoiceSummary.grandTotal && (
                            <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
                              <p className="text-xs text-amber-700 font-medium">Change to Return:</p>
                              <p className="text-lg font-bold text-amber-900 mt-0.5">
                                AED {(parseFloat(formData.amountPaid) - invoiceSummary.grandTotal).toFixed(2)}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                  </div>
                )}

                {/* Real-Time Invoice Summary */}
                {formData.items.length > 0 && (
                  <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-lg p-3 sm:p-6 shadow-sm relative z-10">
                    <h4 className="text-sm sm:text-base font-bold text-gray-900 mb-3 flex items-center gap-2">
                      📊 Invoice Summary
                    </h4>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-700">Subtotal:</span>
                        <span className="font-semibold text-gray-900">{formatCurrency(invoiceSummary.subtotal)}</span>
                      </div>
                      {invoiceSummary.deliveryCharges > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-700">Delivery Charges:</span>
                          <span className="font-semibold text-gray-900">{formatCurrency(invoiceSummary.deliveryCharges)}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-sm border-t pt-2">
                        <span className="text-blue-700 font-medium">VAT (5%):</span>
                        <span className="font-semibold text-blue-900">{formatCurrency(invoiceSummary.vat)}</span>
                      </div>
                      <div className="flex justify-between text-base sm:text-lg font-bold border-t-2 border-blue-600 pt-2">
                        <span className="text-blue-900">Grand Total:</span>
                        <span className="text-blue-900">{formatCurrency(invoiceSummary.grandTotal)}</span>
                      </div>
                    </div>
                    <div className="mt-3 pt-3 border-t border-blue-200">
                      <p className="text-xs text-blue-700">
                        ℹ️ VAT is automatically calculated on subtotal + delivery charges
                      </p>
                    </div>
                  </div>
                )}

                <div className="flex flex-col sm:flex-row sm:justify-end gap-2 sm:gap-3 mt-4 sm:mt-6 pt-3 sm:pt-4 border-t">
                  <button
                    type="button"
                    onClick={resetForm}
                    className="w-full sm:w-auto px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 order-2 sm:order-1"
                  >
                    Cancel
                  </button>
                    <button
                      type="submit"
                      disabled={formData.items.length === 0 || isSaving}
                      className="w-full sm:w-auto px-6 py-2 bg-primary-600 text-white rounded-md text-sm font-medium hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed order-1 sm:order-2"
                    >
                      {isSaving ? 'Saving...' : (editingInvoice ? 'Update Invoice' : `Create Invoice (${formData.items.length} items)`)}
                    </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Sales Invoice Series Modal */}
      {showGasSeriesModal && isSuperAdmin && (
        <div className="form-modal-overlay">
          <div className="form-modal-wrap px-4 py-6">
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm"></div>
            <div className="form-modal-panel form-modal-panel-compact relative bg-white rounded-xl w-full max-w-lg p-4 sm:p-6 shadow-2xl">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Set Sales Invoice Series</h3>
                <button
                  onClick={() => setShowGasSeriesModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <span className="text-xl">×</span>
                </button>
              </div>

              <p className="text-sm text-gray-600 mb-4">
                This series is used for all sales invoices (Gas, Cylinder, and Tool).
              </p>

              {gasSeriesStatus.preview && (
                <div className="mb-4 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-blue-800">
                  Next invoice will be: <strong>{gasSeriesStatus.preview}</strong>
                </div>
              )}

              <label className="block text-sm font-medium text-gray-700 mb-2">
                Starting Invoice Number
              </label>
              <input
                type="text"
                value={gasSeriesInput}
                onChange={(e) => {
                  setGasSeriesInput(e.target.value);
                  if (gasSeriesError) setGasSeriesError('');
                }}
                placeholder="e.g., INV-1001"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent"
              />
              {gasSeriesError && (
                <p className="text-xs text-red-600 mt-2">{gasSeriesError}</p>
              )}
              <p className="text-xs text-gray-500 mt-2">
                Enter the full starting number. The numeric part will auto-increment for each invoice.
              </p>

              <div className="mt-5 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowGasSeriesModal(false)}
                  className="px-4 py-2 text-sm border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={saveGasSeries}
                  disabled={gasSeriesSaving}
                  className="px-4 py-2 text-sm bg-orange-600 text-white rounded-md hover:bg-orange-700 disabled:opacity-60"
                >
                  {gasSeriesSaving ? 'Saving...' : 'Save Series'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Customer Signature Modal */}
      {showCustomerSignature && (
        <CustomerSignaturePad
          onSave={handleCustomerSignatureSave}
          onClose={() => setShowCustomerSignature(false)}
        />
      )}

      {/* Invoice Success Modal - Shows immediately after creation with PDF/Print */}
      {showInvoiceSuccess && createdInvoice && (
        <InvoiceSuccessModal
          invoice={createdInvoice}
          onClose={() => {
            setShowInvoiceSuccess(false);
            setCreatedInvoice(null);
          }}
        />
      )}

      {/* Invoice View/Print Modal - For viewing existing invoices */}
      {showInvoiceView && (
        <InvoiceView
          invoiceId={selectedInvoiceId}
          onClose={() => {
            setShowInvoiceView(false);
            setSelectedInvoiceId(null);
          }}
        />
      )}

      {/* Hidden Delivery Note Content for PDF */}
      {deliveryNoteInvoice && (
        <div
          ref={deliveryNoteRef}
          style={{
            position: 'fixed',
            left: '-10000px',
            top: '-10000px',
            width: '210mm',
            background: '#ffffff',
            visibility: 'hidden',
            pointerEvents: 'none'
          }}
        >
          <DeliveryNoteContent
            invoice={deliveryNoteInvoice}
            totalItemsDelivered={
              deliveryNoteInvoice.items?.reduce(
                (sum, item) => sum + (parseInt(item.quantity || 0, 10) || 0),
                0
              ) || 0
            }
          />
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

export default Sales;






