import React, { useEffect, useState, useRef, useMemo } from 'react';
import api from '../utils/api';
import toast from 'react-hot-toast';
import CustomerSignaturePad from '../components/CustomerSignaturePad';
import PdfShareDialog from '../components/PdfShareDialog';
import { useAuth } from '../context/AuthContext';
import SearchableSelect from '../components/SearchableSelect';
import { buildCustomerRateKey } from '../utils/customerRate';
import {
  captureElementToPdfBlob,
  runPdfDownload,
  saveBlobAsFile
} from '../utils/pdfDownload';
import {
  XMarkIcon,
  MagnifyingGlassIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  CircleStackIcon,
  BellAlertIcon,
  ArrowDownTrayIcon,
  PrinterIcon,
  EllipsisVerticalIcon,
  PencilSquareIcon,
  TrashIcon
} from '@heroicons/react/24/outline';
import { buildPrintHtml } from '../utils/printUtils';

const DepositWaveGraphic = ({ stroke, fillId }) => (
  <svg
    className="pointer-events-none absolute bottom-0 right-0 h-14 w-28 opacity-35"
    viewBox="0 0 96 48"
    aria-hidden="true"
  >
    <defs>
      <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={stroke} stopOpacity="0.28" />
        <stop offset="100%" stopColor={stroke} stopOpacity="0" />
      </linearGradient>
    </defs>
    <path
      d="M0 30 L16 26 L32 34 L48 20 L64 26 L80 18 L96 24 L96 48 L0 48 Z"
      fill={`url(#${fillId})`}
    />
    <path
      d="M0 30 L16 26 L32 34 L48 20 L64 26 L80 18 L96 24"
      fill="none"
      stroke={stroke}
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const DepositStatCard = ({
  title,
  value,
  subtitle,
  icon: Icon,
  cardGradient,
  iconGradient,
  glowClass,
  waveColor,
  waveId
}) => (
  <div className={`relative overflow-hidden rounded-2xl border border-white/70 p-4 shadow-[0_8px_24px_rgba(15,23,42,0.06)] sm:p-5 ${cardGradient}`}>
    <DepositWaveGraphic stroke={waveColor} fillId={waveId} />
    <div className="relative flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-xs font-medium text-slate-600">{title}</p>
        <p className="mt-1 text-2xl font-bold leading-none text-slate-900 sm:text-3xl">{value}</p>
        <p className="mt-1.5 text-[11px] text-slate-400">{subtitle}</p>
      </div>
      <div className="relative shrink-0">
        <div className={`absolute -inset-1 rounded-full blur-md ${glowClass}`} />
        <div className={`relative flex h-12 w-12 items-center justify-center rounded-full shadow-lg ${iconGradient}`}>
          <Icon className="h-5 w-5 text-white" />
        </div>
      </div>
    </div>
  </div>
);

const formatDpNumber = (value) => {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (!digits) return '000000';
  return digits.padStart(6, '0').slice(-6);
};

const formatInvoiceLabel = (type, value) => {
  const normalized = type === 'Return' ? 'RET NO' : 'DP NO';
  return `${normalized}: ${formatDpNumber(value)}`;
};

const buildItemRow = (dep, it) => {
  const quantity = it.quantity || 0;
  const price = it.price || 0;
  const amount = it.amount || (price * quantity);
  return {
    key: `${dep.id}_${it.id}`,
    itemId: it.id,
    depositId: dep.id,
    invoice: dep.invoiceNumber || dep.id,
    invoiceNumber: dep.invoiceNumber || dep.id,
    depositDate: dep.createdAt,
    type: it.returned ? 'Return' : 'Deposit',
    customerId: dep.customerId,
    customer: dep.customer?.name || dep.customer?.companyName || dep.customer?.fullName || '',
    productId: it.productId || it.product?.id,
    product: it.product?.productName || it.productName || '',
    size: it.product?.productName || it.productName || '',
    quantity,
    price,
    amount,
    depositAmount: dep.totalAmount || 0,
    refillAmount: 0,
    returnAmount: it.returned ? amount : 0,
    paymentMethod: dep.paymentType || '',
    securityCash: dep.securityCash || '',
    bankName: dep.bankName || '',
    checkNumber: dep.checkNumber || '',
    notes: dep.notes || '',
    status: dep.status || 'open'
  };
};

export default function Deposits() {
  const { user, isSuperAdmin } = useAuth();
  const canEditInvoices = isSuperAdmin;
  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState('deposit'); // deposit or return

  const [customers, setCustomers] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState('');
  const [selectedCustomerObj, setSelectedCustomerObj] = useState(null);

  // Deposit flow
  const [emptyProducts, setEmptyProducts] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [price, setPrice] = useState(0);
  const [items, setItems] = useState([]);
  const [editingIndex, setEditingIndex] = useState(null);
  const [paymentType, setPaymentType] = useState('Cash');
  const [bankName, setBankName] = useState('');
  const [checkNumber, setCheckNumber] = useState('');

  // Signature
  const [showSignaturePad, setShowSignaturePad] = useState(false);
  const [customerSignature, setCustomerSignature] = useState(null);
  const [customerSignedName, setCustomerSignedName] = useState('');
  const [transactionType, setTransactionType] = useState('');
  const [notes, setNotes] = useState('');
  const [customerQuery, setCustomerQuery] = useState('');
  const [customerSuggestions, setCustomerSuggestions] = useState([]);
  const [productQuery, setProductQuery] = useState('');
  const [productSuggestions, setProductSuggestions] = useState([]);
  const [selectedProductObj, setSelectedProductObj] = useState(null);
  const modalRef = useRef(null);
  const savingTransactionRef = useRef(false);
  const [customerRates, setCustomerRates] = useState({});
  const [editCustomerRates, setEditCustomerRates] = useState({});
  const [priceWarning, setPriceWarning] = useState(null);

  const [pendingSubmit, setPendingSubmit] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);
  const [isSavingTransaction, setIsSavingTransaction] = useState(false);
  const [editingReturn, setEditingReturn] = useState(null);

  // Return flow
  const [customerDeposits, setCustomerDeposits] = useState([]);
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [expandedReturnInvoices, setExpandedReturnInvoices] = useState({});
  const [selectedReturnDeposit, setSelectedReturnDeposit] = useState(null);
  const [returnEntryMode, setReturnEntryMode] = useState('');
  const [returnProducts, setReturnProducts] = useState([]);
  const [manualReturnProductQuery, setManualReturnProductQuery] = useState('');
  const [manualReturnProductSuggestions, setManualReturnProductSuggestions] = useState([]);
  const [manualReturnProductObj, setManualReturnProductObj] = useState(null);
  const [manualReturnQuantity, setManualReturnQuantity] = useState(1);

  // Transactions list
  const [transactions, setTransactions] = useState([]);
  const [returnTransactions, setReturnTransactions] = useState([]);
  const [pendingAlerts, setPendingAlerts] = useState([]);
  const [showPendingAlerts, setShowPendingAlerts] = useState(false);
  const [pendingAlertsLoading, setPendingAlertsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [activeTab, setActiveTab] = useState('all');
  const [openActionMenuId, setOpenActionMenuId] = useState(null);
  const [expandedDepositItems, setExpandedDepositItems] = useState({});
  const [lastDeposit, setLastDeposit] = useState(null);
  const [showLastModal, setShowLastModal] = useState(false);
  const [editingRow, setEditingRow] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editCustomerId, setEditCustomerId] = useState('');
  const [editProductId, setEditProductId] = useState('');
  const [editQuantity, setEditQuantity] = useState(1);
  const [editPrice, setEditPrice] = useState(0);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');
  const [sharePrompt, setSharePrompt] = useState(null);

  useEffect(() => {
    fetchCustomers();
    fetchEmptyProducts();
    fetchReturnProducts();
    fetchTransactions();
  }, []);

  useEffect(() => {
    if (selectedCustomer) {
      fetchCustomerRates(selectedCustomer, setCustomerRates);
    } else {
      setCustomerRates({});
      setPriceWarning(null);
    }
  }, [selectedCustomer]);

  useEffect(() => {
    const prod = selectedProductObj || emptyProducts.find(p =>
      p.productName === productQuery ||
      p.productId === productQuery ||
      p.inventoryItemId === productQuery ||
      p.productId === selectedProduct ||
      p.inventoryItemId === selectedProduct
    );
    if (!prod) return;
    const minRate = getCustomerMinRate(prod.productId, customerRates);
    if (minRate && parseFloat(price) < minRate) {
      setPrice(minRate);
      setPriceWarning({ minRate, productName: prod.productName });
    }
  }, [customerRates]);

  useEffect(() => {
    if (showEditModal && editCustomerId) {
      fetchCustomerRates(editCustomerId, setEditCustomerRates);
    } else {
      setEditCustomerRates({});
    }
  }, [showEditModal, editCustomerId]);

  useEffect(() => {
    if (!showModal) {
      setShowReturnModal(false);
      return;
    }
    if (transactionType === 'return') {
      if (!selectedCustomer) {
        alert('Please select a customer first');
        setTransactionType('');
        return;
      }
      if (!editingReturn) {
        setItems([]);
        setSelectedReturnDeposit(null);
        setReturnEntryMode('');
        setShowReturnModal(true);
      } else {
        setReturnEntryMode('invoice');
        setShowReturnModal(false);
      }
    } else {
      setShowReturnModal(false);
      setSelectedReturnDeposit(null);
      setReturnEntryMode('');
      setItems([]);
    }
  }, [transactionType, showModal, selectedCustomer, editingReturn]);

  async function fetchCustomers() {
    try {
      const res = await api.get('/customers');
      const payload = res.data;
      const list = payload && payload.data ? payload.data : (Array.isArray(payload) ? payload : []);
      setCustomers(list);
    } catch (err) {
      console.error(err);
    }
  }

  async function fetchEmptyProducts() {
    try {
      const res = await api.get('/deposits/products-empty');
      setEmptyProducts(res.data.data || []);
    } catch (err) {
      console.error(err);
    }
  }

  async function fetchReturnProducts() {
    try {
      const res = await api.get('/products', { params: { isActive: true } });
      const list = res.data?.data || [];
      const normalized = list
        .filter((product) => product?.productType === 'Cylinder')
        .map((product) => ({
          productId: product.id,
          productName: product.productName || '',
          productCode: product.productCode || ''
        }));
      setReturnProducts(normalized);
    } catch (err) {
      console.error(err);
      setReturnProducts([]);
    }
  }

  async function fetchTransactions() {
    try {
      const [depositsRes, returnsRes] = await Promise.all([
        api.get('/deposits'),
        api.get('/deposits/returns')
      ]);
      setTransactions(depositsRes.data.data || []);
      setReturnTransactions(returnsRes.data.data || []);
      fetchPendingAlerts();
    } catch (err) {
      console.error(err);
    }
  }

  async function fetchPendingAlerts() {
    setPendingAlertsLoading(true);
    try {
      const res = await api.get('/deposits/pending-summary');
      const normalized = (res.data?.data || []).filter((entry) => Number(entry?.pendingQuantity || 0) > 0);
      setPendingAlerts(normalized);
    } catch (err) {
      console.error(err);
      setPendingAlerts([]);
    } finally {
      setPendingAlertsLoading(false);
    }
  }

  async function fetchCustomerRates(customerId, setter) {
    if (!customerId) {
      setter({});
      return;
    }
    try {
      const res = await api.get('/customer-item-rates', { params: { customerId } });
      const list = res.data?.data || [];
      const map = {};
      list.forEach((rate) => {
        const productId = rate.itemId || rate.product?.id;
        const value = parseFloat(rate.rate);
        const normalizedType = String(rate.itemType || '').trim().toLowerCase();
        const isEmptyCylinderRate =
          buildCustomerRateKey(rate.itemType, productId) === buildCustomerRateKey('Empty Cylinder', productId) ||
          normalizedType === 'cylinder';

        if (productId && Number.isFinite(value) && isEmptyCylinderRate) {
          map[productId] = value;
        }
      });
      setter(map);
    } catch (err) {
      setter({});
    }
  }

  const getCustomerMinRate = (productId, ratesMap) => {
    if (!productId) return null;
    const rate = (ratesMap || {})[productId];
    return Number.isFinite(rate) && rate > 0 ? rate : null;
  };

  const resolveSelectedProduct = () => (
    selectedProductObj || emptyProducts.find(p =>
      p.productName === productQuery ||
      p.productId === productQuery ||
      p.inventoryItemId === productQuery ||
      p.productId === selectedProduct ||
      p.inventoryItemId === selectedProduct
    )
  );

  async function onAddItem() {
    // prefer the selectedProductObj (from suggestions); fallback to matching by query/value
    const prod = resolveSelectedProduct();
    if (!prod) return alert('Please select a valid product');
    const q = parseInt(quantity || 0, 10);
    if (!q || q <= 0) return alert('Quantity must be at least 1');
    const minRate = getCustomerMinRate(prod.productId, customerRates);
    const fallbackPrice = parseFloat(prod.defaultPrice || 0) || 0;
    let p = parseFloat(price || fallbackPrice);
    if (!Number.isFinite(p) || p <= 0) {
      p = Number.isFinite(minRate) ? minRate : fallbackPrice;
    }
    if (minRate && p < minRate) {
      setPriceWarning({ minRate, productName: prod.productName });
      return;
    }
    if (isNaN(p) || p <= 0) return alert('Enter a valid price');
    const it = { productId: prod.productId, productName: prod.productName || '', inventoryItemId: prod.inventoryItemId, quantity: q, price: parseFloat(p.toFixed(2)) };
    if (editingIndex !== null) {
      setItems(prev => prev.map((row, i) => (i === editingIndex ? it : row)));
      setEditingIndex(null);
    } else {
      setItems(prev => [...prev, it]);
    }
    setQuantity(1);
    setPrice(0);
    setPriceWarning(null);
    setSelectedProduct('');
    setSelectedProductObj(null);
    setProductQuery('');
  }

  async function onSaveDeposit() {
    if (!selectedCustomer || items.length === 0) return alert('Select customer and add items');
    if (!customerSignature) return alert('Customer signature is required');
    try {
      const payload = { customerId: selectedCustomer, paymentType, bankName, checkNumber, items, customerSignature };
      await api.post('/deposits', payload);
      alert('Deposit saved');
      setItems([]);
      setCustomerSignature(null);
      setCustomerSignedName('');
      setShowModal(false);
      fetchEmptyProducts();
      fetchTransactions();
    } catch (err) {
      console.error(err);
      alert('Failed to save deposit');
    }
  }

  async function fetchCustomerDeposits(customerId) {
    if (!customerId) {
      setCustomerDeposits([]);
      return [];
    }
    try {
      const res = await api.get(`/deposits/customer/${customerId}`);
      const list = res.data.data || [];
      setCustomerDeposits(list);
      return list;
    } catch (err) {
      console.error(err);
      setCustomerDeposits([]);
      return [];
    }
  }

  function openReturnInvoicePicker() {
    if (!selectedCustomer) {
      alert('Please select a customer first');
      return;
    }
    if (returnEntryMode === 'manual') {
      setItems([]);
      setSelectedReturnDeposit(null);
      clearManualReturnSelection();
    }
    setReturnEntryMode('invoice');
    fetchCustomerDeposits(selectedCustomer);
    setShowReturnModal(true);
  }

  function clearManualReturnSelection() {
    setManualReturnProductQuery('');
    setManualReturnProductSuggestions([]);
    setManualReturnProductObj(null);
    setManualReturnQuantity(1);
  }

  function activateManualReturnEntry() {
    if (!selectedCustomer) {
      alert('Please select a customer first');
      return;
    }
    setReturnEntryMode('manual');
    setSelectedReturnDeposit(null);
    setItems([]);
    setShowReturnModal(false);
    clearManualReturnSelection();
  }

  function handleUseReturnDeposit(dep) {
    if (!dep) return;
    const returnItems = (dep.items || []).map(it => ({
      depositItemId: it.id,
      productId: it.productId,
      productName: it.productName || '',
      quantity: it.remainingQuantity || 0,
      maxQuantity: it.remainingQuantity || 0,
      price: 0
    })).filter(it => it.quantity > 0);
    setItems(returnItems);
    setReturnEntryMode('invoice');
    setSelectedReturnDeposit(dep);
    setShowReturnModal(false);
    clearManualReturnSelection();
  }

  function updateReturnQuantity(index, value) {
    const num = Math.max(0, parseInt(value || 0, 10) || 0);
    setItems(prev => prev.map((it, i) => {
      if (i !== index) return it;
      const max = Number(it.maxQuantity || 0);
      const nextQty = max > 0 ? Math.min(num, max) : num;
      return { ...it, quantity: nextQty };
    }));
  }

  function handleManualReturnProductInput(q) {
    setManualReturnProductQuery(q);
    if (!q) {
      setManualReturnProductSuggestions([]);
      return;
    }
    const ql = q.toLowerCase();
    const matches = returnProducts
      .filter((product) =>
        (product.productName || '').toLowerCase().includes(ql)
        || (product.productCode || '').toLowerCase().includes(ql)
      )
      .slice(0, 8);
    setManualReturnProductSuggestions(matches);
  }

  function selectManualReturnProduct(product) {
    setManualReturnProductObj(product);
    setManualReturnProductQuery(product.productName || '');
    setManualReturnProductSuggestions([]);
  }

  function addManualReturnItem() {
    const product = manualReturnProductObj || returnProducts.find((entry) =>
      entry.productName === manualReturnProductQuery
      || entry.productId === manualReturnProductQuery
      || entry.productCode === manualReturnProductQuery
    );
    if (!product?.productId) {
      toast.error('Please select a valid cylinder product');
      return;
    }

    const qty = parseInt(manualReturnQuantity || 0, 10) || 0;
    if (qty <= 0) {
      toast.error('Quantity must be at least 1');
      return;
    }

    setItems((prev) => {
      const existingIndex = prev.findIndex((item) => !item.depositItemId && item.productId === product.productId);
      if (existingIndex === -1) {
        return [...prev, {
          productId: product.productId,
          productName: product.productName || '',
          quantity: qty,
          price: 0
        }];
      }
      return prev.map((item, index) => (
        index === existingIndex
          ? { ...item, quantity: (parseInt(item.quantity || 0, 10) || 0) + qty }
          : item
      ));
    });

    clearManualReturnSelection();
  }

  const totalAmount = items.reduce((s, it) => s + (parseFloat(it.price || 0) * (it.quantity || 0)), 0);
  const returnItemCount = items.reduce((s, it) => s + ((it.quantity || 0) > 0 ? 1 : 0), 0);
  const isManualReturnMode = transactionType === 'return' && returnEntryMode === 'manual';

  function openNewTransaction(type) {
    setModalType(type);
    setShowModal(true);
    setItems([]);
    setEditingIndex(null);
    setCustomerSignature(null);
    setCustomerSignedName('');
    setTransactionType('');
    setNotes('');
    setSelectedReturnDeposit(null);
    setReturnEntryMode('');
    setCustomerQuery('');
    setCustomerSuggestions([]);
    setProductQuery('');
    setProductSuggestions([]);
    setSelectedProductObj(null);
    setShowReturnModal(false);
    setExpandedReturnInvoices({});
    setPriceWarning(null);
    setEditingReturn(null);
    setPendingSubmit(false);
    setIsSavingTransaction(false);
    clearManualReturnSelection();
    savingTransactionRef.current = false;
    // ensure customers list is fresh and customer details available
    fetchCustomers();
  }

  function handleCustomerInput(q) {
    setCustomerQuery(q);
    if (!q) return setCustomerSuggestions([]);
    const ql = q.toLowerCase();
    const matches = customers.filter(c => {
      return (c.name || c.customerCode || '').toLowerCase().includes(ql) || (c.phone||'').toLowerCase().includes(ql) || (c.email||'').toLowerCase().includes(ql) || (c.customerCode||'').toLowerCase().includes(ql);
    }).slice(0,8);
    setCustomerSuggestions(matches);
  }

  function selectCustomer(c) {
    setSelectedCustomer(c.id);
    setSelectedCustomerObj(c);
    setCustomerQuery(c.name || c.customerCode || c.phone || '');
    setCustomerSuggestions([]);
    if (transactionType === 'return') {
      setSelectedReturnDeposit(null);
      setReturnEntryMode('');
      setItems([]);
      clearManualReturnSelection();
    }
    fetchCustomerDeposits(c.id);
  }

  function handleProductInput(q) {
    setProductQuery(q);
    if (!q) return setProductSuggestions([]);
    const ql = q.toLowerCase();
    const matches = emptyProducts.filter(p => (p.productName||'').toLowerCase().includes(ql)).slice(0,8);
    setProductSuggestions(matches);
  }

  function selectProduct(p) {
    setSelectedProductObj(p);
    // keep track of selected inventory id so add works consistently
    setSelectedProduct(p.inventoryItemId || p.productId);
    setProductQuery(p.productName);
    // auto-fill default price or customer fixed rate
    const minRate = getCustomerMinRate(p.productId, customerRates);
    const fallbackPrice = parseFloat(p.defaultPrice || 0) || 0;
    const nextPrice = Number.isFinite(minRate) ? minRate : fallbackPrice;
    setPrice(nextPrice);
    setPriceWarning(null);
    setProductSuggestions([]);
  }

  function onSignatureSave(sigData, name) {
    setCustomerSignature(sigData);
    setCustomerSignedName(name);
    setShowSignaturePad(false);
    if (pendingSubmit) {
      // proceed with submission after signature is collected
      setPendingSubmit(false);
      submitTransaction(sigData);
    }
  }

  async function submitTransaction(sigDataOrEvent) {
    const signatureArg = (sigDataOrEvent && typeof sigDataOrEvent === 'object' && (
      typeof sigDataOrEvent.preventDefault === 'function' || sigDataOrEvent.nativeEvent
    )) ? null : sigDataOrEvent;
    if (savingTransactionRef.current) return;
    if (!transactionType) {
      toast.error('Transaction type is required');
      return;
    }
    if (!selectedCustomer) {
      toast.error('Customer is required');
      return;
    }

    const signatureToUse = signatureArg || customerSignature;

    if (!signatureToUse) {
      setPendingSubmit(true);
      setShowSignaturePad(true);
      return;
    }

      if (transactionType !== 'return') {
        const invalidItem = (items || []).find((it) => {
          const minRate = getCustomerMinRate(it.productId, customerRates);
          return minRate && parseFloat(it.price) < minRate;
        });
        if (invalidItem) {
          const minRate = getCustomerMinRate(invalidItem.productId, customerRates);
          setPriceWarning({ minRate, productName: invalidItem.productName });
          toast.error(`This customer has a fixed rate. Minimum allowed price is AED ${minRate.toFixed(2)}.`);
          return;
        }
      }

      let returnPayload = null;
      if (transactionType === 'return') {
        const payloadCustomerId =
          selectedReturnDeposit?.customerId ||
          editingReturn?.customerId ||
          selectedCustomer;

        if (!payloadCustomerId) {
          toast.error('Customer is required');
          return;
        }

        const linkedReturnItems = (items || [])
          .filter(it => it.depositItemId && (it.quantity || 0) > 0)
          .map((it) => ({
            depositItemId: String(it.depositItemId),
            quantity: parseInt(it.quantity || 0, 10) || 0
          }))
          .filter((it) => it.quantity > 0);

        const manualReturnItems = (items || [])
          .filter(it => !it.depositItemId && it.productId && (it.quantity || 0) > 0)
          .map((it) => ({
            productId: String(it.productId),
            quantity: parseInt(it.quantity || 0, 10) || 0
          }))
          .filter((it) => it.quantity > 0);

        if (linkedReturnItems.length > 0 && manualReturnItems.length > 0) {
          toast.error('Use either a deposit invoice or manual return items in one return.');
          return;
        }

        if (!editingReturn && linkedReturnItems.length === 0 && manualReturnItems.length === 0) {
          toast.error('Please select a deposit invoice or add manual return items');
          return;
        }

        if (!editingReturn && !selectedReturnDeposit && manualReturnItems.length === 0) {
          toast.error('Please select a deposit invoice to return');
          return;
        }

        const seenIds = new Set();
        for (const it of linkedReturnItems) {
          if (seenIds.has(it.depositItemId)) {
            toast.error('Duplicate return items are not allowed');
            return;
          }
          seenIds.add(it.depositItemId);
        }

        const seenManualProducts = new Set();
        for (const it of manualReturnItems) {
          if (seenManualProducts.has(it.productId)) {
            toast.error('Duplicate manual return products are not allowed');
            return;
          }
          seenManualProducts.add(it.productId);
        }

        if (linkedReturnItems.length === 0 && manualReturnItems.length === 0) {
          toast.error('Select at least one item to return');
          return;
        }

        if (linkedReturnItems.length > 0) {
          // Validate latest remaining quantities just before submit to avoid stale 400 errors.
          const latestDeposits = await fetchCustomerDeposits(payloadCustomerId);
          const remainingByItem = new Map();
          (latestDeposits || []).forEach((dep) => {
            (dep.items || []).forEach((it) => {
              remainingByItem.set(String(it.id), parseInt(it.remainingQuantity || 0, 10) || 0);
            });
          });

          for (const it of linkedReturnItems) {
            const remaining = remainingByItem.get(String(it.depositItemId));
            if (remaining == null) {
              toast.error('Some selected items are no longer returnable. Please reselect invoice.');
              return;
            }
            if (it.quantity > remaining) {
              toast.error(`Return quantity exceeds remaining stock (available: ${remaining}).`);
              setItems((prev) => prev.map((row) => (
                String(row.depositItemId) === String(it.depositItemId)
                  ? { ...row, quantity: remaining, maxQuantity: remaining }
                  : row
              )));
              return;
            }
          }
        }

        returnPayload = {
          customerId: payloadCustomerId,
          items: linkedReturnItems.length > 0 ? linkedReturnItems : manualReturnItems,
          customerSignature: signatureToUse,
          receivedByName: customerSignedName,
          notes
        };
      }

      try {
        savingTransactionRef.current = true;
        setIsSavingTransaction(true);
        if (transactionType === 'return') {
          if (editingReturn) {
            await api.put(`/deposits/returns/${editingReturn.id}`, returnPayload);
          } else {
            await api.post('/deposits/return', returnPayload);
          }
        } else {
          const payload = { customerId: selectedCustomer, paymentType, bankName, checkNumber, items, customerSignature: signatureToUse, receivedByName: customerSignedName, transactionType, notes };
          await api.post('/deposits', payload);
        }
        toast.success(transactionType === 'return'
          ? (editingReturn ? 'Return updated' : 'Return saved')
          : 'Transaction saved');
        setShowModal(false);
        setShowReturnModal(false);
        setItems([]);
        setCustomerSignature(null);
        setCustomerSignedName('');
        setSelectedReturnDeposit(null);
        setReturnEntryMode('');
        setEditingReturn(null);
        setPendingSubmit(false);
        clearManualReturnSelection();
        fetchTransactions();
        fetchEmptyProducts();
        if (transactionType === 'return') {
          fetchCustomerDeposits(selectedCustomer);
        }
      } catch (err) {
        console.error('Submit transaction failed:', {
          status: err?.response?.status,
          message: err?.response?.data?.message,
          data: err?.response?.data,
          url: err?.config?.url
        });
        const msg = err?.response?.data?.message || 'Failed to save transaction';
        toast.error(msg);
      } finally {
        setIsSavingTransaction(false);
        savingTransactionRef.current = false;
      }
    }

  function buildInvoiceTemplateHtml({
    invoiceLabel,
    invoiceNumber,
    invoiceDate,
    transactionType,
    paymentLabel,
    customer,
    items,
    totalQuantity,
    totalAmount,
    notes,
    signatures
  }) {
    const customerName = customer?.companyName || customer?.fullName || customer?.name || 'N/A';
    const customerPhone = customer?.phone || '';
    const customerEmail = customer?.email || '';
    const customerAddress = customer?.address || '';
    const formattedDate = invoiceDate ? new Date(invoiceDate).toLocaleDateString('en-GB') : 'N/A';
    const safePayment = paymentLabel || '';

    const itemsHtml = (items || []).map((it, idx) => (
      `<tr>
        <td>${idx + 1}</td>
        <td>${it.name || '-'}</td>
        <td style="text-align:center;">${it.qty ?? 0}</td>
        <td style="text-align:right;">${it.rate != null ? `AED ${Number(it.rate).toFixed(2)}` : '-'}</td>
        <td style="text-align:right;">AED ${Number(it.total || 0).toFixed(2)}</td>
      </tr>`
    )).join('');

    const renderSignatureBlock = (label, name, signature) => `
      <div class="signature-box">
        <div class="${signature ? 'signature-image' : 'signature-placeholder'}">
          ${signature ? `<img src="${signature}" alt="${label}" />` : '<span>No Signature</span>'}
        </div>
        <div class="signature-label">
          <p class="signature-title">${label}</p>
          <p class="signature-name">${name || 'N/A'}</p>
        </div>
      </div>
    `;

    const styles = `
      .invoice-container { background: #fff; padding: 40px; font-family: Arial, sans-serif; color: #000; }
      .invoice-header { text-align: center; border-bottom: 4px solid #2563eb; padding-bottom: 24px; margin-bottom: 32px; }
      .invoice-header h1 { font-size: 32px; font-weight: bold; color: #1e3a8a; margin-bottom: 8px; }
      .invoice-header p { font-size: 14px; color: #4b5563; margin: 0; }
      .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; margin-bottom: 32px; }
      .bill-to-title { font-size: 12px; font-weight: 600; color: #6b7280; text-transform: uppercase; margin-bottom: 8px; }
      .details-block p { margin: 0 0 6px 0; font-size: 14px; }
      .invoice-number { font-size: 20px; font-weight: bold; color: #111827; margin: 0 0 12px 0; }
      .items-table { width: 100%; border-collapse: collapse; border: 1px solid #d1d5db; margin-bottom: 32px; }
      .items-table th { background: #1e3a8a; color: #fff; padding: 12px; font-size: 14px; text-align: left; border: 1px solid #d1d5db; }
      .items-table td { border: 1px solid #d1d5db; padding: 12px; font-size: 14px; }
      .summary { display: flex; justify-content: flex-end; margin-bottom: 32px; }
      .summary-box { width: 350px; background: #f9fafb; border: 1px solid #d1d5db; border-radius: 8px; padding: 16px; }
      .summary-row { display: flex; justify-content: space-between; font-size: 14px; margin-bottom: 8px; }
      .summary-total { display: flex; justify-content: space-between; font-size: 18px; font-weight: bold; border-top: 2px solid #2563eb; padding-top: 8px; color: #1e3a8a; }
      .notes-box { margin-bottom: 32px; padding: 16px; background: #fef3c7; border: 1px solid #fbbf24; border-radius: 8px; }
      .notes-box h4 { font-size: 14px; font-weight: 600; color: #374151; margin-bottom: 8px; }
      .signatures { display: grid; grid-template-columns: repeat(2, 1fr); gap: 24px; margin-top: 48px; padding-top: 32px; border-top: 2px solid #e5e7eb; }
      .signature-box { text-align: center; }
      .signature-image, .signature-placeholder { padding: 8px; height: 120px; display: flex; align-items: center; justify-content: center; background: transparent; }
      .signature-placeholder { color: #9ca3af; font-size: 14px; }
      .signature-image img { max-height: 100%; max-width: 100%; object-fit: contain; }
      .signature-label { border-top: 2px solid #1f2937; padding-top: 8px; }
      .signature-title { font-weight: 600; color: #111827; font-size: 14px; margin: 0; }
      .signature-name { font-size: 12px; color: #6b7280; margin: 2px 0 0 0; }
      .footer { margin-top: 48px; padding-top: 24px; border-top: 1px solid #d1d5db; text-align: center; font-size: 12px; color: #6b7280; }
    `;

    const body = `
      <div class="invoice-container">
        <div class="invoice-header">
          <h1>SYED TAYYAB INDUSTRIAL GASES LLC</h1>
          <p>Industrial Gas Supplier</p>
          <p>United Arab Emirates</p>
        </div>

        <div class="info-grid">
          <div>
            <h3 class="bill-to-title">Bill To:</h3>
            <div class="details-block">
              <p style="font-weight:bold;font-size:18px;margin-bottom:4px;">${customerName}</p>
              ${customerPhone ? `<p>Ph: ${customerPhone}</p>` : ''}
              ${customerEmail ? `<p>Email: ${customerEmail}</p>` : ''}
              ${customerAddress ? `<p style="margin-top:4px;">${customerAddress}</p>` : ''}
            </div>
          </div>
          <div style="text-align:right;">
            <p style="font-size:12px;color:#6b7280;margin:0;">Invoice Number</p>
            <p class="invoice-number">${invoiceNumber || invoiceLabel}</p>
            <div class="details-block">
              <p><span style="color:#6b7280;">Invoice Date: </span><span style="font-weight:600;color:#111827;">${formattedDate}</span></p>
              <p><span style="color:#6b7280;">Transaction Type: </span><span style="font-weight:600;color:#111827;">${transactionType || 'N/A'}</span></p>
              ${safePayment ? `<p><span style="color:#6b7280;">Payment Method: </span><span style="font-weight:600;color:#111827;">${safePayment}</span></p>` : ''}
            </div>
          </div>
        </div>

        <table class="items-table">
          <thead>
            <tr>
              <th style="width:40px;">#</th>
              <th>Item</th>
              <th style="text-align:center;">Qty</th>
              <th style="text-align:right;">Rate</th>
              <th style="text-align:right;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml || ''}
          </tbody>
        </table>

        <div class="summary">
          <div class="summary-box">
            <div class="summary-row">
              <span>Total Qty:</span>
              <span style="font-weight:600;color:#111827;">${totalQuantity ?? 0}</span>
            </div>
            <div class="summary-total">
              <span>Total Amount:</span>
              <span>${`AED ${Number(totalAmount || 0).toFixed(2)}`}</span>
            </div>
          </div>
        </div>

        ${notes ? `
          <div class="notes-box">
            <h4>Notes:</h4>
            <p style="font-size:14px;color:#374151;white-space:pre-wrap;margin:0;">${notes}</p>
          </div>
        ` : ''}

        <div class="signatures">
          ${renderSignatureBlock('System Administrator', signatures?.authorizedName, signatures?.authorizedSignature)}
          ${renderSignatureBlock('Received By', signatures?.customerName, signatures?.customerSignature)}
        </div>

        <div class="footer">
          <p style="margin-bottom:4px;">Thank you for your business!</p>
          <p>(c) 2026 SYED TAYYAB INDUSTRIAL GASES LLC. All rights reserved.</p>
        </div>
      </div>
    `;

    return buildPrintHtml({
      title: invoiceLabel || 'Invoice',
      body,
      extraStyles: styles
    });
  }

  function buildDepositInvoiceHtml(dep) {
    const invValue = dep.invoiceNumber || dep.id;
    const invoiceLabel = formatInvoiceLabel('Deposit', invValue);
    const isSystemAdmin = user && ['manager', 'super_admin'].includes(user.role);
    const adminSignature = isSystemAdmin ? user?.signature : null;
    const adminName = isSystemAdmin ? (user?.fullName || user?.username || dep.authorizedByName || 'System Administrator') : null;
    const authorizedSignature = adminSignature || dep.authorizedBySignature || null;
    const authorizedName = adminName || dep.authorizedByName || 'N/A';
    const itemRows = (dep.items || []).map(it => {
      const qty = parseInt(it.quantity || 0, 10) || 0;
      const rate = parseFloat(it.price || 0) || 0;
      const amount = parseFloat(it.amount || 0) || rate * qty;
      return { name: it.product?.productName || it.productName || '', qty, rate, total: amount };
    });
    const totalQty = itemRows.reduce((sum, it) => sum + (Number(it.qty) || 0), 0);
    const totalAmount = itemRows.reduce((sum, it) => sum + (Number(it.total) || 0), 0);
    return buildInvoiceTemplateHtml({
      invoiceLabel,
      invoiceNumber: invoiceLabel,
      invoiceDate: dep.createdAt,
      transactionType: 'Deposit',
      paymentLabel: dep.paymentType || '',
      customer: dep.customer,
      items: itemRows,
      totalQuantity: totalQty,
      totalAmount: dep.totalAmount != null ? dep.totalAmount : totalAmount,
      notes: dep.notes || '',
      signatures: {
        authorizedSignature,
        authorizedName,
        customerSignature: dep.customerSignature,
        customerName: dep.receivedByName || 'N/A'
      }
    });
  }

  function buildReturnInvoiceHtml(ret) {
    const invValue = ret.returnNumber || ret.id;
    const invoiceLabel = formatInvoiceLabel('Return', invValue);
    const isSystemAdmin = user && ['manager', 'super_admin'].includes(user.role);
    const adminSignature = isSystemAdmin ? user?.signature : null;
    const adminName = isSystemAdmin ? (user?.fullName || user?.username || ret.authorizedByName || 'System Administrator') : null;
    const authorizedSignature = adminSignature || ret.authorizedBySignature || null;
    const authorizedName = adminName || ret.authorizedByName || 'N/A';
    const itemRows = (ret.items || []).map(it => {
      const qty = parseInt(it.quantity || 0, 10) || 0;
      const rate = parseFloat(it.depositItem?.price || 0) || 0;
      const amount = rate * qty;
      return { name: it.product?.productName || it.productName || '', qty, rate, total: amount };
    });
    const totalQty = itemRows.reduce((sum, it) => sum + (Number(it.qty) || 0), 0);
    const totalAmount = itemRows.reduce((sum, it) => sum + (Number(it.total) || 0), 0);
    return buildInvoiceTemplateHtml({
      invoiceLabel,
      invoiceNumber: invoiceLabel,
      invoiceDate: ret.createdAt,
      transactionType: 'Return',
      paymentLabel: '',
      customer: ret.customer,
      items: itemRows,
      totalQuantity: totalQty,
      totalAmount,
      notes: ret.notes || '',
      signatures: {
        authorizedSignature,
        authorizedName,
        customerSignature: ret.customerSignature,
        customerName: ret.receivedByName || 'N/A'
      }
    });
  }

  const buildDepositPdfFilename = (dep) => {
    const invoiceValue = dep?.invoiceNumber || dep?.id || 'deposit';
    return `deposit_${String(invoiceValue).replace(/[^a-z0-9_-]/gi, '_')}.pdf`;
  };

  const buildReturnPdfFilename = (ret) => {
    const invoiceValue = ret?.returnNumber || ret?.id || 'return';
    return `deposit_return_${String(invoiceValue).replace(/[^a-z0-9_-]/gi, '_')}.pdf`;
  };

  async function downloadInvoicePdfFromHtml({ html, filename, title, customerName }) {
    await runPdfDownload(async () => {
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.left = '-9999px';
      iframe.style.top = '0';
      iframe.style.width = '210mm';
      iframe.style.height = '1px';
      iframe.style.opacity = '0';
      iframe.style.pointerEvents = 'none';
      iframe.style.border = '0';
      document.body.appendChild(iframe);

      try {
        const doc = iframe.contentDocument;
        if (!doc) {
          throw new Error('Unable to prepare PDF content');
        }

        doc.open();
        doc.write(html);
        doc.close();

        await new Promise((resolve) => setTimeout(resolve, 300));
        doc.body.style.margin = '0';
        doc.body.style.background = '#ffffff';
        const bodyHeight = doc.body.scrollHeight || 1;
        iframe.style.height = `${bodyHeight}px`;
        await new Promise((resolve) => setTimeout(resolve, 100));

        const blob = await captureElementToPdfBlob({
          element: doc.body,
          orientation: 'p',
          widthOverride: '210mm',
          skipStyleAdjust: true
        });
        const file = typeof File !== 'undefined'
          ? new File([blob], filename, { type: 'application/pdf' })
          : null;

        saveBlobAsFile(blob, filename);
        setSharePrompt({
          filename,
          file,
          title,
          text: `${title} for ${customerName || 'Customer'}`,
          whatsappMessage: `${title} for ${customerName || 'Customer'} is ready. The PDF has already been downloaded as ${filename}. Please attach it from your device.`,
          emailSubject: title,
          emailBody: `${title} for ${customerName || 'Customer'} is ready.\n\nThe PDF has already been downloaded as ${filename}. Please attach that file to this email before sending.`
        });
      } finally {
        document.body.removeChild(iframe);
      }
    });
  }

  function printDeposit(dep) {
    if (!dep) return;
    const w = window.open('', '_blank');
    if (!w) return alert('Please allow popups to print the invoice');
    const html = buildDepositInvoiceHtml(dep);
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); }, 500);
  }

  function printReturn(ret) {
    if (!ret) return;
    const w = window.open('', '_blank');
    if (!w) return alert('Please allow popups to print the invoice');
    const html = buildReturnInvoiceHtml(ret);
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); }, 500);
  }

  async function fetchLastDeposit() {
    try {
      const res = await api.get('/deposits/last');
      setLastDeposit(res.data.data || null);
      setShowLastModal(true);
    } catch (err) {
      console.error(err);
      alert('Failed to load last deposit');
    }
  }

  function toggleDepositItems(depositId) {
    if (!depositId) return;
    setExpandedDepositItems(prev => ({ ...prev, [depositId]: !prev[depositId] }));
  }

  const returnedByDepositItem = useMemo(() => {
    const map = new Map();
    (returnTransactions || []).forEach((ret) => {
      (ret.items || []).forEach((item) => {
        const depositItemId = item?.depositItemId || item?.depositItem?.id;
        if (!depositItemId) return;
        const key = String(depositItemId);
        const qty = parseInt(item.quantity || 0, 10) || 0;
        map.set(key, (map.get(key) || 0) + qty);
      });
    });
    return map;
  }, [returnTransactions]);

  // Derived grouped rows for export/filtering
  const allRows = useMemo(() => {
    const depositRows = (transactions || []).map(dep => {
      const items = (dep.items || []).map(it => {
        const row = buildItemRow(dep, it);
        const qty = parseInt(it.quantity || 0, 10) || 0;
        const returnedQty = returnedByDepositItem.get(String(it.id)) || 0;
        const remainingQty = Math.max(0, qty - returnedQty);
        return {
          id: it.id,
          returned: remainingQty === 0 && qty > 0,
          productName: row.product,
          quantity: qty,
          returnedQuantity: returnedQty,
          remainingQuantity: remainingQty,
          price: row.price,
          amount: row.amount,
          row
        };
      });
      const itemNames = items.map(it => it.productName).filter(Boolean);
      const totalQuantity = items.reduce((s, it) => s + (Number(it.quantity) || 0), 0);
      const remainingTotalQuantity = items.reduce((s, it) => s + (Number(it.remainingQuantity) || 0), 0);
      const totalAmount = items.reduce((s, it) => s + (Number(it.amount) || 0), 0);
      const hasAnyReturn = items.some((it) => (Number(it.returnedQuantity) || 0) > 0);
      return {
        key: dep.id,
        depositId: dep.id,
        invoice: dep.invoiceNumber || dep.id,
        invoiceNumber: dep.invoiceNumber || dep.id,
        depositDate: dep.createdAt,
        employeeName: dep.employee?.fullName || dep.employee?.email || dep.employee?.id || '',
        employeeId: dep.employee?.id || '',
        customerId: dep.customerId,
        customer: dep.customer?.name || dep.customer?.companyName || dep.customer?.fullName || '',
        product: itemNames[0] || '',
        productSearch: itemNames.join(' '),
        quantity: totalQuantity,
        price: items.length === 1 ? items[0].price : null,
        amount: dep.totalAmount != null ? dep.totalAmount : totalAmount,
        depositAmount: dep.totalAmount || totalAmount || 0,
        refillAmount: 0,
        returnAmount: 0,
        paymentMethod: dep.paymentType || '',
        securityCash: dep.securityCash || '',
        bankName: dep.bankName || '',
        checkNumber: dep.checkNumber || '',
        notes: dep.notes || '',
        status: remainingTotalQuantity > 0 ? 'pending' : 'returned',
        items,
        hasReturns: hasAnyReturn,
        hasDeposits: true,
        isReturnInvoice: false
      };
    });

    const returnRows = (returnTransactions || []).map(ret => {
      const items = (ret.items || []).map(it => {
        const price = parseFloat(it.depositItem?.price || 0) || 0;
        const qty = parseInt(it.quantity || 0, 10) || 0;
        const amount = price * qty;
        return {
          id: it.id,
          returned: true,
          productName: it.product?.productName || '',
          quantity: qty,
          price,
          amount
        };
      });
      const itemNames = items.map(it => it.productName).filter(Boolean);
      const totalQuantity = items.reduce((s, it) => s + (Number(it.quantity) || 0), 0);
      const totalAmount = items.reduce((s, it) => s + (Number(it.amount) || 0), 0);
      return {
        key: `return_${ret.id}`,
        returnId: ret.id,
        invoice: ret.returnNumber || ret.id,
        invoiceNumber: ret.returnNumber || ret.id,
        depositDate: ret.createdAt,
        employeeName: ret.employee?.fullName || ret.employee?.email || ret.employee?.id || '',
        employeeId: ret.employee?.id || '',
        customerId: ret.customerId,
        customer: ret.customer?.name || ret.customer?.companyName || ret.customer?.fullName || '',
        product: itemNames[0] || '',
        productSearch: itemNames.join(' '),
        quantity: totalQuantity,
        price: items.length === 1 ? items[0].price : null,
        amount: totalAmount,
        depositAmount: 0,
        refillAmount: 0,
        returnAmount: totalAmount,
        paymentMethod: '',
        securityCash: '',
        bankName: '',
        checkNumber: '',
        notes: '',
        status: 'returned',
        items,
        hasReturns: true,
        hasDeposits: false,
        isReturnInvoice: true
      };
    });

    return [...depositRows, ...returnRows];
  }, [transactions, returnTransactions, returnedByDepositItem]);

  const exactCustomerSearchMatch = useMemo(() => {
    const q = (searchQuery || '').trim().toLowerCase();
    if (!q) return '';
    const names = new Set(
      allRows
        .map((row) => String(row.customer || '').trim())
        .filter(Boolean)
    );
    for (const name of names) {
      if (name.toLowerCase() === q) return name;
    }
    return '';
  }, [allRows, searchQuery]);

  const filteredRows = useMemo(() => (
    allRows.filter(r => {
      // Tab filter
      if (activeTab === 'deposits' && !r.hasDeposits) return false;
      if (activeTab === 'returns' && !r.hasReturns) return false;

      // status filter
      const normalizedStatus = r.hasDeposits
        ? (r.status === 'returned' ? 'cleared' : 'pending')
        : 'cleared';
      if (statusFilter !== 'all' && normalizedStatus !== statusFilter) return false;

      // search
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (exactCustomerSearchMatch) {
          if (String(r.customer || '').trim().toLowerCase() !== exactCustomerSearchMatch.toLowerCase()) return false;
          return true;
        }
        const invoiceSearch = `${r.invoice || ''} ${formatDpNumber(r.invoice || '')}`.toLowerCase();
        if (!(invoiceSearch.includes(q) || String(r.customer).toLowerCase().includes(q) || String(r.productSearch).toLowerCase().includes(q))) return false;
      }
      return true;
    })
  ), [allRows, activeTab, statusFilter, searchQuery, exactCustomerSearchMatch]);

  const sortedRows = useMemo(() => (
    [...filteredRows].sort((a, b) => new Date(b.depositDate || 0) - new Date(a.depositDate || 0))
  ), [filteredRows]);

  const depositById = useMemo(() => {
    const map = new Map();
    (transactions || []).forEach(dep => {
      if (dep && dep.id) map.set(dep.id, dep);
    });
    return map;
  }, [transactions]);

  const returnById = useMemo(() => {
    const map = new Map();
    (returnTransactions || []).forEach(ret => {
      if (ret && ret.id) map.set(ret.id, ret);
    });
    return map;
  }, [returnTransactions]);

  const editProductOptions = useMemo(() => {
    const map = new Map();
    (emptyProducts || []).forEach(p => {
      if (p && p.productId) map.set(p.productId, p);
    });
    if (editingRow && editingRow.productId && !map.has(editingRow.productId)) {
      map.set(editingRow.productId, { productId: editingRow.productId, productName: editingRow.product || 'Selected Product' });
    }
    return Array.from(map.values());
  }, [emptyProducts, editingRow]);

  function formatProductSummary(row) {
    const items = row.items || [];
    if (!items.length) return '';
    if (items.length === 1) return items[0].productName || row.product || '';
    const primary = items[0].productName || row.product || '';
    return `${primary} (+${items.length - 1} more)`;
  }

  function exportCSV() {
    const headers = ['Invoice','Type','Customer','Product','Size','Quantity','Amount','DepositAmount','RefillAmount','ReturnAmount','PaymentMethod','SecurityCash','BankName','CheckNumber','Notes'];
    const lines = [headers.join(',')].concat(filteredRows.map(r => {
      const typeLabel = r.hasReturns && r.hasDeposits ? 'Mixed' : (r.hasReturns ? 'Return' : 'Deposit');
      const productSummary = formatProductSummary(r);
      const invoiceLabel = formatInvoiceLabel(typeLabel === 'Return' ? 'Return' : 'Deposit', r.invoice);
      return [
        invoiceLabel,
        typeLabel,
        `"${(r.customer || '').replace(/"/g, '""')}"`,
        `"${(productSummary || '').replace(/"/g, '""')}"`,
        `"${(productSummary || '').replace(/"/g, '""')}"`,
        r.quantity,
        r.amount,
        r.depositAmount,
        r.refillAmount,
        r.returnAmount,
        r.paymentMethod,
        r.securityCash,
        r.bankName,
        r.checkNumber,
        `"${(r.notes || '').replace(/"/g, '""')}"`
      ].join(',');
    }));
    const csv = lines.join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `deposits_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handlePrintDeposit(id) {
    const dep = depositById.get(id);
    if (!dep) return;
    printDeposit(dep);
  }

  function handleDownloadDeposit(id) {
    const dep = depositById.get(id);
    if (!dep) return;
    downloadInvoicePdfFromHtml({
      html: buildDepositInvoiceHtml(dep),
      filename: buildDepositPdfFilename(dep),
      title: `Deposit Invoice ${formatInvoiceLabel('Deposit', dep.invoiceNumber || dep.id)}`,
      customerName: dep.customer?.name || dep.customer?.companyName || dep.customer?.fullName || 'Customer'
    });
  }

  function handlePrintReturn(id) {
    const ret = returnById.get(id);
    if (!ret) return;
    printReturn(ret);
  }

  function handleDownloadReturn(id) {
    const ret = returnById.get(id);
    if (!ret) return;
    downloadInvoicePdfFromHtml({
      html: buildReturnInvoiceHtml(ret),
      filename: buildReturnPdfFilename(ret),
      title: `Return Invoice ${formatInvoiceLabel('Return', ret.returnNumber || ret.id)}`,
      customerName: ret.customer?.name || ret.customer?.companyName || ret.customer?.fullName || 'Customer'
    });
  }

  function openEditTransaction(row) {
    if (!canEditInvoices) {
      toast.error('Only Super Admin can edit invoices');
      return;
    }
    if (!row) return;
    setEditingRow(row);
    setEditCustomerId(row.customerId || '');
    setEditProductId(row.productId || '');
    setEditQuantity(row.quantity || 1);
    const priceValue = row.price != null ? Number(row.price) : (row.amount && row.quantity ? Number(row.amount) / Number(row.quantity) : 0);
    setEditPrice(Number.isNaN(priceValue) ? 0 : priceValue);
    setEditError('');
    setShowEditModal(true);
    fetchCustomers();
  }

  async function openEditReturn(row) {
    if (!canEditInvoices) {
      toast.error('Only Super Admin can edit invoices');
      return;
    }
    if (!row || !row.returnId) return;
    const ret = returnById.get(row.returnId);
    if (!ret) return;
    setEditingReturn(ret);
    setModalType('return');
    setShowModal(true);
    setTransactionType('return');
    setSelectedCustomer(ret.customerId || '');
    setSelectedCustomerObj(ret.customer || null);
    setCustomerQuery(ret.customer?.name || ret.customer?.customerCode || ret.customer?.phone || '');
    setCustomerSuggestions([]);
    setProductQuery('');
    setProductSuggestions([]);
    setSelectedProductObj(null);
    setSelectedProduct('');
    setPriceWarning(null);
    setEditingIndex(null);
    setNotes(ret.notes || '');
    setShowReturnModal(false);
    setReturnEntryMode('invoice');
    setCustomerSignature(ret.customerSignature || null);
    setCustomerSignedName(ret.receivedByName || ret.customer?.name || ret.customer?.customerCode || '');
    clearManualReturnSelection();

    const baseItems = (ret.items || []).map(it => ({
      depositItemId: it.depositItemId,
      productId: it.productId,
      productName: it.product?.productName || it.productName || '',
      quantity: parseInt(it.quantity || 0, 10) || 0,
      maxQuantity: parseInt(it.quantity || 0, 10) || 0,
      price: parseFloat(it.depositItem?.price || 0) || 0
    }));
    setItems(baseItems);

    const deposits = await fetchCustomerDeposits(ret.customerId);
    const depositId = ret.items?.[0]?.depositId || ret.items?.[0]?.deposit?.id;
    if (depositId) {
      const selectedDep = deposits.find(d => d.id === depositId);
      if (selectedDep) {
        setSelectedReturnDeposit(selectedDep);
      } else {
        setSelectedReturnDeposit({ id: depositId, invoiceNumber: ret.items?.[0]?.deposit?.invoiceNumber, items: [] });
      }
    } else {
      setSelectedReturnDeposit(null);
    }

    if (deposits && deposits.length > 0) {
      const remainingMap = new Map();
      deposits.forEach(dep => {
        (dep.items || []).forEach(it => remainingMap.set(it.id, it.remainingQuantity));
      });
      setItems(prev => prev.map(it => {
        const remaining = remainingMap.get(it.depositItemId);
        if (remaining == null) return it;
        const maxQuantity = Math.max(0, (parseInt(remaining || 0, 10) || 0) + (parseInt(it.quantity || 0, 10) || 0));
        return { ...it, maxQuantity };
      }));
    }
    fetchCustomers();
  }

  function closeEditModal() {
    setShowEditModal(false);
    setEditingRow(null);
    setEditError('');
    setEditSaving(false);
  }

  async function saveEditTransaction() {
    if (!editingRow) return;
    if (!editCustomerId || !editProductId) {
      setEditError('Customer and Product are required.');
      return;
    }
    if (!editQuantity || editQuantity <= 0) {
      setEditError('Quantity must be at least 1.');
      return;
    }
    const editMinRate = getCustomerMinRate(editProductId, editCustomerRates);
    if (editMinRate && parseFloat(editPrice) < editMinRate) {
      setEditError(`Fixed rate for this customer is AED ${editMinRate.toFixed(2)}. Please enter a higher price.`);
      return;
    }
    if (editSaving) return;
    setEditSaving(true);
    setEditError('');
    try {
      await api.put(`/deposits/${editingRow.depositId}/items/${editingRow.itemId}`, {
        customerId: editCustomerId,
        productId: editProductId,
        quantity: editQuantity,
        price: editPrice
      });
      closeEditModal();
      fetchTransactions();
      fetchEmptyProducts();
    } catch (err) {
      console.error(err);
      const msg = err?.response?.data?.message || 'Failed to update transaction';
      setEditError(msg);
    } finally {
      setEditSaving(false);
    }
  }

  async function deleteTransaction(row) {
    if (!canEditInvoices) {
      toast.error('Only Super Admin can delete invoices');
      return;
    }
    if (!row || !row.depositId || !row.itemId) return;
    const confirmed = window.confirm('Are you sure you want to delete this transaction?');
    if (!confirmed) return;
    try {
      await api.delete(`/deposits/${row.depositId}/items/${row.itemId}`);
      fetchTransactions();
      fetchEmptyProducts();
    } catch (err) {
      console.error(err);
      const msg = err?.response?.data?.message || 'Failed to delete transaction';
      alert(msg);
    }
  }

  async function deleteReturnInvoice(row) {
    if (!canEditInvoices) {
      toast.error('Only Super Admin can delete invoices');
      return;
    }
    if (!row || !row.returnId) return;
    const confirmed = window.confirm('Are you sure you want to delete this return invoice?');
    if (!confirmed) return;
    try {
      await api.delete(`/deposits/returns/${row.returnId}`);
      toast.success('Return invoice deleted');
      fetchTransactions();
      fetchEmptyProducts();
    } catch (err) {
      console.error(err);
      const msg = err?.response?.data?.message || 'Failed to delete return invoice';
      toast.error(msg);
    }
  }

  // Summary calculations
  const totalDeposits = transactions.reduce((s, d) => s + (d.items || []).reduce((si, it) => si + (it.quantity || 0), 0), 0);
  const totalReturns = returnTransactions.reduce((s, d) => s + (d.items || []).reduce((si, it) => si + (it.quantity || 0), 0), 0);
  const activeCylinders = Math.max(0, totalDeposits - totalReturns);
  const pendingCylinderCount = pendingAlerts.reduce((sum, entry) => sum + Number(entry?.pendingQuantity || 0), 0);

  return (
    <div className="space-y-4 sm:space-y-6 p-3 sm:p-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
        <DepositStatCard
          title="Total Deposits"
          value={totalDeposits}
          subtitle="This Week"
          icon={ArrowDownIcon}
          cardGradient="bg-gradient-to-br from-sky-50 via-blue-50/80 to-white"
          iconGradient="bg-gradient-to-br from-sky-500 to-blue-600"
          glowClass="bg-sky-300/50"
          waveColor="#0ea5e9"
          waveId="deposit-stat-deposits"
        />
        <DepositStatCard
          title="Total Returns"
          value={totalReturns}
          subtitle="This Week"
          icon={ArrowUpIcon}
          cardGradient="bg-gradient-to-br from-orange-50 via-amber-50/80 to-white"
          iconGradient="bg-gradient-to-br from-orange-500 to-amber-500"
          glowClass="bg-orange-300/50"
          waveColor="#f97316"
          waveId="deposit-stat-returns"
        />
        <DepositStatCard
          title="Active Cylinders"
          value={activeCylinders}
          subtitle="In Stock"
          icon={CircleStackIcon}
          cardGradient="bg-gradient-to-br from-violet-50 via-purple-50/80 to-white"
          iconGradient="bg-gradient-to-br from-violet-500 to-purple-600"
          glowClass="bg-violet-300/50"
          waveColor="#8b5cf6"
          waveId="deposit-stat-active"
        />
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 via-white to-amber-50/50 p-4 shadow-sm sm:p-5 md:p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between md:gap-6">
          <div className="space-y-1">
            <p className="text-base font-semibold text-slate-800">Pending Cylinder Alerts</p>
            <p className="text-xs text-slate-500">Customers with cylinders still not returned.</p>
          </div>
          <div className="flex items-center gap-2 self-start">
            <button
              type="button"
              onClick={() => {
                if (!showPendingAlerts) {
                  fetchPendingAlerts();
                }
                setShowPendingAlerts((prev) => !prev);
              }}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-amber-300 hover:bg-amber-50 md:h-10 md:px-4"
            >
              <BellAlertIcon className="h-4 w-4 text-amber-600" />
              Pending Alerts
              <span className="inline-flex min-w-[1.45rem] items-center justify-center rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                {pendingCylinderCount}
              </span>
            </button>
            <button
              type="button"
              onClick={fetchPendingAlerts}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-100 md:h-10 md:px-4"
            >
              Refresh
            </button>
          </div>
        </div>
        {showPendingAlerts && (
          <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3 shadow-sm md:p-4">
            {pendingAlertsLoading && (
              <div className="rounded-lg border border-amber-100 bg-amber-50 px-4 py-3 text-xs text-amber-700 md:text-sm">
                Loading pending cylinders...
              </div>
            )}
            {!pendingAlertsLoading && pendingAlerts.length === 0 && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600 md:text-sm">
                No pending cylinders right now.
              </div>
            )}
            {!pendingAlertsLoading && pendingAlerts.length > 0 && (
              <div className="max-h-[240px] space-y-2 overflow-y-auto pr-1">
                {pendingAlerts.map((alert) => (
                  <div key={alert.customerId} className="w-full rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2.5 text-xs text-slate-700">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-sm font-semibold text-slate-800">{alert.customerName || 'Customer'}</p>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-md bg-amber-100 px-2 py-1 text-[11px] font-semibold text-amber-700">
                          Pending: {alert.pendingQuantity ?? 0}
                        </span>
                        <span className="rounded-md bg-sky-100 px-2 py-1 text-[11px] font-semibold text-sky-700">
                          Last Deposit: {alert.lastDepositDate ? new Date(alert.lastDepositDate).toLocaleDateString('en-GB') : 'N/A'}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Search & Action Bar */}
        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3 shadow-sm md:p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="relative flex-1">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search by invoice no., customer or cylinder size..."
                className="h-10 w-full rounded-xl border border-slate-300 bg-white pl-10 pr-3 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:flex-row sm:items-center md:w-auto md:justify-end md:gap-3">
              <div className="flex flex-col md:min-w-[170px]">
                <select
                  value={statusFilter}
                  onChange={e => setStatusFilter(e.target.value)}
                  className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                >
                  <option value="all">All</option>
                  <option value="pending">Pending</option>
                  <option value="cleared">Cleared</option>
                </select>
              </div>
              <button
                onClick={() => openNewTransaction('deposit')}
                className="h-10 w-full self-end whitespace-nowrap rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 px-4 text-sm font-semibold text-white shadow-sm transition hover:from-blue-700 hover:to-cyan-600 md:w-auto md:px-5"
              >
                + New Transaction
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Card - Cylinder Transactions */}
      <div className="glass-card w-full max-w-none overflow-hidden">
        <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-700 px-4 sm:px-6 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h3 className="text-base sm:text-lg font-semibold text-white">Cylinder Transactions</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={exportCSV}
              className="glass-button w-full sm:w-auto px-4 py-2 text-xs font-semibold text-gray-800 bg-white/90 hover:bg-white flex items-center justify-center gap-2"
            >
              <ArrowDownTrayIcon className="h-4 w-4" />
              Export Data
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="px-4 sm:px-6 border-b border-white/30">
          <div className="flex gap-4 text-sm">
            <button
              onClick={() => setActiveTab('all')}
              className={`py-3 font-semibold border-b-2 transition ${
                activeTab === 'all'
                  ? 'text-blue-600 border-blue-600'
                  : 'text-gray-500 border-transparent hover:text-gray-700'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setActiveTab('deposits')}
              className={`py-3 font-semibold border-b-2 transition ${
                activeTab === 'deposits'
                  ? 'text-blue-600 border-blue-600'
                  : 'text-gray-500 border-transparent hover:text-gray-700'
              }`}
            >
              Deposits
            </button>
            <button
              onClick={() => setActiveTab('returns')}
              className={`py-3 font-semibold border-b-2 transition ${
                activeTab === 'returns'
                  ? 'text-blue-600 border-blue-600'
                  : 'text-gray-500 border-transparent hover:text-gray-700'
              }`}
            >
              Returns
            </button>
          </div>
        </div>

          {/* Transaction Table */}
          <div className="p-3 sm:p-6">
            <div className="overflow-x-auto rounded-2xl border border-white/40 bg-white/70 shadow-sm">
              <table className="w-full min-w-[760px] text-xs">
                <thead className="bg-white/40 backdrop-blur-md border-b border-white/60 text-left text-[11px] font-semibold uppercase tracking-widest text-slate-600 shadow-sm">
                  <tr>
                    <th className="px-3 py-3">Invoice #</th>
                    <th className="px-3 py-3">Customer</th>
                    <th className="px-3 py-3">Reference Name</th>
                    <th className="px-3 py-3">Created At</th>
                    <th className="px-3 py-3">Product</th>
                    <th className="px-3 py-3">Qty</th>
                    <th className="px-3 py-3">Price</th>
                    <th className="px-3 py-3">Amount</th>
                    <th className="px-3 py-3">Type</th>
                    <th className="px-3 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-slate-700">
                  {sortedRows.length === 0 && (
                    <tr>
                      <td colSpan={10} className="px-4 py-10 text-center text-xs text-slate-500">
                        No transactions found.
                      </td>
                    </tr>
                  )}
                  {sortedRows.map((row) => {
                    const typeLabel = row.hasReturns && row.hasDeposits ? 'Mixed' : (row.hasReturns ? 'Return' : 'Deposit');
                    const invoiceLabel = formatInvoiceLabel(typeLabel === 'Return' ? 'Return' : 'Deposit', row.invoiceNumber || row.invoice || '');
                    const items = row.items || [];
                    const primaryItem = items[0];
                    const isReturnInvoice = !!row.isReturnInvoice;
                    const primaryItemRow = isReturnInvoice ? null : primaryItem?.row;
                    const expandKey = isReturnInvoice ? row.key : row.depositId;
                    const isExpanded = !!expandedDepositItems[expandKey];
                    const priceLabel = items.length === 1
                      ? `AED ${Number(primaryItem?.price || row.price || 0).toFixed(2)}`
                      : '-';
                    const typeClass = typeLabel === 'Return'
                      ? 'bg-amber-100 text-amber-700'
                      : (typeLabel === 'Mixed' ? 'bg-indigo-100 text-indigo-700' : 'bg-emerald-100 text-emerald-700');
                    return (
                      <tr key={row.key} className="bg-white/60">
                        <td className="px-3 py-3 text-xs font-semibold text-slate-800">{invoiceLabel}</td>
                        <td className="px-3 py-3 text-xs">{row.customer || '-'}</td>
                        <td className="px-3 py-3 text-xs">
                          {row.employeeName || 'N/A'}
                        </td>
                        <td className="px-3 py-3 text-xs">{row.depositDate ? new Date(row.depositDate).toLocaleString() : '-'}</td>
                        <td className="px-3 py-3">
                          <div className="flex flex-col gap-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-medium text-slate-800">{primaryItem?.productName || row.product || '-'}</span>
                              {items.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => toggleDepositItems(expandKey)}
                                  className="text-[11px] font-semibold text-blue-600 hover:text-blue-700"
                                >
                                  {isExpanded ? 'Hide Items' : 'Show Items'}
                                </button>
                              )}
                            </div>
                            {isExpanded && (
                              <div className="rounded-lg bg-slate-50/80 px-2 py-2 text-xs text-slate-600">
                                {items.map((it, idx) => (
                                  <div key={it.id || idx} className="flex items-center justify-between gap-2 py-0.5">
                                    <div className="min-w-0">
                                      <div className="truncate">{it.productName || '-'}</div>
                                      <div className="text-[11px] text-slate-500">Qty {it.quantity || 0} | AED {Number(it.amount || 0).toFixed(2)}</div>
                                    </div>
                                    {it.row && canEditInvoices && (
                                      <div className="flex shrink-0 items-center gap-1">
                                        <button
                                          type="button"
                                          onClick={() => openEditTransaction(it.row)}
                                          className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 hover:bg-slate-100"
                                        >
                                          Edit
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => deleteTransaction(it.row)}
                                          className="rounded border border-rose-200 bg-rose-50 px-1.5 py-0.5 text-[10px] font-semibold text-rose-600 hover:bg-rose-100"
                                        >
                                          Delete
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-3 text-xs">{row.quantity || 0}</td>
                        <td className="px-3 py-3 text-xs">{priceLabel}</td>
                        <td className="px-3 py-3 text-xs">AED {Number(row.amount || 0).toFixed(2)}</td>
                        <td className="px-3 py-3 text-xs">
                          <span className={`inline-flex items-center rounded-full px-2 py-1 text-[10px] font-semibold ${typeClass}`}>
                            {typeLabel}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-right text-xs">
                          <div className="hidden sm:flex items-center justify-end gap-2">
                            {canEditInvoices && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (isReturnInvoice) {
                                      openEditReturn(row);
                                      return;
                                    }
                                    if (!primaryItemRow) return;
                                    openEditTransaction(primaryItemRow);
                                  }}
                                  className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                                  title={isReturnInvoice ? 'Edit Return' : (items.length > 1 ? 'Edit first item' : 'Edit Transaction')}
                                >
                                  <PencilSquareIcon className="h-4 w-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (isReturnInvoice) {
                                      deleteReturnInvoice(row);
                                      return;
                                    }
                                    if (!primaryItemRow) return;
                                    deleteTransaction(primaryItemRow);
                                  }}
                                  className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-600 hover:bg-rose-100"
                                  title={isReturnInvoice ? 'Delete Return' : (items.length > 1 ? 'Delete first item' : 'Delete Transaction')}
                                >
                                  <TrashIcon className="h-4 w-4" />
                                </button>
                              </>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                if (isReturnInvoice) {
                                  handleDownloadReturn(row.returnId);
                                  return;
                                }
                                handleDownloadDeposit(row.depositId);
                              }}
                              className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100"
                              title="Download PDF"
                            >
                              <ArrowDownTrayIcon className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (isReturnInvoice) {
                                  handlePrintReturn(row.returnId);
                                  return;
                                }
                                handlePrintDeposit(row.depositId);
                              }}
                              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                              title="Print Invoice"
                            >
                              <PrinterIcon className="h-4 w-4" />
                            </button>
                          </div>

                          <div className="relative sm:hidden">
                            <button
                              type="button"
                              onClick={() => setOpenActionMenuId(prev => (prev === row.key ? null : row.key))}
                              className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50"
                              title="Actions"
                            >
                              <EllipsisVerticalIcon className="h-4 w-4" />
                            </button>
                            {openActionMenuId === row.key && (
                              <div className="absolute right-0 z-20 mt-2 w-40 rounded-lg border border-slate-200 bg-white shadow-lg">
                                {canEditInvoices && (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (isReturnInvoice) {
                                          openEditReturn(row);
                                          setOpenActionMenuId(null);
                                          return;
                                        }
                                        if (!primaryItemRow) return;
                                        openEditTransaction(primaryItemRow);
                                        setOpenActionMenuId(null);
                                      }}
                                      className="w-full px-4 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50"
                                    >
                                      Edit
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (isReturnInvoice) {
                                          deleteReturnInvoice(row);
                                          setOpenActionMenuId(null);
                                          return;
                                        }
                                        if (!primaryItemRow) return;
                                        deleteTransaction(primaryItemRow);
                                        setOpenActionMenuId(null);
                                      }}
                                      className="w-full px-4 py-2 text-left text-xs font-semibold text-rose-600 hover:bg-rose-50"
                                    >
                                      Delete
                                    </button>
                                  </>
                                )}
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (isReturnInvoice) {
                                      handleDownloadReturn(row.returnId);
                                      setOpenActionMenuId(null);
                                      return;
                                    }
                                    handleDownloadDeposit(row.depositId);
                                    setOpenActionMenuId(null);
                                  }}
                                  className="w-full px-4 py-2 text-left text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
                                >
                                  Download PDF
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (isReturnInvoice) {
                                      handlePrintReturn(row.returnId);
                                      setOpenActionMenuId(null);
                                      return;
                                    }
                                    handlePrintDeposit(row.depositId);
                                    setOpenActionMenuId(null);
                                  }}
                                  className="w-full px-4 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50"
                                >
                                  Print Invoice
                                </button>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
      </div>

      {/* Modal / Drawer */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto px-4 py-3 sm:py-4 sm:p-6">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowModal(false)} />
          <div
            ref={modalRef}
            className="relative z-10 my-4 w-full max-w-3xl rounded-2xl bg-slate-200 p-3 sm:p-4 shadow-2xl"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-slate-800">Create Deposit / Return</h3>
                <p className="mt-1 text-[11px] text-slate-500">Record customer cylinder deposits and returns.</p>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="rounded-full border border-slate-300 bg-white/80 p-2 text-slate-500 hover:text-slate-700"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            <form className="mt-3 space-y-3">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <label className="text-xs font-semibold text-slate-700">Customer <span className="text-red-500">*</span></label>
                  <div className="relative mt-2">
                    <input
                      required
                      value={customerQuery}
                      onChange={e => handleCustomerInput(e.target.value)}
                      placeholder="Select customer"
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-200"
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                      <MagnifyingGlassIcon className="h-5 w-5" />
                    </div>
                    {customerSuggestions.length > 0 && (
                      <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-40 overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                        {customerSuggestions.map(c => (
                          <div
                            key={c.id}
                            onClick={() => selectCustomer(c)}
                            className="cursor-pointer px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                          >
                            {c.name || c.customerCode || ''} - {c.phone || ''}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  {selectedCustomerObj && (
                    <div className="mt-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
                      <div className="font-semibold text-slate-800">{selectedCustomerObj.name || selectedCustomerObj.customerCode}</div>
                      <div className="text-xs text-slate-500">{selectedCustomerObj.email || ''}{selectedCustomerObj.phone ? ` - ${selectedCustomerObj.phone}` : ''}</div>
                      {selectedCustomerObj.serialNumber && <div className="text-xs text-slate-500">SN: {selectedCustomerObj.serialNumber}</div>}
                    </div>
                  )}
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700">Transaction Type <span className="text-red-500">*</span></label>
                  <select
                    required
                    value={transactionType}
                    onChange={e => setTransactionType(e.target.value)}
                    className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-200"
                  >
                    <option value="">Select type</option>
                    <option value="deposit">Deposit</option>
                    <option value="return">Return</option>
                  </select>
                  <p className="mt-2 text-[10px] text-slate-500">Deposit for new placements, Return for received cylinders.</p>
                </div>
              </div>

              {transactionType === 'return' && (
                <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-xs font-semibold text-amber-700">Return Source</div>
                      <div className="text-sm font-semibold text-slate-800">
                        {selectedReturnDeposit
                          ? formatInvoiceLabel('Deposit', selectedReturnDeposit.invoiceNumber || selectedReturnDeposit.id)
                          : (isManualReturnMode ? 'Manual Customer Products' : 'No source selected')}
                      </div>
                      <div className="text-[11px] text-slate-600">
                        {selectedReturnDeposit
                          ? `${selectedReturnDeposit.items?.length || 0} item(s) pending return`
                          : (isManualReturnMode
                            ? 'Add cylinder products manually when no deposit invoice is available.'
                            : 'Choose a pending deposit invoice or add manual return items.')}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={openReturnInvoicePicker}
                        className="rounded-lg border border-amber-200 bg-white px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-100"
                      >
                        {selectedReturnDeposit ? 'Change Invoice' : 'Select Invoice'}
                      </button>
                      <button
                        type="button"
                        onClick={activateManualReturnEntry}
                        className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                          isManualReturnMode
                            ? 'bg-amber-600 text-white'
                            : 'border border-amber-200 bg-white text-amber-700 hover:bg-amber-100'
                        }`}
                      >
                        Manual Items
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {transactionType !== 'return' && (
                <div className="rounded-xl border border-blue-200 bg-blue-100/70 p-2">
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-[1.1fr_0.8fr_0.6fr_0.8fr_0.6fr] md:items-end">
                    <div>
                      <label className="text-xs font-semibold text-slate-700">Product <span className="text-red-500">*</span></label>
                      <div className="relative mt-2">
                        <input
                          value={productQuery}
                          onChange={e => handleProductInput(e.target.value)}
                          placeholder="Search product..."
                          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-200"
                        />
                        {productSuggestions.length > 0 && (
                          <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-40 overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                            {productSuggestions.map(p => (
                              <div
                                key={p.productId}
                                onClick={() => selectProduct(p)}
                                className="cursor-pointer px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                              >
                                {p.productName} - {p.stockQuantity} avail
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-slate-700">Quantity <span className="text-red-500">*</span></label>
                      <input
                        type="number"
                        min="1"
                        value={quantity}
                        onChange={e => setQuantity(Number(e.target.value))}
                        className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-200"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-slate-700">Amount <span className="text-red-500">*</span></label>
                      <input
                        type="number"
                        min={getCustomerMinRate(resolveSelectedProduct()?.productId, customerRates) || 0}
                        value={price}
                        onChange={e => {
                          const nextValue = e.target.value;
                          if (nextValue === '') {
                            setPrice('');
                            setPriceWarning(null);
                            return;
                          }
                          const prod = resolveSelectedProduct();
                          const minRate = getCustomerMinRate(prod?.productId, customerRates);
                          const parsed = Number(nextValue);
                          if (minRate && Number.isFinite(parsed) && parsed < minRate) {
                            setPrice(minRate);
                            setPriceWarning({ minRate, productName: prod?.productName });
                          } else {
                            setPrice(parsed);
                            setPriceWarning(null);
                          }
                        }}
                        className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-200"
                      />
                      {getCustomerMinRate(resolveSelectedProduct()?.productId, customerRates) && (
                        <p className="mt-1 text-[11px] text-slate-500">
                          Fixed rate: AED {getCustomerMinRate(resolveSelectedProduct()?.productId, customerRates).toFixed(2)}
                        </p>
                      )}
                      {priceWarning && (
                        <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] text-amber-700">
                          This customer has a fixed rate for this item. Minimum allowed price is AED {priceWarning.minRate.toFixed(2)}.
                        </div>
                      )}
                    </div>

                    <div className="md:justify-self-end">
                      <button
                        type="button"
                        onClick={() => onAddItem()}
                        className="mt-5 w-full rounded-lg bg-emerald-500 px-4 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-600 md:mt-0"
                      >
                        {editingIndex !== null ? 'Update' : '+ Add'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {transactionType === 'return' ? (
                <>
                  {isManualReturnMode && (
                    <div className="rounded-xl border border-blue-200 bg-blue-100/70 p-2">
                      <div className="grid grid-cols-1 gap-2 md:grid-cols-[1.2fr_0.7fr_0.5fr] md:items-end">
                        <div>
                          <label className="text-xs font-semibold text-slate-700">Cylinder Product <span className="text-red-500">*</span></label>
                          <div className="relative mt-2">
                            <input
                              value={manualReturnProductQuery}
                              onChange={e => handleManualReturnProductInput(e.target.value)}
                              placeholder="Search cylinder product..."
                              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-200"
                            />
                            {manualReturnProductSuggestions.length > 0 && (
                              <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-40 overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                                {manualReturnProductSuggestions.map((product) => (
                                  <div
                                    key={product.productId}
                                    onClick={() => selectManualReturnProduct(product)}
                                    className="cursor-pointer px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                                  >
                                    {product.productName}{product.productCode ? ` - ${product.productCode}` : ''}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>

                        <div>
                          <label className="text-xs font-semibold text-slate-700">Quantity <span className="text-red-500">*</span></label>
                          <input
                            type="number"
                            min="1"
                            value={manualReturnQuantity}
                            onChange={e => setManualReturnQuantity(Number(e.target.value))}
                            className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-200"
                          />
                        </div>

                        <div className="md:justify-self-end">
                          <button
                            type="button"
                            onClick={addManualReturnItem}
                            className="mt-5 w-full rounded-lg bg-emerald-500 px-4 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-600 md:mt-0"
                          >
                            + Add
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="rounded-xl border border-slate-200 bg-white">
                    {!isManualReturnMode && !selectedReturnDeposit && (
                      <div className="px-4 py-6 text-center text-sm text-slate-500">
                        Select a deposit invoice or switch to manual return items.
                      </div>
                    )}
                    {isManualReturnMode && items.length === 0 && (
                      <div className="px-4 py-6 text-center text-sm text-slate-500">
                        No manual return items added yet.
                      </div>
                    )}
                    {selectedReturnDeposit && items.length === 0 && (
                      <div className="px-4 py-6 text-center text-sm text-slate-500">
                        No returnable items found for this invoice.
                      </div>
                    )}
                    {(selectedReturnDeposit || isManualReturnMode) && items.length > 0 && (
                      <table className="w-full text-xs">
                        <thead className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-widest text-slate-500">
                          <tr>
                            <th className="px-3 py-2">Product</th>
                            {isManualReturnMode ? (
                              <>
                                <th className="px-3 py-2">Qty</th>
                                <th className="px-3 py-2"></th>
                              </>
                            ) : (
                              <>
                                <th className="px-3 py-2">Remaining</th>
                                <th className="px-3 py-2">Return Qty</th>
                              </>
                            )}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                          {items.map((it, idx) => (
                            <tr key={it.depositItemId || it.productId || idx}>
                              <td className="px-3 py-2 font-medium text-slate-700">{it.productName}</td>
                              {isManualReturnMode ? (
                                <>
                                  <td className="px-3 py-2">
                                    <input
                                      type="number"
                                      min="0"
                                      value={it.quantity}
                                      onChange={e => updateReturnQuantity(idx, e.target.value)}
                                      className="w-24 rounded border border-slate-300 px-2 py-1 text-xs text-slate-700"
                                    />
                                  </td>
                                  <td className="px-3 py-2 text-right">
                                    <button
                                      type="button"
                                      onClick={() => setItems(prev => prev.filter((_, itemIndex) => itemIndex !== idx))}
                                      className="rounded-md border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-600 hover:bg-rose-100"
                                    >
                                      Delete
                                    </button>
                                  </td>
                                </>
                              ) : (
                                <>
                                  <td className="px-3 py-2 text-slate-600">{it.maxQuantity || 0}</td>
                                  <td className="px-3 py-2">
                                    <input
                                      type="number"
                                      min="0"
                                      max={it.maxQuantity || 0}
                                      value={it.quantity}
                                      onChange={e => updateReturnQuantity(idx, e.target.value)}
                                      className="w-24 rounded border border-slate-300 px-2 py-1 text-xs text-slate-700"
                                    />
                                  </td>
                                </>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </>
              ) : (
                <div className="rounded-xl border border-slate-200 bg-white">
                  {items.length === 0 && (
                    <div className="px-4 py-6 text-center text-sm text-slate-500">
                      No items added yet.
                    </div>
                  )}
                  {items.length > 0 && (
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-widest text-slate-500">
                        <tr>
                          <th className="px-3 py-2">Product</th>
                          <th className="px-3 py-2">Qty</th>
                          <th className="px-3 py-2">Price</th>
                          <th className="px-3 py-2">Amount</th>
                          <th className="px-3 py-2"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {items.map((it, idx) => (
                          <tr key={idx}>
                            <td className="px-3 py-2 font-medium text-slate-700">{it.productName}</td>
                            <td className="px-3 py-2 text-slate-600">{it.quantity}</td>
                            <td className="px-3 py-2 text-slate-600">{it.price}</td>
                            <td className="px-3 py-2 text-slate-700">{(it.price * it.quantity).toFixed(2)}</td>
                            <td className="px-3 py-2 text-right">
                              <button
                                onClick={() => {
                                  setEditingIndex(idx);
                                  const match = emptyProducts.find(p => p.productId === it.productId || p.inventoryItemId === it.inventoryItemId || p.productName === it.productName);
                                  setSelectedProductObj(match || { productId: it.productId, inventoryItemId: it.inventoryItemId, productName: it.productName, defaultPrice: it.price });
                                  setSelectedProduct(it.inventoryItemId || it.productId);
                                  setProductQuery(it.productName || '');
                                  setQuantity(it.quantity || 1);
                                  setPrice(it.price || 0);
                                  setProductSuggestions([]);
                                }}
                                className="mr-2 rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-600 hover:bg-blue-100"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => setItems(prev => prev.filter((_, i) => i !== idx))}
                                className="rounded-md border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-600 hover:bg-rose-100"
                              >
                                Delete
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

                <div>
                  <label className="text-xs font-semibold text-slate-700">Notes</label>
                  <textarea
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="Additional notes..."
                    className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-200"
                  />
                </div>

                <div className="flex flex-col gap-3 border-t border-slate-300 pt-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-[10px] text-slate-500">Signature will be requested before saving.</p>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setShowModal(false)}
                      className="rounded-lg border border-slate-300 bg-transparent px-4 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => submitTransaction()}
                      disabled={isSavingTransaction}
                      className="rounded-lg bg-blue-500 px-4 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      {isSavingTransaction
                        ? 'Saving...'
                        : (transactionType === 'return'
                          ? `Save Return (${returnItemCount} item${returnItemCount === 1 ? '' : 's'})`
                          : `Save Transaction (${items.length} item${items.length === 1 ? '' : 's'})`)}
                    </button>
                  </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {showReturnModal && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto px-4 py-6">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowReturnModal(false)} />
          <div className="relative z-10 w-full max-w-3xl rounded-2xl bg-white p-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-slate-800">Select Deposit Invoice</h3>
                <p className="mt-1 text-[11px] text-slate-500">Choose a deposit invoice to return cylinders.</p>
              </div>
              <button
                onClick={() => setShowReturnModal(false)}
                className="rounded-full border border-slate-200 bg-white p-2 text-slate-500 hover:text-slate-700"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            {customerDeposits.length === 0 && (
              <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                <p>No pending deposit invoices found for this customer.</p>
                <button
                  type="button"
                  onClick={activateManualReturnEntry}
                  className="mt-3 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700"
                >
                  Use Manual Items
                </button>
              </div>
            )}

            {customerDeposits.length > 0 && (
              <div className="mt-4 space-y-3">
                {customerDeposits.map(dep => {
                  const isSelected = selectedReturnDeposit && selectedReturnDeposit.id === dep.id;
                  const isExpanded = !!expandedReturnInvoices[dep.id];
                  const invoiceLabel = formatInvoiceLabel('Deposit', dep.invoiceNumber || dep.id);
                  return (
                    <div key={dep.id} className={`rounded-xl border ${isSelected ? 'border-emerald-300 bg-emerald-50/40' : 'border-slate-200 bg-white'} p-3`}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="text-sm font-semibold text-slate-800">{invoiceLabel}</div>
                          <div className="text-[11px] text-slate-500">
                            {dep.createdAt ? new Date(dep.createdAt).toLocaleDateString() : 'N/A'}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {dep.items?.length || 0} item(s) pending return
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setExpandedReturnInvoices(prev => ({ ...prev, [dep.id]: !prev[dep.id] }))}
                            className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
                          >
                            {isExpanded ? 'Hide Items' : 'Show Items'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleUseReturnDeposit(dep)}
                            disabled={!dep.items || dep.items.length === 0}
                            className={`rounded-md px-3 py-1 text-[11px] font-semibold ${isSelected ? 'bg-emerald-500 text-white' : 'bg-blue-600 text-white hover:bg-blue-700'} ${(!dep.items || dep.items.length === 0) ? 'cursor-not-allowed opacity-60' : ''}`}
                          >
                            {isSelected ? 'Using' : 'Use'}
                          </button>
                        </div>
                      </div>
                      {isExpanded && (
                        <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                          {(dep.items || []).map(item => (
                            <div key={item.id} className="flex items-center justify-between border-b border-slate-200/60 py-1 last:border-b-0">
                              <div className="font-medium text-slate-700">{item.productName || '-'}</div>
                              <div className="text-[11px] text-slate-500">Remaining: {item.remainingQuantity || 0}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {showEditModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto px-4 py-3 sm:py-4 sm:p-6">
          <div className="absolute inset-0 bg-black/40" onClick={closeEditModal} />
          <div className="relative z-10 my-4 w-full max-w-xl rounded-2xl bg-white p-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-slate-800">Edit Transaction</h3>
                <p className="mt-1 text-[11px] text-slate-500">Update customer, product, quantity, and price.</p>
              </div>
              <button
                onClick={closeEditModal}
                className="rounded-full border border-slate-200 bg-white p-2 text-slate-500 hover:text-slate-700"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <label className="text-xs font-semibold text-slate-700">Customer</label>
                  <div className="mt-2">
                    <SearchableSelect
                      value={editCustomerId}
                      options={customers}
                      onChange={(nextValue) => setEditCustomerId(nextValue)}
                      placeholder="Search customer"
                      getOptionValue={(customer) => customer.id}
                      getOptionLabel={(customer) =>
                        customer.name || customer.companyName || customer.fullName || customer.customerCode || customer.phone || 'Customer'
                      }
                      getOptionSubLabel={(customer) =>
                        `${customer.customerCode || ''}${customer.phone ? ` - ${customer.phone}` : ''}`.trim()
                      }
                      getOptionSearchText={(customer) =>
                        `${customer.name || ''} ${customer.companyName || ''} ${customer.fullName || ''} ${customer.customerCode || ''} ${customer.phone || ''} ${customer.email || ''}`
                      }
                      inputClassName="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-200"
                      menuClassName="absolute z-50 mt-1 w-full rounded-lg border border-slate-300 bg-white shadow-lg max-h-52 overflow-y-auto"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700">Product</label>
                  <div className="mt-2">
                    <SearchableSelect
                      value={editProductId}
                      options={editProductOptions}
                      onChange={(nextValue) => setEditProductId(nextValue)}
                      placeholder="Search product"
                      getOptionValue={(product) => product.productId}
                      getOptionLabel={(product) => product.productName || 'Product'}
                      getOptionSubLabel={(product) => `${product.productCode || ''}`.trim()}
                      getOptionSearchText={(product) =>
                        `${product.productName || ''} ${product.productCode || ''} ${product.productType || ''}`
                      }
                      inputClassName="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-200"
                      menuClassName="absolute z-50 mt-1 w-full rounded-lg border border-slate-300 bg-white shadow-lg max-h-52 overflow-y-auto"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <label className="text-xs font-semibold text-slate-700">Quantity</label>
                  <input
                    type="number"
                    min="1"
                    value={editQuantity}
                    onChange={e => setEditQuantity(Number(e.target.value))}
                    className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-200"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700">Price</label>
                  <input
                    type="number"
                    min={getCustomerMinRate(editProductId, editCustomerRates) || 0}
                    value={editPrice}
                    onChange={e => {
                      const nextValue = e.target.value;
                      if (nextValue === '') {
                        setEditPrice('');
                        setEditError('');
                        return;
                      }
                      const minRate = getCustomerMinRate(editProductId, editCustomerRates);
                      const parsed = Number(nextValue);
                      if (minRate && Number.isFinite(parsed) && parsed < minRate) {
                        setEditPrice(minRate);
                        setEditError(`Fixed rate for this customer is AED ${minRate.toFixed(2)}.`);
                      } else {
                        setEditPrice(parsed);
                        setEditError('');
                      }
                    }}
                    className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-200"
                  />
                  {getCustomerMinRate(editProductId, editCustomerRates) && (
                    <p className="mt-1 text-[11px] text-slate-500">
                      Fixed rate: AED {getCustomerMinRate(editProductId, editCustomerRates).toFixed(2)}
                    </p>
                  )}
                </div>
              </div>

              {editError && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-600">
                  {editError}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 border-t border-slate-200 pt-3">
                <button
                  type="button"
                  onClick={closeEditModal}
                  className="rounded-lg border border-slate-300 bg-transparent px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveEditTransaction}
                  disabled={editSaving}
                  className="rounded-lg bg-blue-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {editSaving ? 'Saving...' : 'Update Transaction'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showSignaturePad && (
        <CustomerSignaturePad onSave={onSignatureSave} onClose={() => setShowSignaturePad(false)} />
      )}

      {/* Last invoice modal */}
      {showLastModal && lastDeposit && (
        <div className="fixed inset-0 z-50">
          <div className="fixed inset-0 bg-black/40" onClick={() => setShowLastModal(false)} />
          <div className="fixed left-1/2 top-10 -translate-x-1/2 bg-white p-4 sm:p-6 w-11/12 md:w-3/5 max-h-[80vh] overflow-auto shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold">Last Deposit Invoice</h3>
              <div className="space-x-2">
                <button
                  onClick={() => {
                    downloadInvoicePdfFromHtml({
                      html: buildDepositInvoiceHtml(lastDeposit),
                      filename: buildDepositPdfFilename(lastDeposit),
                      title: `Deposit Invoice ${formatInvoiceLabel('Deposit', lastDeposit.invoiceNumber || lastDeposit.id)}`,
                      customerName: lastDeposit.customer?.name || lastDeposit.customer?.companyName || lastDeposit.customer?.fullName || 'Customer'
                    });
                  }}
                  className="glass-button-primary px-3 py-2 text-xs font-semibold text-white"
                >
                  Download PDF
                </button>
                <button
                  onClick={() => { printDeposit(lastDeposit); }}
                  className="glass-button-primary px-3 py-2 text-xs font-semibold text-white"
                >
                  Print
                </button>
                <button
                  onClick={() => setShowLastModal(false)}
                  className="glass-button px-3 py-2 text-xs font-semibold text-gray-700"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="mb-4">
              <div className="flex justify-between">
                <div>
                  <h4 className="font-semibold">{formatInvoiceLabel('Deposit', lastDeposit.invoiceNumber || lastDeposit.id)}</h4>
                  <div className="text-sm text-gray-600">Date: {new Date(lastDeposit.createdAt).toLocaleString()}</div>
                </div>
                <div className="text-sm">
                  <div className="font-semibold">{lastDeposit.customer?.companyName || lastDeposit.customer?.fullName}</div>
                  <div>{lastDeposit.customer?.phone || ''}</div>
                </div>
              </div>
            </div>

            <table className="w-full text-sm mb-4">
              <thead><tr className="text-left text-gray-500"><th>Product</th><th>Qty</th><th>Price</th><th>Amount</th></tr></thead>
              <tbody>
                {(lastDeposit.items || []).map(it => (
                  <tr key={it.id} className="border-t"><td className="py-2">{it.product?.productName || it.productName}</td><td>{it.quantity}</td><td>{it.price}</td><td>{it.amount}</td></tr>
                ))}
              </tbody>
            </table>

            <div className="flex justify-end items-center space-x-6">
              <div className="text-sm">Total: <strong>{lastDeposit.totalAmount}</strong></div>
            </div>

            <div className="mt-4 sm:mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <div className="text-sm text-gray-600">Customer Signature</div>
                {lastDeposit.customerSignature ? <img src={lastDeposit.customerSignature} alt="customer-signature" className="max-w-xs border" /> : <div className="text-sm text-gray-500">N/A</div>}
              </div>
              <div>
                <div className="text-sm text-gray-600">Employee Signature</div>
                {lastDeposit.employeeSignature ? <img src={lastDeposit.employeeSignature} alt="employee-signature" className="max-w-xs border" /> : <div className="text-sm text-gray-500">N/A</div>}
              </div>
            </div>
          </div>
        </div>
      )}

      <PdfShareDialog shareData={sharePrompt} onClose={() => setSharePrompt(null)} />
    </div>
  );
}
