import React, { useState, useEffect, useCallback, useMemo } from 'react';
import api from '../utils/api';
import toast from 'react-hot-toast';
import { PlusIcon, PencilIcon, TrashIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { useAuth } from '../context/AuthContext';
import ConfirmDialog from '../components/ConfirmDialog';

const Suppliers = () => {
  const { isSuperAdmin } = useAuth();
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [formData, setFormData] = useState({
    supplierName: '',
    trNumber: '',
    phone: '',
    email: '',
    address: ''
  });
  const [editingId, setEditingId] = useState(null);
  const [formErrors, setFormErrors] = useState({});
  const [confirmDialog, setConfirmDialog] = useState({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: null,
    type: 'warning'
  });

  const fetchSuppliers = useCallback(async () => {
    try {
      const response = await api.get('/suppliers');
      setSuppliers(response.data.data);
    } catch (error) {
      toast.error('Failed to fetch suppliers');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSuppliers();
  }, [fetchSuppliers]);

  // Email validation
  const validateEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  // Phone validation
  const validatePhone = (phone) => {
    const phoneRegex = /^[\d\s+()-]{7,20}$/;
    return phoneRegex.test(phone);
  };

  // Form validation
  const validateForm = () => {
    const errors = {};

    if (!formData.supplierName.trim()) {
      errors.supplierName = 'Supplier name is required';
    }

    if (!formData.trNumber.trim()) {
      errors.trNumber = 'TR Number is required';
    }

    if (!formData.phone.trim()) {
      errors.phone = 'Phone number is required';
    } else if (!validatePhone(formData.phone)) {
      errors.phone = 'Please enter a valid phone number';
    }

    if (!formData.email.trim()) {
      errors.email = 'Email is required';
    } else if (!validateEmail(formData.email)) {
      errors.email = 'Please enter a valid email address';
    }

    if (!formData.address.trim()) {
      errors.address = 'Address is required';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) {
      toast.error('Please fix the form errors');
      return;
    }
    
    try {
      if (editingId) {
        await api.put(`/suppliers/${editingId}`, formData);
        toast.success('Supplier updated successfully');
      } else {
        await api.post('/suppliers', formData);
        toast.success('Supplier created successfully');
      }
      
      fetchSuppliers();
      resetForm();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Operation failed');
    }
  };

  const handleEdit = (supplier) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Edit Supplier',
      message: 'Are you sure you want to edit this supplier? Make sure to save your changes.',
      type: 'info',
      onConfirm: () => {
        setFormData({
          supplierName: supplier.supplierName,
          trNumber: supplier.trNumber,
          phone: supplier.phone,
          email: supplier.email,
          address: supplier.address
        });
        setEditingId(supplier.id);
        setFormErrors({});
        setShowModal(true);
        setConfirmDialog({ ...confirmDialog, isOpen: false });
      }
    });
  };

  const handleDelete = (id) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Delete Supplier',
      message: 'Are you sure you want to permanently delete this supplier? This action cannot be undone.',
      type: 'danger',
      onConfirm: async () => {
        try {
          await api.delete(`/suppliers/${id}`);
          toast.success('Supplier deleted successfully');
          fetchSuppliers();
        } catch (error) {
          toast.error('Failed to delete supplier');
        }
        setConfirmDialog({ ...confirmDialog, isOpen: false });
      }
    });
  };

  const resetForm = () => {
    setFormData({
      supplierName: '',
      trNumber: '',
      phone: '',
      email: '',
      address: ''
    });
    setEditingId(null);
    setFormErrors({});
    setShowModal(false);
  };

  const filteredSuppliers = useMemo(() => {
    const searchLower = searchTerm.toLowerCase();
    return suppliers.filter((supplier) => (
      supplier.supplierName.toLowerCase().includes(searchLower) ||
      supplier.trNumber.toLowerCase().includes(searchLower) ||
      supplier.email.toLowerCase().includes(searchLower) ||
      supplier.phone.includes(searchTerm)
    ));
  }, [searchTerm, suppliers]);

  if (loading) {
    return <div className="flex justify-center items-center h-64">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
    </div>;
  }

  return (
    <div className="form-viewport-page space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="relative overflow-hidden rounded-[14px] border border-transparent bg-gradient-to-br from-blue-50 via-slate-50 to-white p-4 shadow-lg sm:p-6">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(129,140,248,0.25),_transparent_60%)] pointer-events-none"></div>
        <div className="relative space-y-3 sm:space-y-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900 sm:text-3xl">Supplier Management</h1>
            <p className="mt-1 text-xs text-gray-600 sm:text-sm">Manage your supplier information and records</p>
          </div>
          <div className="flex flex-col gap-2 rounded-xl bg-white/90 px-3 py-2.5 shadow-lg sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:rounded-2xl sm:px-4 sm:py-3">
            <div className="relative flex-1 sm:max-w-4xl">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 sm:h-5 sm:w-5" />
              <input
                type="text"
                placeholder="Search by name, TR number, email or phone..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="h-9 w-full rounded-xl border border-gray-200 px-10 text-xs focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200 sm:h-10 sm:px-11 sm:text-sm"
              />
            </div>
            <button
              onClick={() => setShowModal(true)}
              className="flex h-9 flex-shrink-0 items-center justify-center gap-1.5 rounded-xl bg-primary-600 px-3 text-xs font-semibold text-white shadow transition hover:bg-primary-700 sm:h-10 sm:gap-2 sm:px-4 sm:text-sm"
            >
              <PlusIcon className="h-4 w-4 sm:h-5 sm:w-5" />
              Add Supplier
            </button>
          </div>
        </div>
      </div>

      {/* Suppliers Table */}
      <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white/95 shadow-xl shadow-slate-200/70 sm:rounded-2xl">
        <div className="block border-b border-slate-200 bg-gradient-to-r from-blue-50 to-slate-100 px-3 py-1.5 text-center text-[11px] font-medium text-slate-600 sm:hidden sm:px-4 sm:py-2 sm:text-xs">
          Swipe to view all columns
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[760px] w-full sm:min-w-[980px]">
            <thead className="bg-gradient-to-r from-slate-100 to-blue-50">
              <tr>
                <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-600 sm:px-5 sm:py-4 sm:text-[11px]">Supplier Name</th>
                <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-600 sm:px-5 sm:py-4 sm:text-[11px]">TR Number</th>
                <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-600 sm:px-5 sm:py-4 sm:text-[11px]">Contact</th>
                <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-600 sm:px-5 sm:py-4 sm:text-[11px]">Address</th>
                <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-600 sm:px-5 sm:py-4 sm:text-[11px]">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/80 bg-white">
              {filteredSuppliers.map((supplier) => (
                <tr key={supplier.id} className="transition-colors duration-200 hover:bg-blue-50/35">
                  <td className="whitespace-nowrap px-3 py-2.5 sm:px-5 sm:py-4">
                    <div className="text-[13px] font-semibold leading-tight text-slate-800 sm:text-sm">{supplier.supplierName}</div>
                    {supplier.contactPerson && (
                      <div className="mt-0.5 text-[11px] leading-tight text-slate-500 sm:text-xs">Contact: {supplier.contactPerson}</div>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 sm:px-5 sm:py-4">
                    <span className="inline-flex rounded-full bg-blue-100 px-2.5 py-0.5 text-[11px] font-semibold text-blue-800 ring-1 ring-blue-200 sm:px-3 sm:py-1 sm:text-xs">
                      {supplier.trNumber}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 sm:px-5 sm:py-4">
                    <div className="text-[13px] leading-tight text-slate-800 sm:text-sm">{supplier.phone}</div>
                    <div className="mt-0.5 text-[11px] leading-tight text-slate-500 sm:text-xs">{supplier.email}</div>
                  </td>
                  <td className="px-3 py-2.5 sm:px-5 sm:py-4">
                    <div className="max-w-[180px] truncate text-[13px] text-slate-800 sm:max-w-xs sm:text-sm" title={supplier.address}>
                      {supplier.address}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right sm:px-5 sm:py-4">
                    <div className="inline-flex items-center gap-1.5 sm:gap-2">
                      <button
                        onClick={() => handleEdit(supplier)}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-blue-200 bg-blue-50 text-primary-600 transition hover:bg-blue-100 sm:h-8 sm:w-8"
                      >
                        <PencilIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      </button>
                      {isSuperAdmin && (
                        <button
                          onClick={() => handleDelete(supplier.id)}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-red-200 bg-red-50 text-red-600 transition hover:bg-red-100 sm:h-8 sm:w-8"
                        >
                          <TrashIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filteredSuppliers.length === 0 && (
          <div className="py-10 text-center sm:py-14">
            <p className="text-sm font-medium text-slate-500">
              {searchTerm ? 'No suppliers found matching your search' : 'No suppliers found. Add your first supplier!'}
            </p>
          </div>
        )}
      </div>

      {/* Supplier Count */}
      <div className="text-right text-xs text-slate-500 sm:text-sm">
        Showing {filteredSuppliers.length} of {suppliers.length} suppliers
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="form-modal-overlay">
          <div className="form-modal-wrap px-3 py-6 sm:px-4 sm:py-8">
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75" onClick={resetForm}></div>
            
            <div className="form-modal-panel form-modal-body relative w-full max-w-2xl rounded-lg bg-white p-4 sm:rounded-xl sm:p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                {editingId ? 'Edit Supplier' : 'Add New Supplier'}
              </h3>
              <p className="text-sm text-gray-500 mb-6">
                {editingId ? 'Update supplier information below' : 'Fill in the supplier details. All fields marked with * are required.'}
              </p>
              
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Supplier Name */}
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Supplier Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.supplierName}
                    onChange={(e) => setFormData({ ...formData, supplierName: e.target.value })}
                    className={`mt-1 block w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 ${
                      formErrors.supplierName ? 'border-red-500' : 'border-gray-300'
                    }`}
                    placeholder="Enter supplier company name"
                  />
                  {formErrors.supplierName && (
                    <p className="mt-1 text-sm text-red-600">{formErrors.supplierName}</p>
                  )}
                </div>

                {/* TR Number */}
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    TR Number (Tax Registration Number) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.trNumber}
                    onChange={(e) => setFormData({ ...formData, trNumber: e.target.value })}
                    className={`mt-1 block w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 ${
                      formErrors.trNumber ? 'border-red-500' : 'border-gray-300'
                    }`}
                    placeholder="e.g., TRN123456789"
                  />
                  {formErrors.trNumber && (
                    <p className="mt-1 text-sm text-red-600">{formErrors.trNumber}</p>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Phone Number */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Phone Number <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="tel"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      className={`mt-1 block w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 ${
                        formErrors.phone ? 'border-red-500' : 'border-gray-300'
                      }`}
                      placeholder="+971 XX XXX XXXX"
                    />
                    {formErrors.phone && (
                      <p className="mt-1 text-sm text-red-600">{formErrors.phone}</p>
                    )}
                  </div>

                  {/* Email Address */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Email Address <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className={`mt-1 block w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 ${
                        formErrors.email ? 'border-red-500' : 'border-gray-300'
                      }`}
                      placeholder="supplier@company.com"
                    />
                    {formErrors.email && (
                      <p className="mt-1 text-sm text-red-600">{formErrors.email}</p>
                    )}
                  </div>
                </div>

                {/* Address */}
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Supplier Address <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    rows="3"
                    className={`mt-1 block w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 ${
                      formErrors.address ? 'border-red-500' : 'border-gray-300'
                    }`}
                    placeholder="Enter complete supplier address"
                  />
                  {formErrors.address && (
                    <p className="mt-1 text-sm text-red-600">{formErrors.address}</p>
                  )}
                </div>

                {/* Form Actions */}
                <div className="flex flex-col gap-3 sm:flex-row sm:justify-end mt-4 sm:mt-6 pt-4 border-t">
                  <button
                    type="button"
                    onClick={resetForm}
                    className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-primary-600 text-white rounded-md text-sm font-medium hover:bg-primary-700"
                  >
                    {editingId ? 'Update Supplier' : 'Add Supplier'}
                  </button>
                </div>
              </form>
            </div>
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

export default Suppliers;
