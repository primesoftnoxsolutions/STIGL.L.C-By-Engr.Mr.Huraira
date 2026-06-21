import React, { useState, useEffect, useMemo, useRef } from 'react';
import api from '../utils/api';
import toast from 'react-hot-toast';
import {
  PlusIcon,
  PencilIcon,
  ArrowUpTrayIcon,
  ArrowDownTrayIcon,
  MagnifyingGlassIcon,
  FunnelIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  TrashIcon
} from '@heroicons/react/24/outline';
import { useAuth } from '../context/AuthContext';
import ConfirmDialog from '../components/ConfirmDialog';

const sortCustomersAlphabetically = (list = []) => (
  [...list].sort((a, b) => {
    const nameA = String(a?.name || '').trim();
    const nameB = String(b?.name || '').trim();
    return nameA.localeCompare(nameB, undefined, { sensitivity: 'base', numeric: true });
  })
);

const Customers = () => {
  const { isSuperAdmin } = useAuth();
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterOption, setFilterOption] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    trNumber: '',
    address: ''
  });
  const [editingId, setEditingId] = useState(null);
  const importInputRef = useRef(null);
  const [confirmDialog, setConfirmDialog] = useState({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: null,
    type: 'warning'
  });

  useEffect(() => {
    fetchCustomers();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterOption, pageSize]);

  // Fetch customers from backend
  const fetchCustomers = async () => {
    try {
      const response = await api.get('/customers');
      setCustomers(sortCustomersAlphabetically(response.data?.data || []));
    } catch (error) {
      toast.error('Failed to fetch customers');
    } finally {
      setLoading(false);
    }
  };

  // Handle Add/Edit form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingId) {
        await api.put(`/customers/${editingId}`, formData);
        toast.success('Customer updated successfully');
      } else {
        await api.post('/customers', formData);
        toast.success('Customer created successfully');
      }
      fetchCustomers();
      resetForm();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Operation failed');
    }
  };

  // Prepare form for editing
  const handleEdit = (customer) => {
    setFormData({
      name: customer.name,
      email: customer.email || '',
      phone: customer.phone,
      trNumber: customer.trNumber || '',
      address: customer.address || ''
    });
    setEditingId(customer.id);
    setShowModal(true);
  };

  const handleDelete = (customer) => {
    if (!customer?.id) return;
    setConfirmDialog({
      isOpen: true,
      title: 'Delete Customer',
      message: `Are you sure you want to permanently delete ${customer.name || 'this customer'}? This action cannot be undone.`,
      type: 'danger',
      onConfirm: async () => {
        try {
          await api.delete(`/customers/${customer.id}`);
          toast.success('Customer deleted successfully');
          fetchCustomers();
        } catch (error) {
          const errorMessage = error.response?.data?.message || 'Failed to delete customer';
          toast.error(errorMessage);
        }
        setConfirmDialog({ ...confirmDialog, isOpen: false });
      }
    });
  };

  const resetForm = () => {
    setFormData({ name: '', email: '', phone: '', trNumber: '', address: '' });
    setEditingId(null);
    setShowModal(false);
  };

  const handleImportClick = () => {
    if (importInputRef.current) importInputRef.current.click();
  };

  const handleImportFile = async (event) => {
    const file = event.target.files && event.target.files[0];
    event.target.value = '';
    if (!file) return;

    setIsImporting(true);

    const uploadData = new FormData();
    uploadData.append('file', file);
    uploadData.append('duplicateMode', 'skip');

    try {
      const response = await api.post('/customers/import', uploadData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      const summary = response.data?.data || {};

      if (summary.failedCount > 0) toast.error('Some customers could not be imported');
      else toast.success('Customers imported successfully');

      fetchCustomers();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to import customers');
    } finally {
      setIsImporting(false);
    }
  };

  const handleExport = async () => {
    if (isExporting) return;
    setIsExporting(true);
    try {
      const response = await api.get('/customers/export', {
        params: { format: 'xlsx' },
        responseType: 'blob'
      });

      const extension = 'xlsx';
      const now = new Date();
      const dateStamp = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
      const filename = `customers-${dateStamp}.${extension}`;

      const blob = new Blob([response.data], { type: response.headers['content-type'] || 'application/octet-stream' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success('Customers export downloaded');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to export customers');
    } finally {
      setIsExporting(false);
    }
  };

  const filterOptions = [
    { value: 'all', label: 'All Customers' },
    { value: 'with-email', label: 'With Email' },
    { value: 'with-phone', label: 'With Phone' },
    { value: 'with-tr', label: 'With TR Number' },
    { value: 'missing-contact', label: 'Missing Contact' }
  ];

  const hasValue = (value) => Boolean(value && String(value).trim());

  const filteredCustomers = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return customers.filter((customer) => {
      const valuesToSearch = [
        customer.name,
        customer.email,
        customer.phone,
        customer.trNumber,
        customer.address,
        customer.customerCode
      ]
        .filter(Boolean)
        .map((value) => String(value).toLowerCase());

      const matchesQuery = !query || valuesToSearch.some((value) => value.includes(query));

      const matchesFilter = (() => {
        if (filterOption === 'with-email') return hasValue(customer.email);
        if (filterOption === 'with-phone') return hasValue(customer.phone);
        if (filterOption === 'with-tr') return hasValue(customer.trNumber);
        if (filterOption === 'missing-contact') return !hasValue(customer.email) && !hasValue(customer.phone);
        return true;
      })();

      return matchesQuery && matchesFilter;
    });
  }, [customers, filterOption, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredCustomers.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const pageStartIndex = (safePage - 1) * pageSize;
  const pageEndIndex = pageStartIndex + pageSize;
  const pagedCustomers = filteredCustomers.slice(pageStartIndex, pageEndIndex);
  const pageStart = filteredCustomers.length === 0 ? 0 : pageStartIndex + 1;
  const pageEnd = Math.min(pageEndIndex, filteredCustomers.length);

  useEffect(() => {
    if (safePage !== currentPage) {
      setCurrentPage(safePage);
    }
  }, [safePage, currentPage]);

  const pageNumbers = useMemo(() => {
    const numbers = [];
    const start = Math.max(1, safePage - 2);
    const end = Math.min(totalPages, safePage + 2);
    for (let i = start; i <= end; i += 1) {
      numbers.push(i);
    }
    return numbers;
  }, [safePage, totalPages]);

  const badgeClasses = 'inline-flex items-center rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500';

  const renderValue = (value, className = 'text-slate-700') => {
    if (!hasValue(value)) {
      return <span className={badgeClasses}>N/A</span>;
    }
    return <span className={className}>{value}</span>;
  };

  if (loading) return (
    <div className="flex justify-center items-center h-64">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
    </div>
  );

  const headerCellClass = 'sticky top-0 z-10 bg-slate-100/95 backdrop-blur px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-600';
  const bodyCellClass = 'px-4 py-3 text-sm text-slate-700';
  const actionButtonClass = 'group relative inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 shadow-sm transition hover:bg-blue-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60';
  const deleteButtonClass = 'group relative inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 shadow-sm transition hover:bg-rose-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/60';

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header & Buttons */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Customer Management</h1>
          <p className="text-sm text-slate-500">Manage customer profiles, contact details, and compliance data.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isSuperAdmin && (
            <>
              <input ref={importInputRef} type="file" accept=".xlsx,.csv" onChange={handleImportFile} className="hidden" />
              <button
                onClick={handleImportClick}
                disabled={isImporting}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <ArrowUpTrayIcon className="h-4 w-4" />
                {isImporting ? 'Importing...' : 'Import'}
              </button>
              <button
                onClick={handleExport}
                disabled={isExporting}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <ArrowDownTrayIcon className="h-4 w-4" />
                {isExporting ? 'Exporting...' : 'Export'}
              </button>
            </>
          )}
          <button
            onClick={() => setShowModal(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60"
          >
            <PlusIcon className="h-4 w-4" />
            Add Customer
          </button>
        </div>
      </div>

      {/* Customer Table */}
      <div className="rounded-2xl border border-slate-200/80 bg-white shadow-[0_12px_30px_-20px_rgba(15,23,42,0.25)]">
        <div className="flex flex-col gap-3 border-b border-slate-200/70 bg-slate-50/70 px-4 py-3 sm:py-4 sm:px-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative flex-1">
              <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search by name, email, phone, TR number, or address"
                className="w-full rounded-xl border border-slate-200 bg-white px-9 py-2.5 text-sm text-slate-700 shadow-sm placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60"
              />
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative">
                <FunnelIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <select
                  value={filterOption}
                  onChange={(event) => setFilterOption(event.target.value)}
                  className="w-full appearance-none rounded-xl border border-slate-200 bg-white px-9 py-2.5 text-sm text-slate-700 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 sm:w-52"
                >
                  {filterOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setFilterOption('all');
                }}
                className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 shadow-sm transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60"
              >
                Clear
              </button>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
            <span className="font-semibold text-slate-600">{filteredCustomers.length} customers</span>
            <span>Use search and filters to quickly locate customer records.</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <div className="max-h-[60vh] overflow-y-auto">
            <table className="min-w-full border-separate border-spacing-0 text-sm">
              <thead>
                <tr>
                  <th className={headerCellClass}>Name</th>
                  <th className={headerCellClass}>Phone</th>
                  <th className={headerCellClass}>Email</th>
                  <th className={headerCellClass}>TR Number</th>
                  <th className={headerCellClass}>Address</th>
                  <th className={`${headerCellClass} text-right`}>Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/70">
                {pagedCustomers.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-sm text-slate-500">
                      No customers match the current search and filter criteria.
                    </td>
                  </tr>
                )}
                {pagedCustomers.map((customer, index) => (
                  <tr
                    key={customer.id}
                    className={`${index % 2 === 0 ? 'bg-white' : 'bg-slate-50/70'} transition-colors hover:bg-blue-50/60`}
                  >
                    <td className={bodyCellClass}>{renderValue(customer.name, 'font-semibold text-slate-900')}</td>
                    <td className={`${bodyCellClass} whitespace-nowrap`}>{renderValue(customer.phone)}</td>
                    <td className={`${bodyCellClass} break-words`}>{renderValue(customer.email)}</td>
                    <td className={`${bodyCellClass} whitespace-nowrap`}>{renderValue(customer.trNumber)}</td>
                    <td className={`${bodyCellClass} max-w-[280px] break-words`}>{renderValue(customer.address)}</td>
                    <td className={`${bodyCellClass} text-right`}>
                      <div className="inline-flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => handleEdit(customer)}
                          className={actionButtonClass}
                          aria-label={`Edit ${customer.name || 'customer'}`}
                          title="Edit customer"
                        >
                          <PencilIcon className="h-4 w-4" />
                          Edit
                          <span className="pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-[10px] font-semibold text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100">
                            Edit customer
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(customer)}
                          className={deleteButtonClass}
                          aria-label={`Delete ${customer.name || 'customer'}`}
                          title="Delete customer"
                        >
                          <TrashIcon className="h-4 w-4" />
                          Delete
                          <span className="pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-[10px] font-semibold text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100">
                            Delete customer
                          </span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-200/70 bg-white px-4 py-3 sm:py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-600">Rows per page</span>
              <select
                value={pageSize}
                onChange={(event) => setPageSize(Number(event.target.value))}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-600 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60"
              >
                {[10, 25, 50].map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </div>
            <span className="text-slate-500">
              Showing {pageStart}-{pageEnd} of {filteredCustomers.length}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-1">
            <button
              type="button"
              onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
              disabled={safePage === 1}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ChevronLeftIcon className="h-4 w-4" />
              Prev
            </button>
            {pageNumbers.map((page) => (
              <button
                key={page}
                type="button"
                onClick={() => setCurrentPage(page)}
                aria-current={page === safePage ? 'page' : undefined}
                className={`min-w-[32px] rounded-lg border px-2.5 py-1.5 text-xs font-semibold shadow-sm transition ${
                  page === safePage
                    ? 'border-blue-600 bg-blue-600 text-white'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {page}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={safePage === totalPages}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
              <ChevronRightIcon className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-500 bg-opacity-75">
          <div className="bg-white p-4 sm:p-6 rounded-2xl shadow-xl max-w-md w-full relative">
            <h3 className="text-lg font-bold text-slate-900 mb-4">{editingId ? 'Edit Customer' : 'Add Customer'}</h3>
            <form onSubmit={handleSubmit} className="space-y-3">
              <input
                required
                placeholder="Name"
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60"
              />
              <input
                placeholder="Phone"
                value={formData.phone}
                onChange={e => setFormData({ ...formData, phone: e.target.value })}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60"
              />
              <input
                placeholder="Email"
                value={formData.email}
                onChange={e => setFormData({ ...formData, email: e.target.value })}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60"
              />
              <input
                placeholder="TR Number"
                value={formData.trNumber}
                onChange={e => setFormData({ ...formData, trNumber: e.target.value })}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60"
              />
              <textarea
                placeholder="Address"
                value={formData.address}
                onChange={e => setFormData({ ...formData, address: e.target.value })}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60"
              />
              <div className="flex justify-end gap-2 mt-3">
                <button
                  type="button"
                  onClick={resetForm}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60"
                >
                  {editingId ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirm Dialog */}
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

export default Customers;
