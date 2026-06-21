import React, { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../utils/api';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import SearchableSelect from '../components/SearchableSelect';

const createEmptyItem = () => ({ itemType: 'Empty Cylinder', productId: '', quantity: 1 });
const normalizeTransferProductName = (value = '') => {
  if (!value) return '';
  const parts = String(value).trim().split(/\s+/);
  if (parts.length > 1 && /^(cylinder|gas|tool)$/i.test(parts[0])) {
    parts.shift();
  }
  return parts.join(' ')
    .replace(/[^a-z0-9\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
};
const stripLeadingTransferType = (value = '') => {
  if (!value) return '';
  const parts = String(value).trim().split(/\s+/);
  if (parts.length > 1 && /^(cylinder|gas|tool)$/i.test(parts[0])) {
    parts.shift();
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim();
};
const toCylinderStyleLabel = (value = '') => {
  const baseLabel = stripLeadingTransferType(value);
  return baseLabel ? `Cylinder ${baseLabel}` : (value || 'Cylinder');
};
const getTransferOptionId = (option) => option?.productId || option?.id || option?.product?.id || '';
const getTransferOptionLabel = (option) =>
  option?.displayName ||
  option?.product?.productName ||
  option?.productName ||
  option?.product?.productCode ||
  option?.productCode ||
  'Item';
const getTransferOptionStock = (option) => {
  const stock = option?.availableStock ?? option?.stockQuantity ?? option?.product?.stockQuantity ?? 0;
  return Number(stock) || 0;
};
const getTransferOptionSearchText = (option) =>
  [
    getTransferOptionLabel(option),
    option?.displayName,
    option?.product?.productName,
    option?.productName,
    option?.product?.productCode,
    option?.productCode,
    getTransferOptionStock(option)
  ]
    .filter(Boolean)
    .join(' ');
const mapGasProductsWithInventoryStock = (products = [], fullCylinderInventory = []) => {
  const stockByName = new Map();

  fullCylinderInventory.forEach((item) => {
    const key = normalizeTransferProductName(getTransferOptionLabel(item));
    if (!key) return;
    stockByName.set(key, {
      stock: getTransferOptionStock(item),
      displayName: item?.product?.productName || item?.productName || ''
    });
  });

  return products
    .filter((product) => String(product?.productType || '').trim().toLowerCase() === 'gas')
    .map((product) => {
      const matchedStock = stockByName.get(normalizeTransferProductName(product.productName));
      return {
        ...product,
        displayName: matchedStock?.displayName || toCylinderStyleLabel(product.productName),
        availableStock: matchedStock?.stock ?? (Number(product.stockQuantity) || 0),
        stockQuantity: matchedStock?.stock ?? (Number(product.stockQuantity) || 0)
      };
    });
};
const getCurrentMonthDateRange = () => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const toKey = (date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };
  return { fromDate: toKey(start), toDate: toKey(end) };
};

const StockTransfers = () => {
  const { isSuperAdmin, isManager, isEmployee } = useAuth();
  const initialHistoryRange = useMemo(() => getCurrentMonthDateRange(), []);
  const [activeTab, setActiveTab] = useState('assign');
  const [employees, setEmployees] = useState([]);
  const [selectedEmployee, setSelectedEmployee] = useState('');
  const [assignItems, setAssignItems] = useState([]);
  const [draftItem, setDraftItem] = useState(createEmptyItem());
  const [editIndex, setEditIndex] = useState(null);
  const [emptyCylinders, setEmptyCylinders] = useState([]);
  const [toolInventory, setToolInventory] = useState([]);
  const [gasProducts, setGasProducts] = useState([]);
  const [returns, setReturns] = useState([]);
  const [assignedTransfers, setAssignedTransfers] = useState([]);
  const [assignedStock, setAssignedStock] = useState([]);
  const [returnItems, setReturnItems] = useState([]);
  const [returnDraft, setReturnDraft] = useState({ itemType: 'Gas', productId: '', quantity: 1 });
  const [historyTransfers, setHistoryTransfers] = useState([]);
  const [historyFromDate, setHistoryFromDate] = useState(initialHistoryRange.fromDate);
  const [historyToDate, setHistoryToDate] = useState(initialHistoryRange.toDate);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyExpandedTransfers, setHistoryExpandedTransfers] = useState({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isSuperAdmin) {
      fetchAssignRecipients();
      fetchAssignableStock();
      fetchReturns();
    }
    if (isManager) {
      fetchEmployees();
      fetchAssignedTransfers();
      fetchAssignedStock();
    }
    if (isEmployee) {
      fetchAssignedTransfers();
      fetchAssignedStock();
    }
  }, [isSuperAdmin, isManager, isEmployee]);

  useEffect(() => {
    if (isEmployee) {
      setActiveTab('assigned');
    }
    if (isManager) {
      setActiveTab('assigned');
    }
  }, [isEmployee, isManager]);

  useEffect(() => {
    if (activeTab === 'return' && isSuperAdmin) {
      fetchReturns();
    }
  }, [activeTab, isSuperAdmin]);

  const fetchAssignRecipients = async () => {
    try {
      const res = await api.get('/users');
      const list = res.data.data || [];
      const filtered = list.filter((user) => user.role === 'employee' || user.role === 'manager');
      setEmployees(filtered);
    } catch (error) {
      console.error('Failed to load assign recipients', error);
    }
  };

  const fetchEmployees = async () => {
    try {
      const res = await api.get('/users');
      const list = res.data.data || [];
      const filtered = list.filter((user) => user.role === 'employee');
      setEmployees(filtered);
    } catch (error) {
      console.error('Failed to load employees', error);
    }
  };

  const fetchAssignableStock = async () => {
    try {
      const [emptyRes, fullRes, toolRes, productRes] = await Promise.all([
        api.get('/inventory/category/Empty Cylinder'),
        api.get('/inventory/category/Full Cylinder'),
        api.get('/inventory/category/Tool'),
        api.get('/products')
      ]);

      setEmptyCylinders(emptyRes.data.data || []);
      setToolInventory(toolRes.data.data || []);
      const products = productRes.data.data || [];
      setGasProducts(mapGasProductsWithInventoryStock(products, fullRes.data.data || []));
    } catch (error) {
      console.error('Failed to load stock lists', error);
    }
  };

  const fetchReturns = async () => {
    try {
      const res = await api.get('/stock-transfers/returns');
      setReturns(res.data.data || []);
    } catch (error) {
      console.error('Failed to load returns', error);
    }
  };

  const fetchAssignedTransfers = async () => {
    try {
      const res = await api.get('/stock-transfers/assigned');
      setAssignedTransfers(res.data.data || []);
    } catch (error) {
      console.error('Failed to load assigned transfers', error);
    }
  };

  const fetchAssignedStock = async () => {
    try {
      const res = await api.get('/inventory');
      setAssignedStock(res.data.data || []);
    } catch (error) {
      console.error('Failed to load assigned stock', error);
    }
  };

  const fetchTransferHistory = useCallback(async (fromDate = historyFromDate, toDate = historyToDate) => {
    try {
      setHistoryLoading(true);
      const res = await api.get('/stock-transfers/history', {
        params: {
          fromDate,
          toDate
        }
      });
      setHistoryTransfers(res.data.data || []);
    } catch (error) {
      console.error('Failed to load transfer history', error);
      toast.error(error.response?.data?.message || 'Failed to load transfer history');
    } finally {
      setHistoryLoading(false);
    }
  }, [historyFromDate, historyToDate]);

  useEffect(() => {
    if (activeTab === 'history' && (isSuperAdmin || isEmployee || isManager)) {
      fetchTransferHistory(historyFromDate, historyToDate);
    }
  }, [activeTab, isSuperAdmin, isEmployee, isManager, historyFromDate, historyToDate, fetchTransferHistory]);

  useEffect(() => {
    setHistoryExpandedTransfers({});
  }, [historyTransfers]);

  const resetHistoryToCurrentMonth = () => {
    const nextRange = getCurrentMonthDateRange();
    setHistoryFromDate(nextRange.fromDate);
    setHistoryToDate(nextRange.toDate);
  };

  const getHistoryStatusLabel = (transfer) => {
    if (transfer.transferType === 'assign') {
      if (transfer.status === 'rejected') return 'Rejected';
      return transfer.status === 'received' ? 'Accepted' : 'Assigned';
    }
    if (transfer.transferType === 'return') {
      return transfer.status === 'received' ? 'Returned Accepted' : 'Return Pending';
    }
    return transfer.status || '-';
  };

  const getHistoryStatusClass = (transfer) => {
    if (transfer.transferType === 'assign') {
      if (transfer.status === 'rejected') {
        return 'bg-rose-100 text-rose-700';
      }
      return transfer.status === 'received'
        ? 'bg-emerald-100 text-emerald-700'
        : 'bg-blue-100 text-blue-700';
    }
    if (transfer.transferType === 'return') {
      return transfer.status === 'received'
        ? 'bg-emerald-100 text-emerald-700'
        : 'bg-amber-100 text-amber-700';
    }
    return 'bg-slate-100 text-slate-700';
  };

  const formatHistoryDate = (value) => {
    if (!value) return '-';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '-';
    return parsed.toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const productOptions = useMemo(() => {
    const map = {
      'Empty Cylinder': emptyCylinders,
      Gas: gasProducts,
      Tool: toolInventory
    };
    return map;
  }, [emptyCylinders, gasProducts, toolInventory]);

  const managerProductOptions = useMemo(() => {
    const grouped = {
      'Empty Cylinder': [],
      Gas: [],
      Tool: []
    };
    assignedStock.forEach((item) => {
      if (!item.itemType || !grouped[item.itemType]) return;
      grouped[item.itemType].push({
        ...item,
        id: item.productId,
        availableStock: item.stockQuantity,
        stockQuantity: item.stockQuantity,
        displayName: item.itemType === 'Gas'
          ? toCylinderStyleLabel(item.product?.productName || item.productName || 'Gas')
          : (item.product?.productName || item.productName || 'Item')
      });
    });
    return grouped;
  }, [assignedStock]);

  const activeProductOptions = isManager ? managerProductOptions : productOptions;

  const handleDraftChange = (field, value) => {
    setDraftItem((prev) => {
      const next = { ...prev, [field]: value };
      if (field === 'itemType') {
        next.productId = '';
      }
      return next;
    });
  };

  const resetDraft = () => {
    setDraftItem(createEmptyItem());
    setEditIndex(null);
  };

  const addItemRow = () => {
    if (!draftItem.productId) {
      toast.error('Please select an item');
      return;
    }

    if (!draftItem.quantity || draftItem.quantity <= 0) {
      toast.error('Quantity must be greater than 0');
      return;
    }

    const available = getAvailableStock(draftItem);
    if (draftItem.quantity > available) {
      toast.error('Assigned quantity exceeds available stock');
      return;
    }

    setAssignItems((prev) => {
      const next = [...prev];
      if (editIndex !== null) {
        next[editIndex] = { ...draftItem };
      } else {
        next.push({ ...draftItem });
      }
      return next;
    });
    resetDraft();
  };

  const removeItemRow = (index) => {
    setAssignItems((prev) => prev.filter((_, idx) => idx !== index));
    if (editIndex === index) {
      resetDraft();
    }
  };

  const startEditRow = (index) => {
    const item = assignItems[index];
    setDraftItem(item);
    setEditIndex(index);
  };

  const getAvailableStock = (item) => {
    const options = activeProductOptions[item.itemType] || [];
    const match = options.find((option) => getTransferOptionId(option) === item.productId);
    return match ? getTransferOptionStock(match) : 0;
  };

  const assignDraftOptions = useMemo(() => (
    (activeProductOptions[draftItem.itemType] || []).filter((option) => (
      getTransferOptionStock(option) > 0 || getTransferOptionId(option) === draftItem.productId
    ))
  ), [activeProductOptions, draftItem.itemType, draftItem.productId]);

  const getResolvedItemLabel = useCallback((itemType, productId, fallbackLabel = 'Item') => {
    if (itemType !== 'Gas') {
      return fallbackLabel || 'Item';
    }

    const matchedGas = gasProducts.find((product) => product.id === productId);
    return matchedGas?.displayName || toCylinderStyleLabel(fallbackLabel);
  }, [gasProducts]);

  const toggleHistoryTransfer = useCallback((transferId) => {
    setHistoryExpandedTransfers((prev) => ({
      ...prev,
      [transferId]: !prev[transferId]
    }));
  }, []);

  const returnOptions = useMemo(() => {
    const grouped = {
      Gas: [],
      'Empty Cylinder': [],
      Tool: []
    };
    assignedStock.forEach((item) => {
      if (item.itemType && grouped[item.itemType]) {
        grouped[item.itemType].push(item);
      }
    });
    return grouped;
  }, [assignedStock]);

  const getReturnAvailable = (item) => {
    const options = returnOptions[item.itemType] || [];
    const match = options.find((opt) => opt.productId === item.productId);
    return match ? match.stockQuantity || 0 : 0;
  };

  const handleReturnDraftChange = (field, value) => {
    setReturnDraft((prev) => {
      const next = { ...prev, [field]: value };
      if (field === 'itemType') {
        next.productId = '';
      }
      return next;
    });
  };

  const addReturnItem = () => {
    if (!returnDraft.productId) {
      toast.error('Please select an item');
      return;
    }
    if (!returnDraft.quantity || returnDraft.quantity <= 0) {
      toast.error('Quantity must be greater than 0');
      return;
    }
    const available = getReturnAvailable(returnDraft);
    if (returnDraft.quantity > available) {
      toast.error('Return quantity exceeds assigned stock');
      return;
    }

    setReturnItems((prev) => [...prev, { ...returnDraft }]);
    setReturnDraft((prev) => ({ ...prev, productId: '', quantity: 1 }));
  };

  const removeReturnItem = (index) => {
    setReturnItems((prev) => prev.filter((_, idx) => idx !== index));
  };

  const submitReturn = async () => {
    if (returnItems.length === 0) {
      toast.error('Please add at least one item to return');
      return;
    }
    setLoading(true);
    try {
      await api.post('/stock-transfers/returns', {
        items: returnItems.map((item) => ({
          itemType: item.itemType,
          productId: item.productId,
          quantity: Number(item.quantity)
        }))
      });
      toast.success('Return submitted successfully');
      setReturnItems([]);
      setReturnDraft({ itemType: 'Gas', productId: '', quantity: 1 });
      fetchAssignedStock();
      fetchAssignedTransfers();
    } catch (error) {
      console.error('Failed to submit return', error);
      toast.error(error.response?.data?.message || 'Failed to submit return');
    } finally {
      setLoading(false);
    }
  };

  const handleAcceptAssigned = async (transferId) => {
    setLoading(true);
    try {
      await api.post(`/stock-transfers/assigned/${transferId}/accept`);
      toast.success('Stock accepted');
      fetchAssignedTransfers();
      fetchAssignedStock();
    } catch (error) {
      console.error('Failed to accept stock', error);
      toast.error(error.response?.data?.message || 'Failed to accept stock');
    } finally {
      setLoading(false);
    }
  };

  const handleRejectAssigned = async (transferId) => {
    setLoading(true);
    try {
      await api.post(`/stock-transfers/assigned/${transferId}/reject`);
      toast.success('Stock rejected and returned');
      fetchAssignedTransfers();
      fetchAssignedStock();
    } catch (error) {
      console.error('Failed to reject stock', error);
      toast.error(error.response?.data?.message || 'Failed to reject stock');
    } finally {
      setLoading(false);
    }
  };

  const handleSendStock = async () => {
    if (!selectedEmployee) {
      toast.error('Please select an employee');
      return;
    }

    const cleanItems = assignItems.filter((item) => item.productId);
    if (cleanItems.length === 0) {
      toast.error('Please add at least one item');
      return;
    }

    for (const item of cleanItems) {
      if (!item.quantity || item.quantity <= 0) {
        toast.error('Quantity must be greater than 0');
        return;
      }
      const available = getAvailableStock(item);
      if (item.quantity > available) {
        toast.error('Assigned quantity exceeds available stock');
        return;
      }
    }

    setLoading(true);
    try {
      await api.post('/stock-transfers/assign', {
        employeeId: selectedEmployee,
        items: cleanItems.map((item) => ({
          itemType: item.itemType,
          productId: item.productId,
          quantity: Number(item.quantity)
        }))
      });
      toast.success('Stock assigned successfully');
      setAssignItems([]);
      resetDraft();
      setSelectedEmployee('');
      if (isManager) {
        fetchAssignedStock();
      } else {
        fetchAssignableStock();
        fetchReturns();
      }
    } catch (error) {
      console.error('Failed to assign stock', error);
      toast.error(error.response?.data?.message || 'Failed to assign stock');
    } finally {
      setLoading(false);
    }
  };

  const handleAcceptReturn = async (transferId) => {
    setLoading(true);
    try {
      await api.post(`/stock-transfers/returns/${transferId}/accept`);
      toast.success('Return accepted');
      fetchAssignableStock();
      fetchReturns();
    } catch (error) {
      console.error('Failed to accept return', error);
      toast.error(error.response?.data?.message || 'Failed to accept return');
    } finally {
      setLoading(false);
    }
  };

  const renderHistorySection = () => (
    <div className="pt-4 sm:pt-6 space-y-4">
      <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">From Date</label>
            <input
              type="date"
              value={historyFromDate}
              onChange={(e) => setHistoryFromDate(e.target.value)}
              className="rounded-xl border border-gray-200 bg-white shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200 w-full px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">To Date</label>
            <input
              type="date"
              value={historyToDate}
              onChange={(e) => setHistoryToDate(e.target.value)}
              className="rounded-xl border border-gray-200 bg-white shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200 w-full px-3 py-2 text-sm"
            />
          </div>
          <button
            type="button"
            onClick={() => fetchTransferHistory(historyFromDate, historyToDate)}
            disabled={historyLoading}
            className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white shadow-sm transition hover:bg-slate-50 px-3 py-2 text-xs font-semibold text-gray-700 disabled:opacity-60"
          >
            {historyLoading ? 'Loading...' : 'Apply Filter'}
          </button>
          <button
            type="button"
            onClick={resetHistoryToCurrentMonth}
            className="inline-flex items-center justify-center rounded-xl bg-primary-600 px-3 py-2 text-xs font-semibold text-white shadow transition hover:bg-primary-700"
          >
            Current Month
          </button>
        </div>
      </div>

      {historyLoading && (
        <div className="text-sm text-gray-600 text-center py-6">
          Loading history...
        </div>
      )}

      {!historyLoading && historyTransfers.length === 0 && (
        <div className="text-sm text-gray-600 text-center py-6">
          No assigned/returned history for selected dates.
        </div>
      )}

      {!historyLoading && historyTransfers.map((transfer) => {
        const isExpanded = Boolean(historyExpandedTransfers[transfer.id]);

        return (
          <div key={transfer.id} className="rounded-2xl border border-slate-200/80 bg-white/95 shadow-sm">
            <button
              type="button"
              onClick={() => toggleHistoryTransfer(transfer.id)}
              className="w-full p-4 text-left"
            >
              <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-gray-800">Transfer #{transfer.transferNumber}</p>
                  <p className="text-xs text-gray-500">Date: {formatHistoryDate(transfer.createdAt)}</p>
                  <p className="text-xs text-gray-500">Employee: {transfer.employee?.fullName || 'N/A'}</p>
                  {transfer.creator?.fullName && (
                    <p className="text-xs text-gray-500">Created By: {transfer.creator.fullName}</p>
                  )}
                  <p className="text-xs font-medium text-blue-600">{isExpanded ? 'Hide details' : 'Show details'}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${
                    transfer.transferType === 'assign'
                      ? 'bg-blue-100 text-blue-700'
                      : 'bg-purple-100 text-purple-700'
                  }`}>
                    {transfer.transferType === 'assign' ? 'Assigned' : 'Returned'}
                  </span>
                  <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${getHistoryStatusClass(transfer)}`}>
                    {getHistoryStatusLabel(transfer)}
                  </span>
                </div>
              </div>
            </button>

            {isExpanded && (
              <div className="border-t border-slate-200/80 px-4 pb-4 pt-3">
                <div className="space-y-2 text-xs text-gray-600">
                  {transfer.items?.map((item) => (
                    <div key={item.id} className="flex items-center justify-between rounded-xl bg-white/70 px-3 py-2">
                      <span>{item.itemType} - {getResolvedItemLabel(item.itemType, item.productId, item.product?.productName || 'Item')}</span>
                      <span className="font-semibold">Qty: {item.quantity}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  if (isEmployee) {
    return (
      <div className="space-y-4 sm:space-y-6 p-3 sm:p-6">
        <div className="relative overflow-hidden  border border-transparent bg-gradient-to-br from-blue-50 via-slate-50 to-white p-4 sm:p-5 shadow-lg sm:p-6">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(129,140,248,0.2),_transparent_60%)]"></div>
          <div className="relative">
            <h1 className="text-3xl font-bold text-gray-900">Stock Assignment &amp; Return</h1>
            <p className="mt-1 text-sm text-gray-600">Review assigned stock and submit returns when needed.</p>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white/95 p-4 shadow-xl shadow-slate-200/70 sm:p-6">
          <div className="flex justify-center border-b border-slate-200/80 pb-4">
            <div className="grid grid-cols-3 w-full max-w-3xl rounded-2xl border border-slate-200 bg-slate-100/80 p-1">
              <button
                onClick={() => setActiveTab('assigned')}
                className={`w-full text-center py-2 text-sm font-semibold rounded-xl transition ${
                  activeTab === 'assigned'
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Assigned Stock
              </button>
              <button
                onClick={() => setActiveTab('return')}
                className={`w-full text-center py-2 text-sm font-semibold rounded-xl transition ${
                  activeTab === 'return'
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Return Stock
              </button>
              <button
                onClick={() => setActiveTab('history')}
                className={`w-full text-center py-2 text-sm font-semibold rounded-xl transition ${
                  activeTab === 'history'
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Assigned/Returned History
              </button>
            </div>
          </div>

          {activeTab === 'assigned' && (
            <div className="pt-4 sm:pt-6 space-y-4">
              {assignedTransfers.length === 0 && (
                <div className="text-sm text-gray-600 text-center py-6">
                  No stock assignments yet.
                </div>
              )}
              {assignedTransfers.map((transfer) => (
                <div key={transfer.id} className="rounded-2xl border border-slate-200/80 bg-white/95 shadow-sm p-4">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-gray-800">Transfer #{transfer.transferNumber}</p>
                      <p className="text-xs text-gray-500">Assigned by {transfer.creator?.fullName || 'Admin'}</p>
                      <p className="text-xs text-gray-500">Status: Assigned</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => handleAcceptAssigned(transfer.id)}
                        disabled={loading}
                        className="inline-flex items-center justify-center rounded-xl bg-primary-600 px-3 py-2 text-xs font-semibold text-white shadow transition hover:bg-primary-700 disabled:opacity-60"
                      >
                        Accept Stock
                      </button>
                      <button
                        onClick={() => handleRejectAssigned(transfer.id)}
                        disabled={loading}
                        className="inline-flex items-center justify-center rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 shadow-sm transition hover:bg-rose-100 disabled:opacity-60"
                      >
                        Reject Stock
                      </button>
                    </div>
                  </div>
                  <div className="mt-3 space-y-2 text-xs text-gray-600">
                    {transfer.items?.map((item) => (
                      <div key={item.id} className="flex items-center justify-between rounded-xl bg-white/70 px-3 py-2">
                        <span>{item.itemType} - {getResolvedItemLabel(item.itemType, item.productId, item.product?.productName || 'Item')}</span>
                        <span className="font-semibold">Qty: {item.quantity}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'return' && (
            <div className="pt-4 sm:pt-6 space-y-4 sm:space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3 items-end">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Item Type</label>
                  <select
                    value={returnDraft.itemType}
                    onChange={(e) => handleReturnDraftChange('itemType', e.target.value)}
                    className="rounded-xl border border-gray-200 bg-white shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200 w-full px-3 py-2 text-sm"
                  >
                    <option value="Gas">Gas</option>
                    <option value="Empty Cylinder">Empty Cylinders</option>
                    <option value="Tool">Tools</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Item</label>
                  <SearchableSelect
                    required
                    value={returnDraft.productId}
                    options={returnOptions[returnDraft.itemType] || []}
                    onChange={(nextValue) => handleReturnDraftChange('productId', nextValue)}
                    placeholder="Search item..."
                    getOptionValue={(item) => item.productId}
                    getOptionLabel={(item) => getResolvedItemLabel(item.itemType, item.productId, item.product?.productName || 'Item')}
                    getOptionSubLabel={(item) => `Available: ${item.stockQuantity ?? 0}`}
                    getOptionSearchText={(item) =>
                      `${getResolvedItemLabel(item.itemType, item.productId, item.product?.productName || '')} ${item.product?.productName || ''} ${item.product?.productCode || ''} ${item.stockQuantity ?? 0}`
                    }
                    inputClassName="rounded-xl border border-gray-200 bg-white shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200 w-full px-3 py-2 text-sm"
                    menuClassName="absolute z-50 mt-1 w-full rounded-xl border border-gray-200 bg-white shadow-lg max-h-48 overflow-y-auto"
                    noResultsText="No items available"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Quantity</label>
                  <input
                    type="number"
                    min="1"
                    value={returnDraft.quantity}
                    onChange={(e) => handleReturnDraftChange('quantity', Number(e.target.value))}
                    className="rounded-xl border border-gray-200 bg-white shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200 w-full px-3 py-2 text-sm"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={addReturnItem}
                    className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white  shadow-sm transition hover:bg-slate-50 w-full px-3 py-2 text-xs font-semibold text-gray-700"
                  >
                    + Add Item
                  </button>
                </div>
              </div>

              {returnItems.length > 0 && (
                <div className="space-y-2">
                  {returnItems.map((item, index) => {
                    const options = returnOptions[item.itemType] || [];
                    const selected = options.find((opt) => opt.productId === item.productId);
                    const label = getResolvedItemLabel(item.itemType, item.productId, selected?.product?.productName || 'Item');
                    return (
                      <div key={`${item.itemType}-${index}`} className="rounded-2xl border border-slate-200/80 bg-white/95 shadow-sm p-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                        <div className="text-sm text-gray-700">
                          <span className="font-semibold">{item.itemType}</span> - {label} - Qty {item.quantity}
                        </div>
                        <button
                          type="button"
                          onClick={() => removeReturnItem(index)}
                          className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white  shadow-sm transition hover:bg-slate-50 px-3 py-1.5 text-xs font-semibold text-red-600"
                        >
                          Remove
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="flex justify-end">
                <button
                  onClick={submitReturn}
                  disabled={loading}
                  className="inline-flex items-center justify-center rounded-xl bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow transition hover:bg-primary-700 disabled:opacity-60"
                >
                  {loading ? 'Submitting...' : 'Submit Return'}
                </button>
              </div>
            </div>
          )}

          {activeTab === 'history' && renderHistorySection()}
        </div>
      </div>
    );
  }

  if (isManager) {
    return (
      <div className="space-y-4 sm:space-y-6 p-3 sm:p-6">
        <div className="relative overflow-hidden border border-transparent bg-gradient-to-br from-blue-50 via-slate-50 to-white p-4 sm:p-5 shadow-lg sm:p-6">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(129,140,248,0.2),_transparent_60%)]"></div>
          <div className="relative">
            <h1 className="text-3xl font-bold text-gray-900">Stock Assignment</h1>
            <p className="mt-1 text-sm text-gray-600">Accept stock from Super Admin and assign it to employees.</p>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white/95 p-4 shadow-xl shadow-slate-200/70 sm:p-6">
          <div className="flex justify-center border-b border-slate-200/80 pb-4">
            <div className="grid grid-cols-3 w-full max-w-3xl rounded-2xl border border-slate-200 bg-slate-100/80 p-1">
              <button
                onClick={() => setActiveTab('assigned')}
                className={`w-full text-center py-2 text-sm font-semibold rounded-xl transition ${
                  activeTab === 'assigned'
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Assigned Stock
              </button>
              <button
                onClick={() => setActiveTab('assign')}
                className={`w-full text-center py-2 text-sm font-semibold rounded-xl transition ${
                  activeTab === 'assign'
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Assign to Employees
              </button>
              <button
                onClick={() => setActiveTab('history')}
                className={`w-full text-center py-2 text-sm font-semibold rounded-xl transition ${
                  activeTab === 'history'
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                History
              </button>
            </div>
          </div>

          {activeTab === 'assigned' && (
            <div className="pt-4 sm:pt-6 space-y-4">
              {assignedTransfers.length === 0 && (
                <div className="text-sm text-gray-600 text-center py-6">
                  No stock assignments from Super Admin yet.
                </div>
              )}
              {assignedTransfers.map((transfer) => (
                <div key={transfer.id} className="rounded-2xl border border-slate-200/80 bg-white/95 shadow-sm p-4">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-gray-800">Transfer #{transfer.transferNumber}</p>
                      <p className="text-xs text-gray-500">Assigned by {transfer.creator?.fullName || 'Super Admin'}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => handleAcceptAssigned(transfer.id)}
                        disabled={loading}
                        className="inline-flex items-center justify-center rounded-xl bg-primary-600 px-3 py-2 text-xs font-semibold text-white shadow transition hover:bg-primary-700 disabled:opacity-60"
                      >
                        Accept Stock
                      </button>
                      <button
                        onClick={() => handleRejectAssigned(transfer.id)}
                        disabled={loading}
                        className="inline-flex items-center justify-center rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 shadow-sm transition hover:bg-rose-100 disabled:opacity-60"
                      >
                        Reject Stock
                      </button>
                    </div>
                  </div>
                  <div className="mt-3 space-y-2 text-xs text-gray-600">
                    {transfer.items?.map((item) => (
                      <div key={item.id} className="flex items-center justify-between rounded-xl bg-white/70 px-3 py-2">
                        <span>{item.itemType} - {getResolvedItemLabel(item.itemType, item.productId, item.product?.productName || 'Item')}</span>
                        <span className="font-semibold">Qty: {item.quantity}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'assign' && (
            <div className="pt-4 sm:pt-6 space-y-4 sm:space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Select Employee</label>
                  <select
                    value={selectedEmployee}
                    onChange={(e) => setSelectedEmployee(e.target.value)}
                    className="rounded-xl border border-gray-200 bg-white shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200 w-full px-3 py-2 text-sm"
                  >
                    <option value="">Choose employee</option>
                    {employees.map((emp) => (
                      <option key={emp.id} value={emp.id}>{emp.fullName}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3 items-end">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Item Type</label>
                  <select
                    value={draftItem.itemType}
                    onChange={(e) => handleDraftChange('itemType', e.target.value)}
                    className="rounded-xl border border-gray-200 bg-white shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200 w-full px-3 py-2 text-sm"
                  >
                    <option value="Empty Cylinder">Empty Cylinders</option>
                    <option value="Gas">Gas</option>
                    <option value="Tool">Tools</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Item</label>
                  <SearchableSelect
                    required
                    value={draftItem.productId}
                    options={assignDraftOptions}
                    onChange={(nextValue) => handleDraftChange('productId', nextValue)}
                    placeholder="Search item..."
                    getOptionValue={getTransferOptionId}
                    getOptionLabel={getTransferOptionLabel}
                    getOptionSubLabel={(item) => `Available: ${getTransferOptionStock(item)}`}
                    getOptionSearchText={getTransferOptionSearchText}
                    inputClassName="rounded-xl border border-gray-200 bg-white shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200 w-full px-3 py-2 text-sm"
                    menuClassName="absolute z-50 mt-1 w-full rounded-xl border border-gray-200 bg-white shadow-lg max-h-48 overflow-y-auto"
                    noResultsText="No assigned stock available"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Quantity</label>
                  <input
                    type="number"
                    min="1"
                    value={draftItem.quantity}
                    onChange={(e) => handleDraftChange('quantity', Number(e.target.value))}
                    className="rounded-xl border border-gray-200 bg-white shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200 w-full px-3 py-2 text-sm"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={addItemRow}
                    className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white shadow-sm transition hover:bg-slate-50 w-full px-3 py-2 text-xs font-semibold text-gray-700"
                  >
                    {editIndex !== null ? 'Update Item' : '+ Add Item'}
                  </button>
                </div>
              </div>

              {assignItems.length > 0 && (
                <div className="space-y-2">
                  {assignItems.map((item, index) => {
                    const options = activeProductOptions[item.itemType] || [];
                    const selected = options.find((opt) => getTransferOptionId(opt) === item.productId);
                    const selectedLabel = selected
                      ? getTransferOptionLabel(selected)
                      : getResolvedItemLabel(item.itemType, item.productId, 'Item');
                    return (
                      <div key={`${item.itemType}-${index}`} className="rounded-2xl border border-slate-200/80 bg-white/95 shadow-sm p-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                        <div className="text-sm text-gray-700">
                          <span className="font-semibold">{item.itemType}</span> - {selectedLabel} - Qty {item.quantity}
                        </div>
                        <button
                          type="button"
                          onClick={() => removeItemRow(index)}
                          className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white shadow-sm transition hover:bg-slate-50 px-3 py-1.5 text-xs font-semibold text-red-600"
                        >
                          Remove
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="flex justify-end">
                <button
                  onClick={handleSendStock}
                  disabled={loading}
                  className="inline-flex items-center justify-center rounded-xl bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow transition hover:bg-primary-700 disabled:opacity-60"
                >
                  {loading ? 'Sending...' : 'Send Stock to Employee'}
                </button>
              </div>
            </div>
          )}

          {activeTab === 'history' && renderHistorySection()}
        </div>
      </div>
    );
  }

  if (!isSuperAdmin) {
    return (
      <div className="rounded-2xl border border-slate-200/80 bg-white/95 shadow-sm p-4 sm:p-6 text-center text-sm text-gray-600">
        Access restricted to Super Admins, Managers, or Employees.
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 p-3 sm:p-6">
      <div className="relative overflow-hidden rounded-[14px] border border-transparent bg-gradient-to-br from-blue-50 via-slate-50 to-white p-4 sm:p-5 shadow-lg sm:p-6">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(129,140,248,0.2),_transparent_60%)]"></div>
        <div className="relative">
          <h1 className="text-3xl font-bold text-gray-900">Stock Assignment &amp; Return Stock</h1>
          <p className="mt-1 text-sm text-gray-600">Assign inventory to employees and receive returns with real-time updates.</p>
        </div>
      </div>

      <div className="overflow-visible rounded-2xl border border-slate-200/80 bg-white/95 p-4 shadow-xl shadow-slate-200/70 sm:p-6">
        <div className="flex justify-center border-b border-slate-200/80 pb-4">
          <div className="grid grid-cols-3 w-full max-w-3xl rounded-2xl border border-slate-200 bg-slate-100/80 p-1">
            <button
              onClick={() => setActiveTab('assign')}
              className={`w-full text-center py-2 text-sm font-semibold rounded-xl transition ${
                activeTab === 'assign'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Assign Stock
            </button>
            <button
              onClick={() => setActiveTab('return')}
              className={`w-full text-center py-2 text-sm font-semibold rounded-xl transition ${
                activeTab === 'return'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Return Stock
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`w-full text-center py-2 text-sm font-semibold rounded-xl transition ${
                activeTab === 'history'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Assigned/Returned History
            </button>
          </div>
        </div>

        {activeTab === 'assign' && (
          <div className="pt-4 sm:pt-6 space-y-4 sm:space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Select Employee or Manager</label>
                <select
                  value={selectedEmployee}
                  onChange={(e) => setSelectedEmployee(e.target.value)}
                  className="rounded-xl border border-gray-200 bg-white shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200 w-full px-3 py-2 text-sm"
                >
                  <option value="">Choose recipient</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.fullName} ({emp.role === 'manager' ? 'Manager' : 'Employee'})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-gray-700">Items to Assign</p>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3 items-end">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Item Type</label>
                  <select
                    value={draftItem.itemType}
                    onChange={(e) => handleDraftChange('itemType', e.target.value)}
                    className="rounded-xl border border-gray-200 bg-white shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200 w-full px-3 py-2 text-sm"
                  >
                    <option value="Empty Cylinder">Empty Cylinders</option>
                    <option value="Gas">Gas</option>
                    <option value="Tool">Tools</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Item</label>
                  <SearchableSelect
                    required
                    value={draftItem.productId}
                    options={assignDraftOptions}
                    onChange={(nextValue) => handleDraftChange('productId', nextValue)}
                    placeholder={draftItem.itemType === 'Gas' ? 'Search gas...' : 'Search item...'}
                    getOptionValue={getTransferOptionId}
                    getOptionLabel={getTransferOptionLabel}
                    getOptionSubLabel={(item) => `Available: ${getTransferOptionStock(item)}`}
                    getOptionSearchText={getTransferOptionSearchText}
                    inputClassName="rounded-xl border border-gray-200 bg-white shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200 w-full px-3 py-2 text-sm"
                    menuClassName="absolute z-50 mt-1 w-full rounded-xl border border-gray-200 bg-white shadow-lg max-h-48 overflow-y-auto"
                    noResultsText="No items available"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Quantity</label>
                  <input
                    type="number"
                    min="1"
                    value={draftItem.quantity}
                    onChange={(e) => handleDraftChange('quantity', Number(e.target.value))}
                    className="rounded-xl border border-gray-200 bg-white shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200 w-full px-3 py-2 text-sm"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={addItemRow}
                    className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white  shadow-sm transition hover:bg-slate-50 w-full px-3 py-2 text-xs font-semibold text-gray-700"
                  >
                    {editIndex !== null ? 'Update Item' : '+ Add Item'}
                  </button>
                  {editIndex !== null && (
                    <button
                      type="button"
                      onClick={resetDraft}
                      className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white  shadow-sm transition hover:bg-slate-50 px-3 py-2 text-xs font-semibold text-gray-700"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </div>

              {assignItems.length > 0 && (
                <div className="space-y-2">
                  {assignItems.map((item, index) => {
                    const options = productOptions[item.itemType] || [];
                    const selected = options.find((opt) => getTransferOptionId(opt) === item.productId);
                    const selectedLabel = selected
                      ? getTransferOptionLabel(selected)
                      : getResolvedItemLabel(item.itemType, item.productId, 'Item');
                    return (
                      <div key={`${item.itemType}-${index}`} className="rounded-2xl border border-slate-200/80 bg-white/95 shadow-sm p-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                        <div className="text-sm text-gray-700">
                          <span className="font-semibold">{item.itemType}</span> - {selectedLabel} - Qty {item.quantity}
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => startEditRow(index)}
                            className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white  shadow-sm transition hover:bg-slate-50 px-3 py-1.5 text-xs font-semibold text-gray-700"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => removeItemRow(index)}
                            className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white  shadow-sm transition hover:bg-slate-50 px-3 py-1.5 text-xs font-semibold text-red-600"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex justify-center">
              <div className="w-full max-w-2xl flex justify-center">
                <button
                  onClick={handleSendStock}
                  disabled={loading}
                  className="inline-flex items-center justify-center rounded-xl bg-primary-600 w-full px-4 py-2 text-sm font-semibold text-white shadow transition hover:bg-primary-700 disabled:opacity-60"
                >
                  {loading ? 'Sending...' : 'Send Stock'}
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'return' && (
          <div className="pt-4 sm:pt-6 space-y-4">
            {returns.length === 0 && (
              <div className="text-sm text-gray-600 text-center py-6">
                No pending returns at the moment.
              </div>
            )}
            {returns.map((transfer) => (
              <div key={transfer.id} className="rounded-2xl border border-slate-200/80 bg-white/95 shadow-sm p-4">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{transfer.employee?.fullName || 'Employee'}</p>
                    <p className="text-xs text-gray-500">Transfer #{transfer.transferNumber}</p>
                  </div>
                  <button
                    onClick={() => handleAcceptReturn(transfer.id)}
                    className="inline-flex items-center justify-center rounded-xl bg-primary-600 px-3 py-2 text-xs font-semibold text-white shadow transition hover:bg-primary-700"
                  >
                    Accept Return
                  </button>
                </div>
                <div className="mt-3 space-y-2 text-xs text-gray-600">
                  {transfer.items?.map((item) => (
                    <div key={item.id} className="flex items-center justify-between rounded-xl bg-white/70 px-3 py-2">
                      <span>{item.itemType} - {getResolvedItemLabel(item.itemType, item.productId, item.product?.productName || 'Item')}</span>
                      <span className="font-semibold">Qty: {item.quantity}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'history' && renderHistorySection()}
      </div>
    </div>
  );
};

export default StockTransfers;

