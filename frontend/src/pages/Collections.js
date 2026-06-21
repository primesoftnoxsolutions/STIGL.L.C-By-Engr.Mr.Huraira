import React, { useCallback, useEffect, useRef, useState } from 'react';
import api from '../utils/api';
import toast from 'react-hot-toast';
import CustomerSignaturePad from '../components/CustomerSignaturePad';
import InvoiceView from '../components/InvoiceView';
import { buildPrintHtml } from '../utils/printUtils';
import { ArrowTrendingDownIcon, ArrowTrendingUpIcon } from '@heroicons/react/24/outline';

const Collections = () => {
  const [invoicesLoading, setInvoicesLoading] = useState(false);
  const searchDebounceRef = useRef(null);
  const [customers, setCustomers] = useState([]);
  const [customerQuery, setCustomerQuery] = useState('');
  const [customerSuggestions, setCustomerSuggestions] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [pendingInvoices, setPendingInvoices] = useState([]);
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState([]);
  const [payAmounts, setPayAmounts] = useState({});
  const [collectedInvoices, setCollectedInvoices] = useState([]);
  const [customerCollectedInvoices, setCustomerCollectedInvoices] = useState([]);
  const [expandedCollectedItems, setExpandedCollectedItems] = useState({});
  const [activeTab, setActiveTab] = useState('pending');
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [bankName, setBankName] = useState('');
  const [checkNumber, setCheckNumber] = useState('');
  const [cashAmount, setCashAmount] = useState('');
  const [paymentSignature, setPaymentSignature] = useState(null);
  const [selectAll, setSelectAll] = useState(false);
  const [invoiceSearch, setInvoiceSearch] = useState('');
  const [paymentStep, setPaymentStep] = useState(1);
  const [collectionCompleted, setCollectionCompleted] = useState(false);
  const [isSubmittingCollection, setIsSubmittingCollection] = useState(false);
  const [receiptSnapshot, setReceiptSnapshot] = useState(null);
  const [showInvoiceView, setShowInvoiceView] = useState(false);
  const [selectedPreviewInvoiceId, setSelectedPreviewInvoiceId] = useState(null);
  const [totalOutstanding, setTotalOutstanding] = useState(0);
  const [outstandingInvoiceCount, setOutstandingInvoiceCount] = useState(0);

  // Cleanup debounce timeout and resources on unmount
  useEffect(() => {
    return () => {
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current);
      }
    };
  }, []);

  const fetchOverallOutstandingData = useCallback(async () => {
    try {
      // Fetch all invoices to calculate overall outstanding amounts
      const res = await api.get('/sales-invoices');
      const allInvoices = Array.isArray(res.data.data) ? res.data.data : [];
      
      // Filter for unpaid invoices (balanceAmount > 0)
      const unpaidInvoices = allInvoices.filter(inv => parseFloat(inv.balanceAmount || 0) > 0);
      
      // Calculate totals
      const totalOutstandingAmount = unpaidInvoices.reduce((sum, inv) => sum + parseFloat(inv.balanceAmount || 0), 0);
      
      setTotalOutstanding(totalOutstandingAmount);
      setOutstandingInvoiceCount(unpaidInvoices.length);
      
    } catch (e) {
      console.error('Failed to fetch overall outstanding data:', e);
      // Set defaults on error
      setTotalOutstanding(0);
      setOutstandingInvoiceCount(0);
    }
  }, []);

  const formatCollectedInvoices = useCallback((collected = []) => collected.map(rc => ({
    rcId: rc.id,
    rcNumber: rc.rcNumber,
    rcDate: rc.rcDate,
    paymentMethod: rc.paymentMethod,
    bankName: rc.bankName || null,
    checkNumber: rc.checkNumber || null,
    totalAmount: rc.totalAmount,
    customerId: rc.customerId,
    customerName: rc.customer?.name,
    selectedInvoices: rc.items?.map(item => ({
      invoiceId: item.salesInvoiceId,
      invoiceNumber: item.invoiceNumber,
      invoiceAmount: item.invoiceAmount,
      amountReceived: item.amountReceived
    })) || [],
    signature: rc.signature,
    employeeId: rc.employeeId
  })), []);

  const fetchCollectedInvoices = useCallback(async () => {
    try {
      // Fetch collected invoices from database for today
      const res = await api.get('/payments/collected');
      const collected = Array.isArray(res.data.data) ? res.data.data : [];
      const formattedCollected = formatCollectedInvoices(collected);
      
      setCollectedInvoices(formattedCollected);
    } catch (error) {
      console.error('Failed to fetch collected invoices:', error);
      // Don't show error toast for this, just silently fail with empty list
      setCollectedInvoices([]);
    }
  }, [formatCollectedInvoices]);

  const fetchCustomerCollectedInvoices = useCallback(async (customerId) => {
    if (!customerId) {
      setCustomerCollectedInvoices([]);
      return;
    }
    try {
      const res = await api.get('/payments/collected', { params: { customerId } });
      const collected = Array.isArray(res.data.data) ? res.data.data : [];
      const formattedCollected = formatCollectedInvoices(collected);
      setCustomerCollectedInvoices(formattedCollected);
    } catch (error) {
      console.error(`[Collections] Failed to fetch collected invoices for customer ${customerId}:`, error);
      setCustomerCollectedInvoices([]);
    }
  }, [formatCollectedInvoices]);

  const fetchCustomers = useCallback(async () => {
    try {
      const res = await api.get('/customers');
      const list = res.data.data || [];
      setCustomers(list);
    } catch (e) {
      console.error('Failed to fetch customers:', e);
      toast.error('Failed to load customers');
    }
  }, []);

  useEffect(() => {
    fetchCustomers();
    fetchOverallOutstandingData();
    fetchCollectedInvoices(); // Fetch collected invoices from database
  }, [fetchCollectedInvoices, fetchCustomers, fetchOverallOutstandingData]);

  // Handle keyboard shortcuts for modals
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Close modal on Escape key
      if (e.key === 'Escape') {
        if (showPaymentModal) {
          setShowPaymentModal(false);
          setPaymentSignature(null);
          setPaymentStep(1);
          setCollectionCompleted(false);
          setReceiptSnapshot(null);
        }
      }
    };
    
    if (showPaymentModal) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [showPaymentModal]);

  function handleCustomerInput(q) {
    setCustomerQuery(q);
    // clear debounce
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    // reset suggestions if empty
    if (!q) return setCustomerSuggestions([]);
    // debounce search to avoid excessive filtering
    searchDebounceRef.current = setTimeout(() => {
      const ql = q.toLowerCase();
      const matches = customers.filter(c => (c.name||'').toLowerCase().includes(ql) || (c.customerCode||'').toLowerCase().includes(ql) || (c.phone||'').toLowerCase().includes(ql)).slice(0,8);
      setCustomerSuggestions(matches);
    }, 300);
  }

  function selectCustomer(c) {
    if (!c || !c.id) {
      setSelectedCustomer(null);
      setCustomerQuery('');
      setCustomerSuggestions([]);
      setSelectedInvoiceIds([]);
      setPayAmounts({});
      setPendingInvoices([]);
      setCustomerCollectedInvoices([]);
      setSelectAll(false);
      return;
    }
    setSelectedCustomer(c);
    setCustomerQuery(c.name || c.customerCode || c.phone || '');
    setCustomerSuggestions([]);
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
      searchDebounceRef.current = null;
    }
    setSelectedInvoiceIds([]);
    setPayAmounts({});
    setSelectAll(false);
    // fetch invoices for this customer
    fetchPendingInvoices(c.id);
    fetchCustomerCollectedInvoices(c.id);
  }

  function toggleInvoiceSelect(invoiceId) {
    if (!invoiceId) return;
    setSelectedInvoiceIds(prev => {
      if (prev.includes(invoiceId)) {
        const next = prev.filter(x => x !== invoiceId);
        const pa = { ...payAmounts }; delete pa[invoiceId]; setPayAmounts(pa);
        return next;
      }
      // default pay amount = invoice balance
      const inv = pendingInvoices.find(i => i.id === invoiceId);
      const defaultAmt = inv ? parseFloat(inv.balanceAmount || 0) : 0;
      setPayAmounts(prevAmt => ({ ...prevAmt, [invoiceId]: defaultAmt }));
      return [...prev, invoiceId];
    });
  }

  function toggleSelectAll() {
    if (selectAll) {
      setSelectedInvoiceIds([]);
      setPayAmounts({});
      setSelectAll(false);
    } else {
      const allIds = filteredPendingInvoices.map(i => i.id);
      const newPayAmounts = {};
      filteredPendingInvoices.forEach(inv => {
        newPayAmounts[inv.id] = parseFloat(inv.balanceAmount || 0);
      });
      setSelectedInvoiceIds(allIds);
      setPayAmounts(newPayAmounts);
      setSelectAll(true);
    }
  }

  function toggleCollectedItems(rcId) {
    if (!rcId) return;
    setExpandedCollectedItems(prev => ({ ...prev, [rcId]: !prev[rcId] }));
  }

  const filteredPendingInvoices = Array.isArray(pendingInvoices) 
    ? pendingInvoices.filter(inv => 
        inv.invoiceNumber?.toLowerCase().includes(invoiceSearch.toLowerCase())
      )
    : [];

  async function submitPayments(signatureOverride = null, options = {}) {
    // Validate customer first
    if (!selectedCustomer || !selectedCustomer.id) {
      console.error('[Collections] No customer selected');
      return toast.error('Please select a customer');
    }
    
    // Validate at least one invoice selected
    if (!Array.isArray(selectedInvoiceIds) || selectedInvoiceIds.length === 0) {
      console.error('[Collections] No invoices selected');
      return toast.error('Please select at least one invoice');
    }
    
    // Validate amounts for all selected invoices
    const items = selectedInvoiceIds.filter(id => id).map(id => ({ invoiceId: id, amount: parseFloat(payAmounts[id] || 0) }));
    
    // Check each amount is valid
    for (const it of items) {
      const inv = pendingInvoices.find(i => i.id === it.invoiceId);
      if (!inv) {
        console.error('[Collections] Invoice not found:', it.invoiceId);
        return toast.error('Selected invoice not found');
      }
      
      const bal = parseFloat(inv.balanceAmount || 0);
      if (it.amount <= 0) {
        return toast.error(`Please enter amount greater than 0 for invoice ${inv.invoiceNumber}`);
      }
      if (it.amount > bal) {
        return toast.error(`Amount for invoice ${inv.invoiceNumber} exceeds outstanding balance (AED ${bal.toFixed(2)})`);
      }
    }
    
    // Validate payment method specific requirements
    if (paymentMethod === 'cash') {
      if (!cashAmount || parseFloat(cashAmount) <= 0) {
        return toast.error('Please enter valid cash amount received');
      }
    } else if (paymentMethod === 'check') {
      if (!bankName || bankName.trim() === '') {
        return toast.error('Bank name is required for check payments');
      }
      if (!checkNumber || checkNumber.trim() === '') {
        return toast.error('Check number is required for check payments');
      }
      
      // Check payments require full payment for each invoice
      for (const it of items) {
        const inv = pendingInvoices.find(i => i.id === it.invoiceId);
        const bal = parseFloat(inv?.balanceAmount || 0);
        if (Math.abs(it.amount - bal) > 0.001) {
          return toast.error(`Check payment requires full payment (AED ${bal.toFixed(2)}) for invoice ${inv?.invoiceNumber}`);
        }
      }
    }
    
    // Validate signature last
    const signatureToUse = signatureOverride || paymentSignature;

    if (!signatureToUse) {
      console.error('[Collections] No signature object found');
      return toast.error('Please capture signature before submitting');
    }
    
    if (!signatureToUse.data) {
      console.error('[Collections] Signature data missing');
      return toast.error('Signature data is missing. Please try capturing again');
    }

    try {
      setIsSubmittingCollection(true);
      const payload = { 
        customerId: selectedCustomer.id, 
        items, 
        paymentMethod, 
        bankName: bankName?.trim() || null, 
        checkNumber: checkNumber?.trim() || null,
        paymentDate: new Date().toISOString(),
        cashAmount: paymentMethod === 'cash' ? parseFloat(cashAmount) : null,
        signature: signatureToUse.data
      };
      
      const res = await api.post('/payments/bulk', payload);
      
      const receivingInvoice = res.data.receivingInvoice;
      
      if (!receivingInvoice || !receivingInvoice.rcNumber) {
        toast.success('Payment recorded successfully');
      } else {
        toast.success(`✓ Payment collected! RC: ${receivingInvoice.rcNumber}`);
      }
      
      // Refresh overall outstanding data
      fetchOverallOutstandingData();
      
      // Refresh customer invoices
      fetchPendingInvoices(selectedCustomer.id);
      
      // Refresh collected invoices from database to ensure persistence
      fetchCollectedInvoices();
      fetchCustomerCollectedInvoices(selectedCustomer.id);

      const receiptItems = selectedInvoiceIds.map((id) => {
        const inv = pendingInvoices.find((i) => i.id === id);
        const amountReceived = parseFloat(payAmounts[id] || 0);
        return {
          invoiceId: id,
          invoiceNumber: inv?.invoiceNumber || id,
          total: parseFloat(inv?.total || 0),
          amountReceived
        };
      });

      setReceiptSnapshot({
        customerName: selectedCustomer.name || selectedCustomer.customerCode,
        paymentMethod,
        cashAmount: paymentMethod === 'cash' ? parseFloat(cashAmount || 0) : null,
        capturedBy: signatureToUse?.customerName || '',
        collectedAt: new Date().toLocaleString(),
        items: receiptItems,
        totalReceived: receiptItems.reduce((sum, item) => sum + (parseFloat(item.amountReceived) || 0), 0)
      });
      setCollectionCompleted(true);

      const firstInvoiceId =
        options.previewInvoiceId ||
        selectedInvoiceIds[0] ||
        res.data?.data?.[0]?.invoiceId ||
        res.data?.data?.[0]?.invoice?.id ||
        null;

      if (options.openInvoicePreview && firstInvoiceId) {
        setSelectedPreviewInvoiceId(firstInvoiceId);
        setShowInvoiceView(true);
      }

      if (options.closePaymentModalOnSuccess) {
        setShowPaymentModal(false);
      }
    } catch (err) {
      console.error('[Collections] Error during payment submission:');
      console.error('  Error message:', err.message);
      console.error('  Response status:', err.response?.status);
      console.error('  Response data:', err.response?.data);
      
      const errorMsg = err.response?.data?.message || err.message || 'Failed to process payment';
      toast.error(errorMsg);
    } finally {
      setIsSubmittingCollection(false);
    }
  }

  const getReceiptData = () => {
    if (receiptSnapshot) return receiptSnapshot;

    const items = selectedInvoiceIds.map((id) => {
      const inv = pendingInvoices.find((i) => i.id === id);
      return {
        invoiceId: id,
        invoiceNumber: inv?.invoiceNumber || id,
        total: parseFloat(inv?.total || 0),
        amountReceived: parseFloat(payAmounts[id] || 0)
      };
    });

    return {
      customerName: selectedCustomer?.name || selectedCustomer?.customerCode || '',
      paymentMethod,
      cashAmount: paymentMethod === 'cash' ? parseFloat(cashAmount || 0) : null,
      capturedBy: paymentSignature?.customerName || '',
      collectedAt: new Date().toLocaleString(),
      items,
      totalReceived: items.reduce((sum, item) => sum + (parseFloat(item.amountReceived) || 0), 0)
    };
  };

  const handlePrintReceipt = () => {
    const receipt = getReceiptData();
    if (!receipt || !Array.isArray(receipt.items) || receipt.items.length === 0) {
      toast.error('No receipt data available to print');
      return;
    }

    const printWindow = window.open('', '_blank');
    const receiptStyles = `
      .header { text-align: center; margin-bottom: 20px; }
      .details { margin: 20px 0; }
      .details div { margin: 5px 0; }
      table { width: 100%; border-collapse: collapse; margin: 20px 0; }
      th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
      th { background-color: #f5f5f5; }
      .signature-section { margin-top: 30px; }
      .footer { margin-top: 30px; text-align: center; font-size: 12px; color: white; padding: 15px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 8px; }
    `;

    const receiptBody = `
      <div class="header">
        <h2>Payment Receipt</h2>
      </div>
      <div class="details">
        <div><strong>Customer:</strong> ${receipt.customerName || 'N/A'}</div>
        <div><strong>Date:</strong> ${receipt.collectedAt}</div>
        <div><strong>Payment Method:</strong> ${(receipt.paymentMethod || '').toUpperCase()}</div>
        ${receipt.paymentMethod === 'cash' ? `<div><strong>Cash Received:</strong> AED ${parseFloat(receipt.cashAmount || 0).toFixed(2)}</div>` : ''}
      </div>
      <table>
        <thead>
          <tr>
            <th>Invoice #</th>
            <th>Total</th>
            <th>Amount Received</th>
          </tr>
        </thead>
        <tbody>
          ${receipt.items.map((item) => `
            <tr>
              <td>${item.invoiceNumber}</td>
              <td>AED ${parseFloat(item.total || 0).toFixed(2)}</td>
              <td>AED ${parseFloat(item.amountReceived || 0).toFixed(2)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      <div class="signature-section" style="margin-top: 40px; display: flex; justify-content: space-between;">
        <div style="flex: 1; text-align: center;">
          <p style="margin-bottom: 40px; font-weight: bold;">Customer Signature</p>
          <div style="border-bottom: 2px solid #333; height: 60px;"></div>
          <p style="margin-top: 10px; font-size: 12px;">${receipt.capturedBy || '_____________________'}</p>
        </div>
        <div style="flex: 1; text-align: center; margin-left: 40px;">
          <p style="margin-bottom: 40px; font-weight: bold;">Company Representative</p>
          <div style="border-bottom: 2px solid #333; height: 60px;"></div>
          <p style="margin-top: 10px; font-size: 12px;">_____________________</p>
        </div>
      </div>
      <div class="footer">
        <p style="margin: 0;">This is a system-generated receipt. Please keep for your records.</p>
      </div>
    `;

    const html = buildPrintHtml({
      title: 'Payment Receipt',
      body: receiptBody,
      extraStyles: receiptStyles
    });
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => printWindow.print(), 250);
  };

  const handleDownloadReceipt = () => {
    const receipt = getReceiptData();
    if (!receipt || !Array.isArray(receipt.items) || receipt.items.length === 0) {
      toast.error('No receipt data available to download');
      return;
    }

    const element = document.createElement('a');
    const file = new Blob([`
      PAYMENT RECEIPT
      
Customer: ${receipt.customerName || 'N/A'}
Date: ${receipt.collectedAt}
Payment Method: ${(receipt.paymentMethod || '').toUpperCase()}
${receipt.paymentMethod === 'cash' ? `Cash Received: AED ${parseFloat(receipt.cashAmount || 0).toFixed(2)}\n` : ''}

INVOICES COLLECTED:
${receipt.items.map((item) => `${item.invoiceNumber} - Total: AED ${parseFloat(item.total || 0).toFixed(2)} - Received: AED ${parseFloat(item.amountReceived || 0).toFixed(2)}`).join('\n')}

Total Amount Received: AED ${parseFloat(receipt.totalReceived || 0).toFixed(2)}

---
Generated by Payment Collection System
${new Date().toISOString()}
    `], { type: 'text/plain' });
    element.href = URL.createObjectURL(file);
    element.download = `Payment_Receipt_${new Date().getTime()}.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const fetchPendingInvoices = async (customerId) => {
    if (!customerId) return;
    setInvoicesLoading(true);
    try {
      const res = await api.get('/sales-invoices', { params: { customerId } });
      const all = Array.isArray(res.data.data) ? res.data.data : [];
      // pending = balanceAmount > 0
      const pending = all.filter(i => parseFloat(i.balanceAmount || 0) > 0);
      setPendingInvoices(pending);
    } catch (err) {
      console.error('Failed to load invoices:', err);
      toast.error('Failed to load invoices');
    } finally {
      setInvoicesLoading(false);
    }
  };

  const totalPendingForCustomer = Array.isArray(pendingInvoices) ? pendingInvoices.reduce((s, inv) => s + parseFloat(inv.balanceAmount || 0), 0) : 0;
  const totalReceiving = Array.isArray(selectedInvoiceIds) ? selectedInvoiceIds.reduce((s, id) => s + (parseFloat(payAmounts[id] || 0) || 0), 0) : 0;
  const collectedToday = Array.isArray(collectedInvoices)
    ? collectedInvoices.filter((rc) => {
        if (!rc.rcDate) return false;
        const date = new Date(rc.rcDate);
        const now = new Date();
        return date.toDateString() === now.toDateString();
      })
    : [];
  const collectedTodayTotal = collectedToday.reduce((sum, rc) => sum + parseFloat(rc.totalAmount || 0), 0);
  const collectionCoveragePct = totalOutstanding > 0
    ? Math.min(100, (collectedTodayTotal / totalOutstanding) * 100)
    : 0;

  return (
    <div className="space-y-3 sm:space-y-4 min-h-screen overflow-auto bg-gray-50 p-3 sm:p-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Payment Collections</h1>
        <p className="mt-0.5 text-sm text-gray-600">Manage customer payments and track collections</p>
      </div>

      {/* Summary - Fluid ribbon (non-boxy) */}
      <section className="relative overflow-hidden border-b border-slate-200 pb-3 pt-2.5 sm:pb-4 sm:pt-3">
        <div className="pointer-events-none absolute inset-x-0 top-1/2 h-24 -translate-y-1/2 bg-[radial-gradient(circle_at_20%_50%,rgba(244,63,94,0.18),transparent_36%),radial-gradient(circle_at_80%_50%,rgba(16,185,129,0.18),transparent_36%)]" />

        <div className="relative grid gap-3 sm:gap-4 md:grid-cols-[1fr_auto_1fr] md:items-center">
          <div className="min-w-0 px-2 py-1.5 sm:px-3 sm:py-2">
            <div className="flex items-center gap-2 text-rose-600">
              <ArrowTrendingDownIcon className="h-5 w-5" />
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Total Outstanding</p>
            </div>
            <p className="mt-1.5 text-4xl font-black tracking-tight text-rose-600 sm:text-5xl">
              AED {totalOutstanding.toFixed(2)}
            </p>
            <div className="mt-2.5 flex items-center gap-3 text-xs font-medium text-slate-500">
              <span className="h-px w-12 bg-rose-400/80" />
              <span>{outstandingInvoiceCount} unpaid invoice{outstandingInvoiceCount === 1 ? '' : 's'}</span>
            </div>
          </div>

          <div className="hidden h-20 w-px bg-gradient-to-b from-transparent via-slate-300 to-transparent md:block" />

          <div className="min-w-0 px-2 py-1.5 sm:px-3 sm:py-2 md:text-right">
            <div className="flex items-center gap-2 text-emerald-600 md:justify-end">
              <ArrowTrendingUpIcon className="h-5 w-5" />
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Collected Today</p>
            </div>
            <p className="mt-1.5 text-4xl font-black tracking-tight text-emerald-600 sm:text-5xl">
              AED {collectedTodayTotal.toFixed(2)}
            </p>
            <div className="mt-2.5 flex items-center gap-3 text-xs font-medium text-slate-500 md:justify-end">
              <span>{collectionCoveragePct.toFixed(1)}% coverage</span>
              <span className="h-px w-12 bg-emerald-400/80" />
            </div>
            <div className="mt-2 h-1 w-full overflow-hidden bg-slate-200/80 md:ml-auto md:max-w-xs">
              <div
                className="h-full bg-gradient-to-r from-emerald-400 via-cyan-400 to-indigo-500 transition-all duration-500"
                style={{ width: `${collectionCoveragePct}%` }}
              />
            </div>
          </div>
        </div>
      </section>

      {/* Customer Search */}
      <div className="bg-white rounded-lg shadow p-4 sm:p-5">
        <label className="block text-sm font-semibold text-gray-900 mb-2">Select Customer</label>
        <div className="relative">
          <input 
            value={customerQuery} 
            onChange={e => handleCustomerInput(e.target.value)} 
            placeholder="Search by name, code, or phone..." 
            className="w-full px-4 py-1.5 sm:py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          {customerSuggestions.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-48 overflow-auto z-10">
              {customerSuggestions.map(c => (
                <div 
                  key={c.id} 
                  onClick={() => selectCustomer(c)} 
                  className="px-4 py-2.5 hover:bg-blue-50 cursor-pointer border-b last:border-b-0"
                >
                  <div className="font-medium text-gray-900">{c.name || c.customerCode}</div>
                  <div className="text-xs text-gray-500">{c.phone || c.email || ''}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Invoices & Collections */}
      {selectedCustomer && (
        <div className="bg-white rounded-lg shadow p-4 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6 pb-4 border-b">
            <div>
              <h2 className="text-xl font-bold text-gray-900">{selectedCustomer.name || selectedCustomer.customerCode}</h2>
              <p className="text-sm text-gray-600 mt-1">{selectedCustomer.phone || selectedCustomer.email}</p>
            </div>
            <button 
              onClick={() => selectCustomer(null)}
              className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Change Customer
            </button>
          </div>

          {/* Tabs */}
          <div className="flex space-x-1 mb-6 border-b">
            <button 
              onClick={() => setActiveTab('pending')}
              className={`px-4 py-3 font-medium border-b-2 transition ${
                activeTab === 'pending'
                  ? 'text-blue-600 border-blue-600'
                  : 'text-gray-600 border-transparent hover:text-gray-900'
              }`}
            >
              Pending Invoices ({pendingInvoices.length})
            </button>
            <button 
              onClick={() => setActiveTab('collected')}
              className={`px-4 py-3 font-medium border-b-2 transition ${
                activeTab === 'collected'
                  ? 'text-blue-600 border-blue-600'
                  : 'text-gray-600 border-transparent hover:text-gray-900'
              }`}
            >
              Collected ({customerCollectedInvoices.length})
            </button>
          </div>

          {/* Pending Invoices Tab */}
          {activeTab === 'pending' && (
            <div className="space-y-4">
              {invoicesLoading && (
                <div className="text-center py-8">
                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  <p className="mt-2 text-gray-600">Loading invoices...</p>
                </div>
              )}

              {!invoicesLoading && pendingInvoices.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  <p className="text-lg">No pending invoices</p>
                  <p className="text-sm mt-1">All invoices for this customer are paid</p>
                </div>
              )}

              {!invoicesLoading && pendingInvoices.length > 0 && (
                <div className="space-y-3">
                  {/* Search Invoice */}
                  <div>
                    <input 
                      type="text"
                      value={invoiceSearch}
                      onChange={e => setInvoiceSearch(e.target.value)}
                      placeholder="Search invoice number..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                    />
                  </div>

                  {/* Select All Checkbox */}
                  <div className="sticky top-0 bg-white z-10 flex items-center p-3  rounded-lg border border-gray-200">
                    <input 
                      type="checkbox"
                      checked={selectAll && filteredPendingInvoices.length > 0}
                      onChange={toggleSelectAll}
                      className="w-5 h-5 rounded border-gray-300 text-blue-600"
                    />
                    <label className="ml-3 font-medium text-gray-700 text-sm">
                      Select All Invoices ({filteredPendingInvoices.length})
                    </label>
                  </div>

                  {/* Compact Invoice List */}
                  <div className="space-y-1 max-h-96 overflow-y-auto border border-gray-200 rounded-lg">
                    {filteredPendingInvoices.map((inv, idx) => {
                      const dueDate = inv.dueDate ? new Date(inv.dueDate) : null;
                      const isDueInvalid = !dueDate || dueDate.getFullYear() === 1970;

                      return (
                        <div 
                          key={inv.id}
                          className={`flex items-center px-4 py-3 border-b last:border-b-0 hover:bg-blue-50 transition cursor-pointer ${
                            selectedInvoiceIds.includes(inv.id) ? 'bg-blue-50' : ''
                          }`}
                          onClick={() => toggleInvoiceSelect(inv.id)}
                        >
                          <input 
                            type="checkbox"
                            checked={selectedInvoiceIds.includes(inv.id)}
                            onChange={e => {
                              e.stopPropagation();
                              toggleInvoiceSelect(inv.id);
                            }}
                            className="w-4 h-4 rounded border-gray-300 text-blue-600 mr-3 flex-shrink-0"
                          />
                          <span className="text-sm font-medium text-gray-900 w-28">{inv.invoiceNumber}</span>
                          <span className="text-sm text-gray-600 w-20">{new Date(inv.invoiceDate).toLocaleDateString('en-GB')}</span>
                          <span className="text-sm text-gray-600 w-24">AED {parseFloat(inv.total).toFixed(2)}</span>
                          <span className="text-sm font-bold text-red-600 flex-1">AED {parseFloat(inv.balanceAmount || 0).toFixed(2)}</span>
                          
                          {!isDueInvalid && (
                            <span className="text-xs text-gray-500 w-20 text-right">
                              Due: {dueDate.toLocaleDateString('en-GB')}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {filteredPendingInvoices.length === 0 && (
                    <div className="text-center py-3 sm:py-4 text-gray-500">
                      <p className="text-sm">No invoices match your search</p>
                    </div>
                  )}

                  {/* Sticky Footer with Collect Button */}
                  {selectedInvoiceIds.length > 0 && (
                    <div className="sticky bottom-0 bg-white border-t-2 border-blue-600 rounded-lg p-4 shadow-lg">
                      <button 
                        onClick={() => {
                          setCollectionCompleted(false);
                          setReceiptSnapshot(null);
                          setPaymentSignature(null);
                          setPaymentStep(1);
                          setShowPaymentModal(true);
                        }}
                        className="w-full px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-semibold rounded-lg transition-all duration-300 shadow-lg hover:shadow-xl active:scale-95"
                      >
                        💳 Collect Payment
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Collected Tab */}
          {activeTab === 'collected' && (
            <div className="space-y-2">
              {customerCollectedInvoices.length === 0 && (
                <div className="text-center py-12">
                  <div className="w-16 h-16 bg-gradient-to-br from-emerald-400/30 to-teal-500/30 rounded-full flex items-center justify-center mx-auto mb-3 backdrop-blur-xl border border-emerald-400/20">
                    <svg className="w-8 h-8 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <p className="text-base font-semibold text-gray-700">No collected invoices yet</p>
                  <p className="text-xs text-gray-500 mt-1">Collected payments will appear here</p>
                </div>
              )}

              {customerCollectedInvoices.map((rc, idx) => {
                const items = rc.selectedInvoices || [];
                const cardKey = rc.rcId || rc.rcNumber || `rc-${idx}`;
                const isExpanded = !!expandedCollectedItems[cardKey];
                return (
                  <div key={cardKey} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                    <button
                      type="button"
                      onClick={() => toggleCollectedItems(cardKey)}
                      className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-3 text-left hover:from-emerald-700 hover:to-teal-700 transition-colors"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-bold text-white text-sm truncate">{rc.rcNumber}</div>
                          <div className="text-emerald-100 text-xs mt-0.5">
                            {new Date(rc.rcDate).toLocaleDateString()} | {rc.paymentMethod === 'cash' ? 'Cash' : 'Check'} | {items.length} invoice{items.length === 1 ? '' : 's'}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-emerald-100 text-xs">Collected</div>
                          <div className="text-white font-bold text-base">AED {parseFloat(rc.totalAmount || 0).toFixed(2)}</div>
                          <div className="text-emerald-100 text-xs mt-1">{isExpanded ? 'Hide Details' : 'View Details'}</div>
                        </div>
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 space-y-3">
                        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="bg-gray-100 border-b border-gray-200">
                                <th className="px-3 py-2 text-left font-semibold text-gray-700">Date</th>
                                <th className="px-3 py-2 text-left font-semibold text-gray-700">Invoice #</th>
                                <th className="px-3 py-2 text-right font-semibold text-gray-700">Invoice Amt</th>
                                <th className="px-3 py-2 text-right font-semibold text-gray-700">Amount Rcvd</th>
                                <th className="px-3 py-2 text-right font-semibold text-gray-700">Remaining</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                              {items.map((item, itemIdx) => {
                                const remaining = parseFloat(item.invoiceAmount || 0) - parseFloat(item.amountReceived || 0);
                                return (
                                  <tr key={itemIdx} className="hover:bg-gray-50">
                                    <td className="px-3 py-2 text-gray-700">{new Date(rc.rcDate).toLocaleDateString()}</td>
                                    <td className="px-3 py-2 font-semibold text-gray-900">{item.invoiceNumber}</td>
                                    <td className="px-3 py-2 text-right text-gray-700">AED {parseFloat(item.invoiceAmount || 0).toFixed(2)}</td>
                                    <td className="px-3 py-2 text-right font-bold text-emerald-600">AED {parseFloat(item.amountReceived || 0).toFixed(2)}</td>
                                    <td className={`px-3 py-2 text-right font-bold text-xs ${remaining > 0.01 ? 'text-amber-600' : 'text-emerald-600'}`}>
                                      AED {remaining.toFixed(2)}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>

                        {(rc.bankName || rc.checkNumber) && (
                          <div className="p-2 bg-blue-50 rounded-lg border border-blue-200 text-xs space-y-1">
                            <div className="text-blue-700 font-semibold">Check Details</div>
                            {rc.bankName && <div className="text-gray-700"><span className="font-semibold">Bank:</span> {rc.bankName}</div>}
                            {rc.checkNumber && <div className="text-gray-700"><span className="font-semibold">Check #:</span> {rc.checkNumber}</div>}
                          </div>
                        )}

                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              const printWindow = window.open('', '_blank');
                              let itemsHtml = '';
                              if (rc.selectedInvoices) {
                                rc.selectedInvoices.forEach(item => {
                                  const remaining = parseFloat(item.invoiceAmount || 0) - parseFloat(item.amountReceived || 0);
                                  itemsHtml += '<tr><td style="border: 1px solid #ddd; padding: 8px;">' + new Date(rc.rcDate).toLocaleDateString() + '</td>';
                                  itemsHtml += '<td style="border: 1px solid #ddd; padding: 8px;">' + item.invoiceNumber + '</td>';
                                  itemsHtml += '<td style="border: 1px solid #ddd; padding: 8px; text-align: right;">AED ' + parseFloat(item.invoiceAmount || 0).toFixed(2) + '</td>';
                                  itemsHtml += '<td style="border: 1px solid #ddd; padding: 8px; text-align: right;">AED ' + parseFloat(item.amountReceived || 0).toFixed(2) + '</td>';
                                  itemsHtml += '<td style="border: 1px solid #ddd; padding: 8px; text-align: right;">AED ' + remaining.toFixed(2) + '</td></tr>';
                                });
                              }

                              let checkDetailsHtml = '';
                              if (rc.bankName || rc.checkNumber) {
                                checkDetailsHtml = '<div style="margin: 15px 0; padding: 10px; background-color: #f0f0f0;"><strong>Payment Method:</strong> ' + (rc.paymentMethod === 'cash' ? 'Cash' : 'Check') + '<br/>';
                                if (rc.bankName) checkDetailsHtml += '<strong>Bank:</strong> ' + rc.bankName + '<br/>';
                                if (rc.checkNumber) checkDetailsHtml += '<strong>Check #:</strong> ' + rc.checkNumber + '<br/>';
                                checkDetailsHtml += '</div>';
                              }

                              const html = '<!DOCTYPE html><html><head><title>Receiving Invoice ' + rc.rcNumber + '</title><style>body { font-family: Arial, sans-serif; padding: 30px; } .header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #333; padding-bottom: 15px; } .rc-number { font-size: 24px; font-weight: bold; color: #2ecc71; } .details { margin: 20px 0; } .details-row { display: flex; justify-content: space-between; margin: 8px 0; } table { width: 100%; border-collapse: collapse; margin: 20px 0; } th { background-color: #2ecc71; color: white; padding: 12px; text-align: left; } td { border: 1px solid #ddd; padding: 10px; } .total { font-weight: bold; font-size: 18px; margin-top: 20px; text-align: right; } .footer { margin-top: 30px; text-align: center; font-size: 12px; color: white; padding: 15px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 8px; }</style></head><body><div class="header"><div class="rc-number">RECEIVING INVOICE</div><div style="font-size: 18px; margin-top: 10px;">' + rc.rcNumber + '</div></div><div class="details"><div class="details-row"><span><strong>Customer:</strong> ' + (selectedCustomer.name || selectedCustomer.customerCode) + '</span><span><strong>Date:</strong> ' + new Date(rc.rcDate).toLocaleDateString() + '</span></div><div class="details-row"><span><strong>Time:</strong> ' + new Date(rc.rcDate).toLocaleTimeString() + '</span></div></div>' + checkDetailsHtml + '<table><thead><tr><th>Date</th><th>Invoice #</th><th style="text-align: right;">Invoice Amount</th><th style="text-align: right;">Amount Received</th><th style="text-align: right;">Remaining Amount</th></tr></thead><tbody>' + itemsHtml + '</tbody></table><div class="total">Total Received: <strong>AED ' + parseFloat(rc.totalAmount || 0).toFixed(2) + '</strong></div><div class="footer"><p style="margin: 0;">This is a system-generated receiving invoice.</p><p style="margin: 5px 0 0 0;">Generated on ' + new Date().toLocaleString() + '</p></div></body></html>';

                              printWindow.document.write(html);
                              printWindow.document.close();
                              printWindow.focus();
                              setTimeout(() => printWindow.print(), 250);
                            }}
                            className="w-full px-3 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded text-xs font-semibold transition-all duration-300 active:scale-95"
                          >
                            Print RC
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Payment Modal - Two Step Flow */}
      {showPaymentModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[85vh] overflow-y-auto">
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-3 sticky top-0">
              <h3 className="text-lg font-bold text-white">
                {paymentStep === 1 ? 'Step 1: Select Payment Method' : 'Step 2: Capture Signature'}
              </h3>
            </div>

            <div className="p-4 space-y-3">
              {/* STEP 1: Payment Method Selection */}
              {paymentStep === 1 && (
                <div className="space-y-3">
                  {/* Summary Cards - Modern Design */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div className="bg-gradient-to-br from-purple-50 to-purple-100 border-2 border-purple-300 rounded-lg p-2 text-center">
                      <div className="text-xs font-bold text-purple-600 uppercase tracking-wide">Outstanding</div>
                      <div className="text-lg font-bold text-purple-700 mt-1">AED {totalPendingForCustomer.toFixed(2)}</div>
                    </div>
                    <div className="bg-gradient-to-br from-blue-50 to-blue-100 border-2 border-blue-300 rounded-lg p-2 text-center">
                      <div className="text-xs font-bold text-blue-600 uppercase tracking-wide">To Receive</div>
                      <div className="text-lg font-bold text-blue-700 mt-1">AED {totalReceiving.toFixed(2)}</div>
                    </div>
                    <div className="bg-gradient-to-br from-orange-50 to-orange-100 border-2 border-orange-300 rounded-lg p-2 text-center">
                      <div className="text-xs font-bold text-orange-600 uppercase tracking-wide">Remaining</div>
                      <div className="text-lg font-bold text-orange-700 mt-1">AED {(totalPendingForCustomer - totalReceiving).toFixed(2)}</div>
                    </div>
                  </div>

                  {/* Selected Invoices with Modern Design */}
                  <div className="bg-gradient-to-br from-slate-50 to-slate-100 rounded-lg p-3 border-2 border-slate-200">
                    <div className="text-xs font-bold text-gray-900 mb-2 flex items-center">
                      <span className="w-5 h-5 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs mr-2 font-bold">📋</span>
                      Selected Invoices
                    </div>
                    <div className="space-y-1 max-h-40 overflow-y-auto pr-2">
                      {selectedInvoiceIds.map(invoiceId => {
                        const invoice = pendingInvoices.find(i => i.id === invoiceId);
                        if (!invoice) return null;
                        
                        return (
                          <div key={invoiceId} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between bg-white p-2 rounded-lg border-2 border-blue-200 hover:border-blue-400 transition-all">
                            <div className="flex-1 min-w-0">
                              <div className="font-bold text-gray-900 text-sm">{invoice.invoiceNumber}</div>
                              <div className="text-xs text-gray-500">Outstanding: <span className="font-semibold text-gray-700">AED {parseFloat(invoice.balanceAmount || 0).toFixed(2)}</span></div>
                            </div>
                            <div className="flex items-center gap-1 ml-2">
                              <span className="text-xs font-semibold text-gray-600">AED</span>
                              <input 
                                type="number"
                                value={payAmounts[invoiceId] || ''}
                                onChange={(e) => setPayAmounts(prev => ({ ...prev, [invoiceId]: e.target.value }))}
                                placeholder="0.00"
                                className="w-20 px-2 py-1 border-2 border-blue-300 rounded text-xs font-semibold focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-200"
                                step="0.01"
                                min="0"
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Payment Method Selection - Modern Card */}
                  <div className="bg-gradient-to-br from-indigo-50 to-indigo-100 rounded-lg p-3 border-2 border-indigo-300">
                    <label className=" text-xs font-bold text-gray-900 mb-2 flex items-center">
                      <span className="w-5 h-5 bg-indigo-600 text-white rounded-full flex items-center justify-center text-xs mr-2 font-bold">💳</span>
                      Payment Method
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <button
                        onClick={() => setPaymentMethod('cash')}
                        className={`p-2 rounded-lg font-bold transition-all border-2 text-sm ${
                          paymentMethod === 'cash'
                            ? 'bg-green-500 text-white border-green-600 shadow-lg shadow-green-300'
                            : 'bg-white text-gray-700 border-gray-300 hover:border-green-400'
                        }`}
                      >
                        💵 Cash
                      </button>
                      <button
                        onClick={() => setPaymentMethod('check')}
                        className={`p-2 rounded-lg font-bold transition-all border-2 text-sm ${
                          paymentMethod === 'check'
                            ? 'bg-blue-500 text-white border-blue-600 shadow-lg shadow-blue-300'
                            : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'
                        }`}
                      >
                        📋 Check
                      </button>
                    </div>
                  </div>

                  {/* Cash Amount Field - Modern Card */}
                  {paymentMethod === 'cash' && (
                    <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-3 border-2 border-green-300 animate-fadeIn">
                      <label className=" text-xs font-bold text-gray-900 mb-2 flex items-center">
                        <span className="w-5 h-5 bg-green-600 text-white rounded-full flex items-center justify-center text-xs mr-2 font-bold">✓</span>
                        Cash Amount Received
                      </label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-green-600">AED</span>
                        <input 
                          type="number"
                          value={cashAmount}
                          onChange={(e) => setCashAmount(e.target.value)}
                          placeholder={totalReceiving.toFixed(2)}
                          className="w-full pl-12 pr-3 py-2 border-2 border-green-400 rounded-lg text-sm font-bold focus:ring-2 focus:ring-green-300 focus:border-green-500 focus:outline-none"
                        />
                      </div>
                      <div className="mt-2 text-xs text-green-700 font-semibold">
                        📊 Total to Receive: <span className="text-sm">AED {totalReceiving.toFixed(2)}</span>
                      </div>
                    </div>
                  )}

                  {/* Check Details - Modern Card */}
                  {paymentMethod === 'check' && (
                    <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-3 border-2 border-blue-300 animate-fadeIn space-y-2">
                      <div>
                        <label className="text-xs font-bold text-gray-900 mb-1 flex items-center">
                          <span className="w-4 h-4 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs mr-2">🏦</span>
                          Bank Name
                        </label>
                        <input 
                          value={bankName}
                          onChange={e => setBankName(e.target.value)}
                          className="w-full px-3 py-1 border-2 border-blue-300 rounded text-sm focus:ring-2 focus:ring-blue-300 focus:border-blue-500 focus:outline-none font-medium"
                          placeholder="e.g., Emirates NBD"
                        />
                      </div>
                      <div>
                        <label className=" text-xs font-bold text-gray-900 mb-1 flex items-center">
                          <span className="w-4 h-4 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs mr-2">#️⃣</span>
                          Check Number
                        </label>
                        <input 
                          value={checkNumber}
                          onChange={e => setCheckNumber(e.target.value)}
                          className="w-full px-3 py-1 border-2 border-blue-300 rounded text-sm focus:ring-2 focus:ring-blue-300 focus:border-blue-500 focus:outline-none font-medium"
                          placeholder="e.g., 123456"
                        />
                      </div>
                    </div>
                  )}

                  {/* Step 1 Actions */}
                  <div className="flex space-x-2 pt-2">
                    <button 
                      onClick={() => {
                        setShowPaymentModal(false);
                        setPaymentStep(1);
                        setPaymentSignature(null);
                        setCollectionCompleted(false);
                        setReceiptSnapshot(null);
                        setCashAmount('');
                      }}
                      className="flex-1 px-3 py-2 text-gray-700 border-2 border-gray-400 rounded text-sm font-bold transition-all hover:bg-gray-100"
                    >
                      ✕ Cancel
                    </button>
                    <button 
                      onClick={() => {
                        // Validate before proceeding to step 2
                        if (paymentMethod === 'cash' && !cashAmount) {
                          toast.error('Enter cash amount received');
                          return;
                        }
                        if (paymentMethod === 'check' && (!bankName || !checkNumber)) {
                          toast.error('Bank name and check number are required');
                          return;
                        }
                        setPaymentStep(2);
                      }}
                      className="flex-1 px-3 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded text-sm font-bold transition-all shadow-lg hover:shadow-xl"
                    >
                      Continue →
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 2: Signature Capture */}
              {paymentStep === 2 && (
                <div className="space-y-4 sm:space-y-6">
                  {/* Signature Pad Modal - Only show if signature is not yet captured */}
                  {!paymentSignature && (
                    <CustomerSignaturePad 
                      buttonLabel="Collect Now"
                      onSave={(signatureData, customerName) => {
                        // Store the complete signature object
                        const signaturePayload = {
                          data: signatureData,
                          customerName: customerName,
                          capturedAt: new Date().toLocaleString()
                        };
                        setPaymentSignature(signaturePayload);
                        submitPayments(signaturePayload, {
                          openInvoicePreview: true,
                          closePaymentModalOnSuccess: true,
                          previewInvoiceId: selectedInvoiceIds[0] || null
                        });
                      }}
                      onClose={() => {}}
                    />
                  )}

                  {/* Collect and receipt actions after signature */}
                  {paymentSignature && paymentSignature.data && (
                    <div className="space-y-3 bg-green-50 border border-green-200 p-4 rounded-lg animate-fadeIn">
                      <div className="text-sm text-green-700 font-medium">Signature captured successfully by {paymentSignature.customerName}</div>
                      {!collectionCompleted && (
                        <div className="text-sm text-blue-700">
                          {isSubmittingCollection ? 'Processing collection...' : 'Collection failed. Please go back and try again.'}
                        </div>
                      )}

                      {collectionCompleted && (
                        <div className="flex space-x-3">
                          <button
                            onClick={handlePrintReceipt}
                            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition"
                          >
                            Print Receipt
                          </button>
                          <button
                            onClick={handleDownloadReceipt}
                            className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium transition"
                          >
                            Download Receipt
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Step 2 Actions */}
                  <div className="flex space-x-3 pt-4 sm:pt-6 border-t">
                    <button
                      onClick={() => {
                        setPaymentStep(1);
                        setCollectionCompleted(false);
                        setReceiptSnapshot(null);
                      }}
                      className="flex-1 px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 font-medium"
                    >
                      Back to Payment Method
                    </button>
                    {collectionCompleted && (
                      <button
                        onClick={() => {
                          setSelectedInvoiceIds([]);
                          setPayAmounts({});
                          setSelectAll(false);
                          setBankName('');
                          setCheckNumber('');
                          setCashAmount('');
                          setInvoiceSearch('');
                          setShowPaymentModal(false);
                          setPaymentSignature(null);
                          setPaymentStep(1);
                          setCollectionCompleted(false);
                          setReceiptSnapshot(null);
                        }}
                        className="flex-1 px-4 py-2 rounded-lg font-medium transition bg-blue-600 text-white hover:bg-blue-700"
                      >
                        Done
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Invoice View/Print Modal */}
      {showInvoiceView && selectedPreviewInvoiceId && (
        <InvoiceView
          invoiceId={selectedPreviewInvoiceId}
          onClose={() => {
            setShowInvoiceView(false);
            setSelectedPreviewInvoiceId(null);
            setSelectedInvoiceIds([]);
            setPayAmounts({});
            setSelectAll(false);
            setBankName('');
            setCheckNumber('');
            setCashAmount('');
            setInvoiceSearch('');
            setPaymentSignature(null);
            setPaymentStep(1);
            setCollectionCompleted(false);
            setReceiptSnapshot(null);
            setIsSubmittingCollection(false);
          }}
        />
      )}
    </div>
  );
};

export default Collections;

