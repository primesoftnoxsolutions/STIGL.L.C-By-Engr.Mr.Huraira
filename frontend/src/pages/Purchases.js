import React, { useState, useEffect, useMemo } from 'react';
import api from '../utils/api';
import toast from 'react-hot-toast';
import { PlusIcon, TrashIcon, XMarkIcon, PencilIcon, ChevronDownIcon, ChevronRightIcon, MagnifyingGlassIcon, ArrowDownTrayIcon, DocumentTextIcon, BuildingOfficeIcon, CheckCircleIcon, CalendarDaysIcon } from '@heroicons/react/24/outline';
import { useAuth } from '../context/AuthContext';
import ConfirmDialog from '../components/ConfirmDialog';
import SearchableSelect from '../components/SearchableSelect';
import { captureHtmlToPdf, runPdfDownload } from '../utils/pdfDownload';
const Purchases = () => {
  const { isSuperAdmin, isEmployee } = useAuth();
  const [purchases, setPurchases] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [availableEmptyCylinders, setAvailableEmptyCylinders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [expandedPurchases, setExpandedPurchases] = useState(new Set());
  
  // Search and filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [filterFromDate, setFilterFromDate] = useState('');
  const [filterToDate, setFilterToDate] = useState('');
  
  // Main form data
  const [formData, setFormData] = useState({
    supplierId: '',
    supplierInvoiceNumber: '',
    notes: '',
    items: []
  });
  
  // Current item being added
  const [currentItem, setCurrentItem] = useState({
    purchaseType: 'Gas',
    cylinderCondition: '',
    productId: '',
    relatedProductId: '',
    quantity: 1,
    costPrice: ''
  });
  
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [, setSelectedRelatedProduct] = useState(null);
  const [editingItemIndex, setEditingItemIndex] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editPurchaseData, setEditPurchaseData] = useState({
    id: '',
    supplierInvoiceNumber: '',
    notes: '',
    items: []
  });
  
  const [confirmDialog, setConfirmDialog] = useState({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: null,
    type: 'warning',
    confirmText: 'Confirm',
    cancelText: 'Cancel'
  });
  useEffect(() => {
    fetchData();
  }, []);
  const getItemCostPrice = (item) => {
    const customPrice = parseFloat(item.costPrice);
    if (Number.isFinite(customPrice) && customPrice >= 0) {
      return customPrice;
    }
    const product = products.find((p) => p.id === item.productId);
    return product ? parseFloat(product.costPrice) || 0 : 0;
  };

  // Calculate purchase summary with VAT
  const purchaseSummary = useMemo(() => {
    const subtotal = formData.items.reduce((sum, item) => {
      const costPrice = getItemCostPrice(item);
      return sum + (costPrice * parseInt(item.quantity, 10));
    }, 0);
    const vat = subtotal * 0.05; // 5% VAT
    const grandTotal = subtotal + vat;
    return {
      subtotal,
      vat,
      grandTotal
    };
  }, [formData.items, products]);
  const fetchData = async () => {
    try {
      const [purchasesRes, suppliersRes, productsRes, emptyCylindersRes] = await Promise.all([
        api.get('/purchases'),
        api.get('/suppliers'),
        api.get('/products'),
        api.get('/inventory/available-empty-cylinders')
      ]);
      setPurchases(purchasesRes.data.data);
      setSuppliers(suppliersRes.data.data);
      setProducts(productsRes.data.data);
      setAvailableEmptyCylinders(emptyCylindersRes.data.data || []);
    } catch (error) {
      toast.error('Failed to fetch data');
    } finally {
      setLoading(false);
    }
  };
  // Get available products based on purchase type
  const getAvailableProducts = () => {
    if (!currentItem.purchaseType) return [];
    
    let typeFilter = '';
    if (currentItem.purchaseType === 'Gas') typeFilter = 'Gas';
    else if (currentItem.purchaseType === 'Cylinder') typeFilter = 'Cylinder';
    else if (currentItem.purchaseType === 'Tool') typeFilter = 'Tool';
    
    return products.filter(p => p.productType === typeFilter);
  };
  // Normalize product names by removing leading type words and punctuation
  const normalizeName = (name = '') => {
    if (!name) return '';
    // Remove only the first word if it's a known type, otherwise keep full name
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
  // Get related products (for gas purchase or full cylinder)
  const getRelatedProducts = () => {
    const normalizeName = (name = '') => {
      return name
        .replace(/\b(cylinder|gas)\b/gi, '')
        .replace(/[^a-z0-9\s]/gi, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
    };
    if (currentItem.purchaseType === 'Gas') {
      // For gas purchase, show ONLY empty cylinders with available stock
      // If a gas product is selected, only show empty cylinders that match the gas base name
      const selectedGas = products.find(p => p.id === currentItem.productId);
      if (selectedGas) {
        const target = normalizeName(selectedGas.productName);
        return availableEmptyCylinders
          .filter(item => normalizeName(item.product?.productName) === target)
          .map(item => ({ ...item.product, availableStock: item.stockQuantity }));
      }
      return availableEmptyCylinders.map(item => ({ ...item.product, availableStock: item.stockQuantity }));
    } else if (currentItem.purchaseType === 'Cylinder' && currentItem.cylinderCondition === 'Full') {
      // For full cylinder, show gas products that share the same base name as the selected cylinder
      const selectedCylinder = products.find(p => p.id === currentItem.productId);
      if (selectedCylinder) {
        const target = normalizeName(selectedCylinder.productName);
        return products.filter(p => p.productType === 'Gas' && normalizeName(p.productName) === target);
      }
      // If no cylinder selected yet, return all gas products
      return products.filter(p => p.productType === 'Gas');
    }
    return [];
  };
  // Get selected cylinder's available stock
  const getSelectedCylinderStock = () => {
    if (currentItem.purchaseType === 'Gas' && currentItem.relatedProductId) {
      const cylinder = availableEmptyCylinders.find(c => c.product?.id === currentItem.relatedProductId);
      return cylinder?.stockQuantity || 0;
    }
    return 0;
  };

  const handlePurchaseProductSelect = (productId) => {
    if (!productId) {
      setSelectedProduct(null);
      setSelectedRelatedProduct(null);
      setCurrentItem((prev) => ({ ...prev, productId: '', relatedProductId: '', costPrice: '' }));
      return;
    }

    const product = products.find((p) => p.id === productId);
    setSelectedProduct(product || null);
    setCurrentItem((prev) => {
      const updated = {
        ...prev,
        productId,
        relatedProductId: '',
        costPrice: product ? String(parseFloat(product.costPrice) || '') : ''
      };
      if (!product) {
        setSelectedRelatedProduct(null);
        return updated;
      }

      if (updated.purchaseType === 'Gas') {
        const target = normalizeName(product.productName);
        const matches = availableEmptyCylinders
          .filter((item) => normalizeName(item.product?.productName) === target)
          .map((item) => item.product.id);

        if (matches.length === 1) {
          updated.relatedProductId = matches[0];
          setSelectedRelatedProduct(products.find((p) => p.id === matches[0]) || null);
        } else {
          setSelectedRelatedProduct(null);
        }
      } else if (updated.purchaseType === 'Cylinder' && updated.cylinderCondition === 'Full') {
        const target = normalizeName(product.productName);
        const matches = products
          .filter((p) => p.productType === 'Gas' && normalizeName(p.productName) === target)
          .map((p) => p.id);
        if (matches.length === 1) {
          updated.relatedProductId = matches[0];
          setSelectedRelatedProduct(products.find((p) => p.id === matches[0]) || null);
        } else {
          setSelectedRelatedProduct(null);
        }
      } else {
        setSelectedRelatedProduct(null);
      }
      return updated;
    });
  };

  const handleRelatedProductSelect = (relatedProductId) => {
    const relatedProducts = getRelatedProducts();
    const product = relatedProducts.find((p) => p.id === relatedProductId) || null;
    setSelectedRelatedProduct(product);
    setCurrentItem((prev) => ({ ...prev, relatedProductId: relatedProductId || '' }));
  };
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.supplierId) {
      toast.error('Please select a supplier');
      return;
    }
    
    if (formData.items.length === 0) {
      toast.error('Please add at least one item to the purchase');
      return;
    }
    try {
      // Convert items to the format expected by backend
      const purchaseData = {
        supplierId: formData.supplierId,
        supplierInvoiceNumber: formData.supplierInvoiceNumber,
        notes: formData.notes,
        items: formData.items.map(item => ({
          purchaseType: item.purchaseType,
          cylinderCondition: item.cylinderCondition || null,
          productId: item.productId,
          relatedProductId: item.relatedProductId || null,
          quantity: parseInt(item.quantity, 10),
          costPrice: getItemCostPrice(item)
        }))
      };
      await api.post('/purchases', purchaseData);
      toast.success('Purchase created and confirmed successfully');
      fetchData();
      resetForm();
    } catch (error) {
      const errorMessage = error.response?.data?.message || 'Failed to create purchase';
      
      // Check if it's the insufficient empty cylinders error
      if (errorMessage.includes('insufficient empty cylinders')) {
        // Extract quantities from error message
        const requiredMatch = errorMessage.match(/Required: (\d+)/);
        const availableMatch = errorMessage.match(/Available: (\d+)/);
        const required = requiredMatch ? requiredMatch[1] : 'N/A';
        const available = availableMatch ? availableMatch[1] : '0';
        
        const formattedMessage = (
          <div className="space-y-4">
            <div className="flex items-center justify-center">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
                <span className="text-3xl">🚫</span>
              </div>
            </div>
            <div className="text-center space-y-2">
              <p className="text-gray-700 font-medium">
                Gas cannot be purchased without empty cylinders available in inventory.
              </p>
              <div className="bg-gradient-to-r from-red-50 to-orange-50 border border-red-200 rounded-lg p-4 mt-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-gray-600">Required:</p>
                    <p className="text-2xl font-bold text-red-600">{required}</p>
                  </div>
                  <div>
                    <p className="text-gray-600">Available:</p>
                    <p className="text-2xl font-bold text-green-600">{available}</p>
                  </div>
                </div>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mt-3">
                <p className="text-sm text-blue-800">
                  <strong>💡 Solution:</strong> Please purchase empty cylinders first, then proceed with gas purchases.
                </p>
              </div>
            </div>
          </div>
        );
        setConfirmDialog({
          isOpen: true,
          title: '🚫 Empty Cylinders Required',
          message: formattedMessage,
          type: 'warning',
          confirmText: 'Got It',
          cancelText: null,
          onConfirm: () => {
            setConfirmDialog({ ...confirmDialog, isOpen: false });
          }
        });
      } else {
        toast.error(errorMessage);
      }
    }
  };
  const openEditPurchaseModal = async (purchaseId) => {
    try {
      const response = await api.get(`/purchases/${purchaseId}`);
      const purchase = response?.data?.data;
      if (!purchase) {
        toast.error('Purchase not found');
        return;
      }

      setEditPurchaseData({
        id: purchase.id,
        supplierInvoiceNumber: purchase.supplierInvoiceNumber || '',
        notes: purchase.notes || '',
        items: (purchase.items || []).map((item) => ({
          id: item.id,
          productName: item.product?.productName || 'N/A',
          purchaseType: item.purchaseType,
          cylinderCondition: item.cylinderCondition || '',
          quantity: parseInt(item.quantity, 10) || 0,
          costPrice: parseFloat(item.costPrice || item.product?.costPrice || 0)
        }))
      });
      setShowEditModal(true);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to load purchase details');
    }
  };

  const handleEditPurchaseItemQty = (itemId, nextQty) => {
    const parsedQty = Math.max(1, parseInt(nextQty, 10) || 1);
    setEditPurchaseData((prev) => ({
      ...prev,
      items: prev.items.map((item) => (
        item.id === itemId ? { ...item, quantity: parsedQty } : item
      ))
    }));
  };

  const closeEditPurchaseModal = () => {
    setShowEditModal(false);
    setEditPurchaseData({
      id: '',
      supplierInvoiceNumber: '',
      notes: '',
      items: []
    });
  };

  const editSummary = useMemo(() => {
    const subtotal = editPurchaseData.items.reduce((sum, item) => (
      sum + (item.costPrice * item.quantity)
    ), 0);
    const vat = subtotal * 0.05;
    return {
      subtotal,
      vat,
      grandTotal: subtotal + vat
    };
  }, [editPurchaseData.items]);

  const handleUpdatePurchase = async (e) => {
    e.preventDefault();
    if (!editPurchaseData.id) return;
    if (!editPurchaseData.supplierInvoiceNumber.trim()) {
      toast.error('Supplier invoice number is required');
      return;
    }
    if (!editPurchaseData.items.length) {
      toast.error('Purchase must contain at least one item');
      return;
    }

    try {
      const payload = {
        supplierInvoiceNumber: editPurchaseData.supplierInvoiceNumber,
        notes: editPurchaseData.notes,
        items: editPurchaseData.items.map((item) => ({
          id: item.id,
          quantity: parseInt(item.quantity, 10)
        }))
      };
      await api.put(`/purchases/${editPurchaseData.id}`, payload);
      toast.success('Purchase updated successfully');
      closeEditPurchaseModal();
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to update purchase');
    }
  };
  // Validate current item
  const validateCurrentItem = () => {
    if (!currentItem.purchaseType) {
      toast.error('Please select a purchase type');
      return false;
    }
    if (!currentItem.productId) {
      toast.error('Please select a product');
      return false;
    }
    if (currentItem.purchaseType === 'Cylinder' && !currentItem.cylinderCondition) {
      toast.error('Please select cylinder condition');
      return false;
    }
    // For Gas purchases, a related empty cylinder must be selected
    if (currentItem.purchaseType === 'Gas' && !currentItem.relatedProductId) {
      toast.error('Please select the related empty cylinder for gas purchase');
      return false;
    }
    // For Full cylinder purchases, a related gas must be selected
    if (currentItem.purchaseType === 'Cylinder' && currentItem.cylinderCondition === 'Full' && !currentItem.relatedProductId) {
      toast.error('Please select the gas for full cylinder purchase');
      return false;
    }
    if (!currentItem.quantity || parseInt(currentItem.quantity, 10) < 1) {
      toast.error('Quantity must be greater than zero');
      return false;
    }
    const parsedCostPrice = parseFloat(currentItem.costPrice);
    if (!Number.isFinite(parsedCostPrice) || parsedCostPrice < 0) {
      toast.error('Please enter a valid cost price');
      return false;
    }
    // Validate Gas purchase quantity against available empty cylinders
    if (currentItem.purchaseType === 'Gas') {
      const availableStock = getSelectedCylinderStock();
      if (parseInt(currentItem.quantity) > availableStock) {
        toast.error(`Insufficient empty cylinders. Available: ${availableStock}, Requested: ${currentItem.quantity}`);
        return false;
      }
    }
    // Validate name matching between product and related product when applicable
    if ((currentItem.purchaseType === 'Gas' || (currentItem.purchaseType === 'Cylinder' && currentItem.cylinderCondition === 'Full')) && currentItem.relatedProductId) {
      const main = products.find(p => p.id === currentItem.productId);
      const related = products.find(p => p.id === currentItem.relatedProductId);
      if (!main || !related) {
        toast.error('Selected related product not found');
        return false;
      }
      if (normalizeName(main.productName) !== normalizeName(related.productName)) {
        toast.error('Selected product and related product do not match');
        return false;
      }
    }
    return true;
  };
  // Add item to list
  const handleAddItem = () => {
    if (!validateCurrentItem()) return;
    
    // Get product details for display
    const product = products.find(p => p.id === currentItem.productId);
    if (!product) {
      toast.error('Selected product not found');
      return;
    }
    const itemToSave = {
      ...currentItem,
      costPrice: parseFloat(currentItem.costPrice)
    };
    // Check for duplicate
    const existingIndex = formData.items.findIndex(item => 
      item.productId === itemToSave.productId && 
      item.relatedProductId === itemToSave.relatedProductId &&
      item.cylinderCondition === itemToSave.cylinderCondition
    );
    
    if (existingIndex !== -1 && editingItemIndex === null) {
      // Merge quantities
      const updatedItems = [...formData.items];
      updatedItems[existingIndex].quantity = parseInt(updatedItems[existingIndex].quantity, 10) + parseInt(itemToSave.quantity, 10);
      updatedItems[existingIndex].costPrice = itemToSave.costPrice;
      setFormData({ ...formData, items: updatedItems });
      toast.success('Quantity merged with existing item');
    } else if (editingItemIndex !== null) {
      // Update existing item
      const updatedItems = [...formData.items];
      updatedItems[editingItemIndex] = itemToSave;
      setFormData({ ...formData, items: updatedItems });
      setEditingItemIndex(null);
      toast.success('Item updated');
    } else {
      // Add new item
      setFormData({ ...formData, items: [...formData.items, itemToSave] });
      toast.success('Item added');
    }
    
    resetCurrentItem();
  };
  // Edit item
  const handleEditItem = (index) => {
    const item = formData.items[index];
    const product = products.find((p) => p.id === item.productId);
    setCurrentItem({
      ...item,
      costPrice: item.costPrice != null && item.costPrice !== ''
        ? String(item.costPrice)
        : String(parseFloat(product?.costPrice) || '')
    });
    setSelectedProduct(products.find(p => p.id === item.productId) || null);
    setSelectedRelatedProduct(products.find(p => p.id === item.relatedProductId) || null);
    setEditingItemIndex(index);
  };
  // Delete item
  const handleDeleteItem = (index) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Remove Item',
      message: 'Are you sure you want to remove this item from the purchase?',
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
      purchaseType: 'Gas',
      cylinderCondition: '',
      productId: '',
      relatedProductId: '',
      quantity: 1,
      costPrice: ''
    });
    setSelectedProduct(null);
    setSelectedRelatedProduct(null);
    setEditingItemIndex(null);
  };
  const resetForm = () => {
    setFormData({
      supplierId: '',
      supplierInvoiceNumber: '',
      notes: '',
      items: []
    });
    resetCurrentItem();
    setShowModal(false);
  };
  // Toggle expand/collapse for purchase
  const toggleExpand = (purchaseId) => {
    const newExpanded = new Set(expandedPurchases);
    if (newExpanded.has(purchaseId)) {
      newExpanded.delete(purchaseId);
    } else {
      newExpanded.add(purchaseId);
    }
    setExpandedPurchases(newExpanded);
  };
  const getStatusColor = (status) => {
    if (status === 'pending') {
      return 'bg-green-100 text-green-800';
    }
    switch (status) {
      case 'confirmed': return 'bg-green-100 text-green-800';
      case 'cancelled': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };
  const getPurchaseTypeColor = (type) => {
    switch (type) {
      case 'Gas': return 'bg-blue-100 text-blue-800';
      case 'Cylinder': return 'bg-purple-100 text-purple-800';
      case 'Tool': return 'bg-orange-100 text-orange-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };
  // Calculate item total
  const calculateItemTotal = () => {
    if (!currentItem.productId || !currentItem.quantity) return 0;
    const costPrice = parseFloat(currentItem.costPrice);
    const resolvedCost = Number.isFinite(costPrice) ? costPrice : getItemCostPrice(currentItem);
    return resolvedCost * parseInt(currentItem.quantity, 10);
  };

  const getPurchaseAmounts = (purchase) => {
    const headerSubtotal = parseFloat(purchase.subtotal);
    const headerVat = parseFloat(purchase.vat);
    const headerGrandTotal = parseFloat(purchase.grandTotal);

    if (Number.isFinite(headerSubtotal) && headerSubtotal >= 0) {
      const subtotal = headerSubtotal;
      const vat = Number.isFinite(headerVat) ? headerVat : subtotal * 0.05;
      const total = Number.isFinite(headerGrandTotal) ? headerGrandTotal : subtotal + vat;
      return { subtotal, vat, total };
    }

    const items = purchase.items || [];
    const subtotal = items.reduce((sum, item) => {
      const costPrice = parseFloat(item.costPrice ?? item.product?.costPrice ?? 0);
      return sum + costPrice * parseInt(item.quantity || 0, 10);
    }, 0);
    const vat = subtotal * 0.05;
    return { subtotal, vat, total: subtotal + vat };
  };
  // Download PDF for a single purchase
  const handleDownloadPurchasePDF = async (purchase) => {
    await runPdfDownload(async () => {
      if (!purchase?.id) {
        throw new Error('Purchase data is missing');
      }
      const res = await api.get(`/purchases/${purchase.id}`);
      const purchaseData = res.data?.data;
      if (!purchaseData || !purchaseData.items || purchaseData.items.length === 0) {
        throw new Error('No purchase data to download');
      }
      const supplier = purchaseData.supplier || {};
      const items = purchaseData.items || [];
      const invoiceNumberRaw = (purchaseData.supplierInvoiceNumber || '').trim();
      const displayInvoiceNumber = invoiceNumberRaw || purchaseData.purchaseNumber || 'N/A';
      const safeInvoicePart = (invoiceNumberRaw || purchaseData.purchaseNumber || 'purchase')
        .replace(/[^a-z0-9_-]+/gi, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 50);
      const { subtotal, vat, total } = getPurchaseAmounts(purchaseData);
      const rowsHtml = items.map((item, idx) => {
        const product = item.product || {};
        const costPrice = parseFloat(item.costPrice ?? item.product?.costPrice ?? 0);
        const itemTotal = costPrice * parseInt(item.quantity || 0, 10);
        return `
                    <tr>
                      <td>${idx + 1}</td>
                      <td>${product.productName || 'N/A'}</td>
                      <td>${item.purchaseType || product.productType || 'N/A'}</td>
                      <td style="text-align: center;">${item.quantity || 0}</td>
                      <td style="text-align: right;">${costPrice.toFixed(2)}</td>
                      <td style="text-align: right;">${itemTotal.toFixed(2)}</td>
                    </tr>
                  `;
      }).join('');
      const htmlContent = `
        <html>
          <head>
            <title>Purchase - ${displayInvoiceNumber}</title>
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
                gap: 20px;
                margin-bottom: 30px;
                font-size: 14px;
              }
              .detail-section {
                border: 1px solid #e5e7eb;
                padding: 15px;
                border-radius: 8px;
                background: #f9fafb;
              }
              .detail-section h3 {
                margin: 0 0 10px 0;
                font-size: 12px;
                color: #6b7280;
                text-transform: uppercase;
                font-weight: 600;
              }
              .detail-row {
                display: flex;
                justify-content: space-between;
                margin-bottom: 8px;
                font-size: 14px;
              }
              .detail-label {
                color: #6b7280;
              }
              .detail-value {
                font-weight: 600;
                color: #111827;
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
            </style>
          </head>
          <body>
            <div class="header">
              <h1>PURCHASE ORDER</h1>
              <p style="margin: 5px 0; color: #6b7280;">Invoice #: <strong>${displayInvoiceNumber}</strong></p>
            </div>
            <div class="details">
              <div class="detail-section">
                <h3>Supplier Information</h3>
                <div class="detail-row">
                  <span class="detail-label">Supplier:</span>
                  <span class="detail-value">${supplier.supplierName || 'N/A'}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">TR Number:</span>
                  <span class="detail-value">${supplier.trNumber || 'N/A'}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Phone:</span>
                  <span class="detail-value">${supplier.phone || 'N/A'}</span>
                </div>
              </div>
              <div class="detail-section">
                <h3>Purchase Details</h3>
                <div class="detail-row">
                  <span class="detail-label">Purchase #:</span>
                  <span class="detail-value">${purchaseData.purchaseNumber || 'N/A'}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Date:</span>
                  <span class="detail-value">${new Date(purchaseData.createdAt).toLocaleDateString('en-GB')}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Status:</span>
                  <span class="detail-value">${purchaseData.status || 'N/A'}</span>
                </div>
              </div>
            </div>
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Product</th>
                  <th>Type</th>
                  <th style="text-align: center;">Qty</th>
                  <th style="text-align: right;">Unit Cost (AED)</th>
                  <th style="text-align: right;">Total (AED)</th>
                </tr>
              </thead>
              <tbody>
                ${rowsHtml}
              </tbody>
            </table>
            <div class="total-section">
              <div class="total-row">
                <span class="total-label">Subtotal:</span>
                <span class="total-value">AED ${subtotal.toFixed(2)}</span>
              </div>
              <div class="total-row">
                <span class="total-label">VAT (5%):</span>
                <span class="total-value">AED ${vat.toFixed(2)}</span>
              </div>
              <div class="total-row grand">
                <span class="total-label">Total:</span>
                <span class="total-value">AED ${total.toFixed(2)}</span>
              </div>
            </div>
            <div class="footer">
              <p>Generated on ${new Date().toLocaleDateString('en-GB')} at ${new Date().toLocaleTimeString()}</p>
              <p>(c) SYED TAYYAB INDUSTRIAL GASES LLC</p>
            </div>
          </body>
        </html>
      `;
      const filename = `purchase_${safeInvoicePart || 'purchase'}.pdf`;
      await captureHtmlToPdf({
        html: htmlContent,
        filename,
        orientation: 'p',
        widthOverride: '210mm'
      });
    });
  };
  // Download PDF for multiple purchases based on date filter
  const handleDownloadPurchasesPDF = async () => {
    await runPdfDownload(async () => {
      if (!filterFromDate || !filterToDate) {
        throw new Error('Please select both From and To dates');
      }
      const res = await api.get('/purchases');
      const purchasesList = Array.isArray(res.data?.data) ? res.data.data : [];
      const fromDate = new Date(filterFromDate);
      fromDate.setHours(0, 0, 0, 0);
      const toDate = new Date(filterToDate);
      toDate.setHours(23, 59, 59, 999);
      const filteredPurchases = purchasesList.filter((purchase) => {
        const purchaseDate = new Date(purchase.createdAt);
        return purchaseDate >= fromDate && purchaseDate <= toDate;
      });
      if (filteredPurchases.length === 0) {
        throw new Error('No purchases found for the selected date range');
      }
      let grandSubtotal = 0;
      let grandVAT = 0;
      let grandTotal = 0;
      const purchaseDetails = filteredPurchases.map((purchase) => {
        const { subtotal, vat, total } = getPurchaseAmounts(purchase);
        grandSubtotal += subtotal;
        grandVAT += vat;
        grandTotal += total;
        return { purchase, subtotal, vat, total };
      });
      const rowsHtml = purchaseDetails.map(({ purchase, subtotal, vat, total }) => {
        const invoiceNumber = purchase.supplierInvoiceNumber || purchase.purchaseNumber || 'N/A';
        const supplierName = purchase.supplier?.supplierName || 'N/A';
        const trNumber = purchase.supplier?.trNumber || 'N/A';
        return `
                    <tr>
                      <td>${new Date(purchase.createdAt).toLocaleDateString('en-GB')}</td>
                      <td><strong>${invoiceNumber}</strong></td>
                      <td>
                        <div>${supplierName}</div>
                        <div style="font-size: 11px; color: #6b7280;">TR: ${trNumber}</div>
                      </td>
                      <td style="text-align: right;">${subtotal.toFixed(2)}</td>
                      <td style="text-align: right;">${vat.toFixed(2)}</td>
                      <td style="text-align: right;"><strong>${total.toFixed(2)}</strong></td>
                    </tr>
                  `;
      }).join('');
      const htmlContent = `
        <html>
          <head>
            <title>Purchase Report</title>
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
              .filter-info {
                background: #f3f4f6;
                padding: 15px;
                border-radius: 8px;
                margin-bottom: 20px;
                font-size: 14px;
              }
              .filter-info p {
                margin: 5px 0;
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
                font-size: 13px;
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
                font-size: 16px;
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
            </style>
          </head>
          <body>
            <div class="header">
              <h1>PURCHASE REPORT</h1>
            </div>
            <div class="filter-info">
              <p><strong>Date Range:</strong> ${new Date(filterFromDate).toLocaleDateString('en-GB')} to ${new Date(filterToDate).toLocaleDateString('en-GB')}</p>
              <p><strong>Total Purchases:</strong> ${filteredPurchases.length}</p>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Invoice Number</th>
                  <th>Supplier (TR Number)</th>
                  <th style="text-align: right;">Amount (AED)</th>
                  <th style="text-align: right;">VAT 5% (AED)</th>
                  <th style="text-align: right;">Total (AED)</th>
                </tr>
              </thead>
              <tbody>
                ${rowsHtml}
              </tbody>
            </table>
            <div class="total-section">
              <div class="total-row">
                <span class="total-label">Total Amount (Without VAT):</span>
                <span class="total-value">AED ${grandSubtotal.toFixed(2)}</span>
              </div>
              <div class="total-row">
                <span class="total-label">Total VAT (5%):</span>
                <span class="total-value">AED ${grandVAT.toFixed(2)}</span>
              </div>
              <div class="total-row grand">
                <span class="total-label">Grand Total:</span>
                <span class="total-value">AED ${grandTotal.toFixed(2)}</span>
              </div>
            </div>
            <div class="footer">
              <p>Generated on ${new Date().toLocaleDateString('en-GB')} at ${new Date().toLocaleTimeString()}</p>
              <p>(c) SYED TAYYAB INDUSTRIAL GASES LLC</p>
            </div>
          </body>
        </html>
      `;
      const filename = `purchase_report_${filterFromDate}_to_${filterToDate}.pdf`;
      await captureHtmlToPdf({
        html: htmlContent,
        filename,
        orientation: 'p',
        widthOverride: '210mm'
      });
    });
  };
  // Filter purchases based on search query
  const filteredPurchases = useMemo(() => {
    return purchases.filter(purchase => {
      const matchesSearch = !searchQuery ||
        purchase.purchaseNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
        purchase.supplierInvoiceNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
        purchase.supplier?.supplierName.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesSearch;
    });
  }, [purchases, searchQuery]);
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
          <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">Purchase Management</h1>
          <p className="mt-1 text-sm text-slate-500">
            Manage purchase invoices, supplier records, and inventory intake.
          </p>
        </div>
        {isSuperAdmin && (
          <button
            type="button"
            onClick={() => setShowModal(true)}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:from-violet-700 hover:to-blue-700"
          >
            <PlusIcon className="h-4 w-4" />
            Create Purchase
          </button>
        )}
      </div>

      <div className="dash-card relative overflow-hidden p-4 sm:p-5">
        <div className="pointer-events-none absolute -left-8 -top-8 h-24 w-24 rounded-full bg-violet-200/40 blur-2xl" />
        <div className="relative space-y-4">
          <div className="relative">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search by invoice number or supplier name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-11 pr-4 text-sm text-slate-700 placeholder:text-slate-400 focus:border-violet-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-violet-500/20"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_1fr_auto] lg:items-end">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-600">From Date</label>
              <div className="relative">
                <CalendarDaysIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="date"
                  value={filterFromDate}
                  onChange={(e) => setFilterFromDate(e.target.value)}
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 text-sm text-slate-700 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
                />
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-600">To Date</label>
              <div className="relative">
                <CalendarDaysIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="date"
                  value={filterToDate}
                  onChange={(e) => setFilterToDate(e.target.value)}
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 text-sm text-slate-700 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
                />
              </div>
            </div>
            <button
              type="button"
              onClick={handleDownloadPurchasesPDF}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-violet-300 bg-white px-5 text-sm font-semibold text-violet-700 transition hover:bg-violet-50"
            >
              <DocumentTextIcon className="h-4 w-4" />
              Export PDF
            </button>
          </div>
        </div>
      </div>

      <div className="dash-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-[1080px] w-full">
            <thead className="bg-violet-50/80">
              <tr>
                <th className="w-12 px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-violet-700 sm:py-4" />
                <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-violet-700 sm:py-4">Invoice</th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-violet-700 sm:py-4">Supplier</th>
                <th className="px-5 py-3 text-center text-[11px] font-semibold uppercase tracking-wide text-violet-700 sm:py-4">Items</th>
                <th className="px-5 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-violet-700 sm:py-4">Amount</th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-violet-700 sm:py-4">Status</th>
                {isSuperAdmin && <th className="px-5 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-violet-700 sm:py-4">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {filteredPurchases.map((purchase) => {
                const isExpanded = expandedPurchases.has(purchase.id);
                const itemCount = purchase.items?.length || 0;
                const statusLabel = purchase.status === 'pending' ? 'confirmed' : purchase.status;

                return (
                  <React.Fragment key={purchase.id}>
                    <tr className="transition-colors hover:bg-violet-50/30">
                      <td className="px-4 py-3 sm:py-4">
                        <button
                          type="button"
                          onClick={() => toggleExpand(purchase.id)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:border-violet-200 hover:text-violet-700 focus:outline-none"
                          title={isExpanded ? 'Collapse' : 'Expand'}
                        >
                          {isExpanded ? (
                            <ChevronDownIcon className="h-4 w-4" />
                          ) : (
                            <ChevronRightIcon className="h-4 w-4" />
                          )}
                        </button>
                      </td>
                      <td className="whitespace-nowrap px-5 py-3 sm:py-4">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-100 text-violet-600">
                            <DocumentTextIcon className="h-4 w-4" />
                          </div>
                          <span className="text-sm font-semibold text-slate-800">
                            {purchase.supplierInvoiceNumber || purchase.purchaseNumber || 'N/A'}
                          </span>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-5 py-3 sm:py-4">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-100 text-violet-600">
                            <BuildingOfficeIcon className="h-4 w-4" />
                          </div>
                          <span className="text-sm text-slate-700">
                            {purchase.supplier?.supplierName || 'N/A'}
                          </span>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-5 py-3 text-center sm:py-4">
                        <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                          itemCount === 1
                            ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                            : 'bg-violet-50 text-violet-700 ring-1 ring-violet-200'
                        }`}>
                          {itemCount} {itemCount === 1 ? 'Item' : 'Items'}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-5 py-3 text-right text-sm font-bold tabular-nums text-slate-900 sm:py-4">
                        AED {parseFloat(purchase.grandTotal).toFixed(2)}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3 sm:py-4">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold capitalize ${getStatusColor(purchase.status)}`}>
                          <CheckCircleIcon className="h-3.5 w-3.5" />
                          {statusLabel}
                        </span>
                      </td>
                      {isSuperAdmin && (
                        <td className="whitespace-nowrap px-5 py-3 text-right sm:py-4">
                          <div className="inline-flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => handleDownloadPurchasePDF(purchase)}
                              className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-violet-50 text-violet-600 transition hover:bg-violet-100"
                              title="Download PDF"
                            >
                              <ArrowDownTrayIcon className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => openEditPurchaseModal(purchase.id)}
                              className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-600 transition hover:bg-amber-100"
                              title="Edit Purchase"
                            >
                              <PencilIcon className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>

                    {isExpanded && purchase.items && purchase.items.length > 0 && (
                      <tr>
                        <td colSpan={isSuperAdmin ? 8 : 7} className="bg-slate-50 px-4 py-4 sm:px-6">
                          <div className="space-y-3">
                            <h4 className="text-sm font-bold text-slate-800">Purchase Items</h4>
                            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                              <table className="min-w-full">
                                <thead className="bg-slate-50">
                                  <tr>
                                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">#</th>
                                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Type</th>
                                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Product</th>
                                    <th className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">Qty</th>
                                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Rate</th>
                                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Total</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                  {purchase.items.map((item, idx) => (
                                    <tr key={item.id} className="hover:bg-slate-50/80">
                                      <td className="px-3 py-2 text-xs text-slate-500">{idx + 1}</td>
                                      <td className="px-3 py-2">
                                        <span className={`rounded-full px-2 py-1 text-xs font-semibold ${getPurchaseTypeColor(item.purchaseType)}`}>
                                          {item.purchaseType}
                                        </span>
                                        {item.cylinderCondition && (
                                          <span className="ml-1 text-xs text-slate-500">({item.cylinderCondition})</span>
                                        )}
                                      </td>
                                      <td className="px-3 py-2">
                                        <div className="text-xs font-medium text-slate-900">
                                          {item.product?.productName || 'N/A'}
                                        </div>
                                        <div className="text-xs text-slate-500">
                                          {item.product?.productCode}
                                        </div>
                                      </td>
                                      <td className="px-3 py-2 text-center text-xs font-medium text-slate-900">
                                        {item.quantity}
                                      </td>
                                      <td className="px-3 py-2 text-right text-xs text-slate-600">
                                        AED {parseFloat(item.costPrice).toFixed(2)}
                                      </td>
                                      <td className="px-3 py-2 text-right text-xs font-semibold text-slate-900">
                                        AED {parseFloat(item.totalAmount).toFixed(2)}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                                <tfoot className="bg-emerald-50/60">
                                  <tr>
                                    <td colSpan="5" className="px-3 py-2 text-right text-xs font-medium text-slate-700">Subtotal:</td>
                                    <td className="px-3 py-2 text-right text-xs font-semibold text-slate-900">
                                      AED {parseFloat(purchase.subtotal).toFixed(2)}
                                    </td>
                                  </tr>
                                  <tr>
                                    <td colSpan="5" className="px-3 py-2 text-right text-xs font-medium text-violet-700">VAT (5%):</td>
                                    <td className="px-3 py-2 text-right text-xs font-semibold text-violet-900">
                                      AED {parseFloat(purchase.vat).toFixed(2)}
                                    </td>
                                  </tr>
                                  <tr className="border-t border-emerald-200">
                                    <td colSpan="5" className="px-3 py-2 text-right text-xs font-bold text-slate-900">Grand Total:</td>
                                    <td className="px-3 py-2 text-right text-sm font-bold text-violet-700">
                                      AED {parseFloat(purchase.grandTotal).toFixed(2)}
                                    </td>
                                  </tr>
                                </tfoot>
                              </table>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      {/* Create Purchase Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
          <div className="fixed inset-0 bg-slate-900/30" onClick={resetForm} />

          <div className="relative flex h-[calc(100dvh-1.5rem)] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl sm:h-[calc(100dvh-3rem)]">
            {/* Header */}
            <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-5 py-4 sm:px-6">
              <div>
                <h3 className="text-lg font-semibold text-slate-800">Create New Purchase</h3>
                <p className="mt-0.5 text-xs text-slate-500">Add supplier details and purchase items</p>
              </div>
              <button
                type="button"
                onClick={resetForm}
                className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4 sm:px-6">
                {/* Supplier row */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500">
                      Supplier <span className="text-red-500">*</span>
                    </label>
                    <SearchableSelect
                      required
                      value={formData.supplierId}
                      options={suppliers}
                      onChange={(nextValue) => setFormData((prev) => ({ ...prev, supplierId: nextValue }))}
                      placeholder="Search supplier"
                      getOptionValue={(supplier) => supplier.id}
                      getOptionLabel={(supplier) => supplier.supplierName || 'Supplier'}
                      getOptionSubLabel={(supplier) => `${supplier.trNumber || ''}${supplier.phone ? ` - ${supplier.phone}` : ''}`.trim()}
                      getOptionSearchText={(supplier) =>
                        `${supplier.supplierName || ''} ${supplier.trNumber || ''} ${supplier.phone || ''} ${supplier.email || ''}`
                      }
                      inputClassName="block w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-200"
                      menuClassName="absolute z-50 mt-1 max-h-52 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500">
                      Supplier Invoice Number <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.supplierInvoiceNumber}
                      onChange={(e) => setFormData({ ...formData, supplierInvoiceNumber: e.target.value })}
                      placeholder="e.g., INV0001"
                      className="block w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-800 focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-200"
                    />
                  </div>
                </div>

                {/* Add item card */}
                <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                  <h4 className="mb-3 text-sm font-medium text-slate-700">Add Items</h4>
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className={currentItem.purchaseType === 'Gas' ? 'sm:col-span-2' : ''}>
                        <label className="mb-1 block text-xs font-medium text-slate-600">
                          Purchase Type <span className="text-red-500">*</span>
                        </label>
                        <select
                          value={currentItem.purchaseType}
                          onChange={(e) => {
                            setCurrentItem({
                              ...currentItem,
                              purchaseType: e.target.value,
                              cylinderCondition: '',
                              productId: '',
                              relatedProductId: ''
                            });
                            setSelectedProduct(null);
                            setSelectedRelatedProduct(null);
                          }}
                          disabled={isEmployee}
                          className="block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-200 disabled:bg-slate-100"
                        >
                          <option value="Gas">Gas</option>
                          {!isEmployee && (
                            <>
                              <option value="Cylinder">Cylinder</option>
                              <option value="Tool">Tool</option>
                            </>
                          )}
                        </select>
                      </div>

                      {(currentItem.purchaseType === 'Tool' || currentItem.purchaseType === 'Cylinder') && (
                      <div>
                        {currentItem.purchaseType === 'Tool' ? (
                          <>
                            <label className="mb-1 block text-xs font-medium text-slate-600">
                              Tool Product <span className="text-red-500">*</span>
                            </label>
                            <SearchableSelect
                              value={currentItem.productId}
                              options={getAvailableProducts()}
                              onChange={(nextValue) => handlePurchaseProductSelect(nextValue)}
                              placeholder="Search tool..."
                              getOptionValue={(product) => product.id}
                              getOptionLabel={(product) => product.productName}
                              getOptionSubLabel={(product) => `AED ${parseFloat(product.costPrice || 0).toFixed(2)}`}
                              getOptionSearchText={(product) =>
                                `${product.productName || ''} ${product.productCode || ''} ${product.productType || ''}`
                              }
                              inputClassName="block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-200"
                              menuClassName="absolute z-50 mt-1 max-h-52 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg"
                              noResultsText="No matching tools"
                            />
                          </>
                        ) : (
                          <>
                            <label className="mb-1 block text-xs font-medium text-slate-600">
                              Cylinder Condition {currentItem.purchaseType === 'Cylinder' && <span className="text-red-500">*</span>}
                            </label>
                            <select
                              value={currentItem.purchaseType === 'Cylinder' ? currentItem.cylinderCondition : ''}
                              onChange={(e) => setCurrentItem({ ...currentItem, cylinderCondition: e.target.value, productId: '', relatedProductId: '' })}
                              disabled={currentItem.purchaseType !== 'Cylinder'}
                              className="block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                            >
                              <option value="">
                                {currentItem.purchaseType === 'Cylinder' ? 'Select Condition...' : 'Not required for this type'}
                              </option>
                              <option value="Empty">Empty Cylinder</option>
                              <option value="Full">Full Cylinder</option>
                            </select>
                          </>
                        )}
                      </div>
                      )}
                    </div>
                    {/* Product Selection */}
                    {currentItem.purchaseType && currentItem.purchaseType !== 'Tool' && (currentItem.purchaseType !== 'Cylinder' || currentItem.cylinderCondition) && (
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                          <label className="mb-1 block text-xs font-medium text-slate-600">
                            {currentItem.purchaseType === 'Gas' ? 'Gas Product' :
                             currentItem.purchaseType === 'Cylinder' ? 'Cylinder Product' : 'Tool Product'} <span className="text-red-500">*</span>
                          </label>
                          <SearchableSelect
                            value={currentItem.productId}
                            options={getAvailableProducts()}
                            onChange={(nextValue) => handlePurchaseProductSelect(nextValue)}
                            placeholder="Search product..."
                            getOptionValue={(product) => product.id}
                            getOptionLabel={(product) => product.productName}
                            getOptionSubLabel={(product) => `AED ${parseFloat(product.costPrice || 0).toFixed(2)}`}
                            getOptionSearchText={(product) =>
                              `${product.productName || ''} ${product.productCode || ''} ${product.productType || ''}`
                            }
                            inputClassName="block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-200"
                            menuClassName="absolute z-50 mt-1 max-h-52 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg"
                            noResultsText="No matching products"
                          />
                        </div>
                        {/* Related Product (for Gas or Full Cylinder) */}
                        {(currentItem.purchaseType === 'Gas' || 
                          (currentItem.purchaseType === 'Cylinder' && currentItem.cylinderCondition === 'Full')) && (
                          <div>
                            <label className="mb-1 block text-xs font-medium text-slate-600">
                              {currentItem.purchaseType === 'Gas' ? 'Select Empty Cylinder' : 'Gas in Cylinder'} <span className="text-red-500">*</span>
                            </label>
                            <SearchableSelect
                              value={currentItem.relatedProductId}
                              options={getRelatedProducts()}
                              onChange={(nextValue) => handleRelatedProductSelect(nextValue)}
                              placeholder={currentItem.purchaseType === 'Gas' ? 'Search empty cylinder...' : 'Search gas...'}
                              getOptionValue={(product) => product.id}
                              getOptionLabel={(product) => product.productName || 'Product'}
                              getOptionSubLabel={(product) =>
                                currentItem.purchaseType === 'Gas' ? `Available: ${product.availableStock ?? 0}` : ''
                              }
                              getOptionSearchText={(product) =>
                                `${product.productName || ''} ${product.productCode || ''} ${product.availableStock ?? ''}`
                              }
                            inputClassName="block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-200"
                              menuClassName="absolute z-50 mt-1 max-h-52 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg"
                              noResultsText="No related products available"
                            />
                            {currentItem.purchaseType === 'Gas' && getRelatedProducts().length === 0 && (
                              <p className="text-xs text-red-600 mt-1">
                                ⚠️ No empty cylinders available. Please purchase empty cylinders first.
                              </p>
                            )}
                            {currentItem.purchaseType === 'Gas' && currentItem.relatedProductId && (
                              <p className="text-xs text-green-600 mt-1">
                                ✓ Available empty stock: {getSelectedCylinderStock()} cylinders
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                    {/* Quantity */}
                    {currentItem.productId && (
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                          <label className="mb-1 block text-xs font-medium text-slate-600">
                            Quantity <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="number"
                            min="1"
                            max={currentItem.purchaseType === 'Gas' && currentItem.relatedProductId ? getSelectedCylinderStock() : undefined}
                            value={currentItem.quantity}
                            onChange={(e) => setCurrentItem({ ...currentItem, quantity: e.target.value })}
                            className="block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-200"
                          />
                        </div>
                        {selectedProduct && (
                          <div>
                            <label className="mb-1 block text-xs font-medium text-slate-600">
                              Cost Price (AED) <span className="text-red-500">*</span>
                            </label>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={currentItem.costPrice}
                              onChange={(e) => setCurrentItem({ ...currentItem, costPrice: e.target.value })}
                              placeholder={`Default: ${parseFloat(selectedProduct.costPrice || 0).toFixed(2)}`}
                              className="block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-200"
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="mt-3 flex flex-col gap-2 border-t border-slate-200 pt-3 sm:flex-row sm:items-center sm:justify-between">
                    {currentItem.productId && (
                      <div className="text-sm text-slate-600">
                        Item Total: <span className="font-semibold text-slate-800">AED {calculateItemTotal().toFixed(2)}</span>
                      </div>
                    )}
                    <div className="flex gap-2 sm:ml-auto">
                      {editingItemIndex !== null && (
                        <button
                          type="button"
                          onClick={resetCurrentItem}
                          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-100"
                        >
                          Cancel
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={handleAddItem}
                        disabled={!currentItem.productId}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <PlusIcon className="h-4 w-4" />
                        {editingItemIndex !== null ? 'Update Item' : 'Add Item'}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Items list */}
                <div className="overflow-hidden rounded-xl border border-slate-200">
                  <div className="border-b border-slate-100 bg-white px-4 py-2.5">
                    <h4 className="text-sm font-medium text-slate-700">
                      Purchase Items ({formData.items.length})
                    </h4>
                  </div>
                  {formData.items.length > 0 ? (
                    <div className="max-h-56 overflow-auto">
                      <table className="w-full min-w-[680px] table-fixed">
                        <colgroup>
                          <col className="w-10" />
                          <col className="w-24" />
                          <col />
                          <col className="w-16" />
                          <col className="w-24" />
                          <col className="w-28" />
                          <col className="w-24" />
                        </colgroup>
                        <thead className="border-b border-slate-100 bg-slate-50/80">
                          <tr>
                            <th className="px-2.5 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-slate-500">#</th>
                            <th className="px-2.5 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-slate-500">Type</th>
                            <th className="px-2.5 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-slate-500">Product</th>
                            <th className="px-2.5 py-2 text-center text-[11px] font-medium uppercase tracking-wide text-slate-500">Qty</th>
                            <th className="px-2.5 py-2 text-right text-[11px] font-medium uppercase tracking-wide text-slate-500">Cost</th>
                            <th className="px-2.5 py-2 text-right text-[11px] font-medium uppercase tracking-wide text-slate-500">Total</th>
                            <th className="px-2.5 py-2 text-center text-[11px] font-medium uppercase tracking-wide text-slate-500">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {formData.items.map((item, index) => {
                            const product = products.find(p => p.id === item.productId);
                            const costPrice = getItemCostPrice(item);
                            const itemTotal = costPrice * parseInt(item.quantity, 10);
                            
                            return (
                              <tr key={index} className="transition hover:bg-slate-50/60">
                                <td className="whitespace-nowrap px-2.5 py-2.5 text-sm text-slate-500">{index + 1}</td>
                                <td className="px-2.5 py-2.5 whitespace-nowrap">
                                  <span className={`inline-flex px-2.5 py-1 text-xs font-semibold rounded-full ${getPurchaseTypeColor(item.purchaseType)}`}>
                                    {item.purchaseType}
                                  </span>
                                </td>
                                <td className="px-2.5 py-2.5">
                                  <div className="text-sm font-semibold text-gray-900 break-words">{product?.productName || 'N/A'}</div>
                                  {item.cylinderCondition && (
                                    <div className="text-xs text-gray-500 mt-1">{item.cylinderCondition}</div>
                                  )}
                                </td>
                                <td className="px-2.5 py-2.5 text-sm text-center font-semibold text-gray-900 whitespace-nowrap">{item.quantity}</td>
                                <td className="px-2.5 py-2.5 text-sm text-right text-gray-700 whitespace-nowrap">
                                  AED {costPrice.toFixed(2)}
                                </td>
                                <td className="px-2.5 py-2.5 text-sm text-right font-bold text-gray-900 whitespace-nowrap">
                                  AED {itemTotal.toFixed(2)}
                                </td>
                                <td className="px-2.5 py-2.5 text-center whitespace-nowrap">
                                  <div className="flex items-center justify-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => handleEditItem(index)}
                                      className="text-blue-600 hover:text-blue-900 p-1 hover:bg-blue-50 rounded transition-colors"
                                      title="Edit"
                                    >
                                      <PencilIcon className="h-4 w-4" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteItem(index)}
                                      className="text-red-600 hover:text-red-900 p-1 hover:bg-red-50 rounded transition-colors"
                                      title="Delete"
                                    >
                                      <TrashIcon className="h-4 w-4" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot className="border-t border-slate-200 bg-slate-50/50">
                          <tr>
                            <td colSpan="5" className="px-2.5 py-2 text-right text-sm text-slate-600">Subtotal:</td>
                            <td className="whitespace-nowrap px-2.5 py-2 text-right text-sm font-medium text-slate-800">AED {purchaseSummary.subtotal.toFixed(2)}</td>
                            <td></td>
                          </tr>
                          <tr>
                            <td colSpan="5" className="px-2.5 py-2 text-right text-sm text-slate-600">VAT (5%):</td>
                            <td className="whitespace-nowrap px-2.5 py-2 text-right text-sm font-medium text-slate-800">AED {purchaseSummary.vat.toFixed(2)}</td>
                            <td></td>
                          </tr>
                          <tr>
                            <td colSpan="5" className="px-2.5 py-2.5 text-right text-sm font-semibold text-slate-800">Grand Total:</td>
                            <td className="whitespace-nowrap px-2.5 py-2.5 text-right text-sm font-semibold text-slate-900">AED {purchaseSummary.grandTotal.toFixed(2)}</td>
                            <td></td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  ) : (
                    <div className="flex min-h-[88px] items-center justify-center px-4 py-6 text-sm text-slate-400">
                      Add at least one item to review purchase summary.
                    </div>
                  )}
                </div>

                {/* Notes */}
                <div>
                  <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500">Notes (Optional)</label>
                  <textarea
                    rows="2"
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="Add any additional notes about this purchase..."
                    className="block w-full resize-none rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-800 focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-200"
                  />
                </div>
              </div>

              {/* Footer */}
              <div className="flex shrink-0 flex-col gap-2 border-t border-slate-100 bg-white px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
                <button
                  type="button"
                  onClick={resetForm}
                  className="rounded-lg border border-slate-200 px-5 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formData.items.length === 0}
                  className="rounded-lg bg-slate-800 px-6 py-2.5 text-sm font-medium text-white transition hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Submit Purchase ({formData.items.length} items) · AED {purchaseSummary.grandTotal.toFixed(2)}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Edit Purchase Modal */}
      {showEditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3">
          <div className="w-full max-w-3xl rounded-2xl border border-gray-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3 sm:py-4">
              <h3 className="text-lg font-bold text-gray-900">Edit Purchase</h3>
              <button
                type="button"
                onClick={closeEditPurchaseModal}
                className="text-gray-400 transition-colors hover:text-gray-600"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>

            <form onSubmit={handleUpdatePurchase} className="space-y-4 p-4 sm:p-5">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-semibold text-gray-900">
                    Supplier Invoice Number <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={editPurchaseData.supplierInvoiceNumber}
                    onChange={(e) => setEditPurchaseData((prev) => ({ ...prev, supplierInvoiceNumber: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-semibold text-gray-900">Notes</label>
                  <input
                    type="text"
                    value={editPurchaseData.notes}
                    onChange={(e) => setEditPurchaseData((prev) => ({ ...prev, notes: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
                  />
                </div>
              </div>

              <div className="overflow-x-auto rounded-xl border border-gray-200">
                <table className="min-w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">Product</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">Type</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-gray-600">Unit Cost</th>
                      <th className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide text-gray-600">Quantity</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-gray-600">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {editPurchaseData.items.map((item) => (
                      <tr key={item.id}>
                        <td className="px-3 py-2 text-sm font-medium text-gray-900">{item.productName}</td>
                        <td className="px-3 py-2 text-sm text-gray-600">
                          {item.purchaseType}{item.cylinderCondition ? ` (${item.cylinderCondition})` : ''}
                        </td>
                        <td className="px-3 py-2 text-right text-sm text-gray-700">AED {item.costPrice.toFixed(2)}</td>
                        <td className="px-3 py-2 text-center">
                          <input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(e) => handleEditPurchaseItemQty(item.id, e.target.value)}
                            className="w-24 rounded-md border border-gray-300 px-2 py-1.5 text-center text-sm focus:border-primary-500 focus:outline-none"
                          />
                        </td>
                        <td className="px-3 py-2 text-right text-sm font-semibold text-gray-900">
                          AED {(item.costPrice * item.quantity).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-blue-50/70">
                    <tr>
                      <td colSpan="4" className="px-3 py-2 text-right text-sm font-semibold text-gray-700">Subtotal:</td>
                      <td className="px-3 py-2 text-right text-sm font-bold text-gray-900">AED {editSummary.subtotal.toFixed(2)}</td>
                    </tr>
                    <tr>
                      <td colSpan="4" className="px-3 py-2 text-right text-sm font-semibold text-blue-700">VAT (5%):</td>
                      <td className="px-3 py-2 text-right text-sm font-bold text-blue-900">AED {editSummary.vat.toFixed(2)}</td>
                    </tr>
                    <tr>
                      <td colSpan="4" className="px-3 py-2 text-right text-sm font-semibold text-gray-900">Grand Total:</td>
                      <td className="px-3 py-2 text-right text-base font-bold text-primary-700">AED {editSummary.grandTotal.toFixed(2)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={closeEditPurchaseModal}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-primary-600 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-700"
                >
                  Update Purchase
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
        confirmText={confirmDialog.confirmText}
        cancelText={confirmDialog.cancelText}
      />
    </div>
  );
};
export default Purchases;



