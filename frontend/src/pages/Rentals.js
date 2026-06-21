import React, { useState, useEffect, useMemo } from 'react';
import api from '../utils/api';
import { getUaeDateKey } from '../utils/uaeDate';
import toast from 'react-hot-toast';
import { PlusIcon } from '@heroicons/react/24/outline';
import ConfirmDialog from '../components/ConfirmDialog';
import RentalSuccessModal from '../components/RentalSuccessModal';
import CustomerSignaturePad from '../components/CustomerSignaturePad';
import { useAuth } from '../context/AuthContext';

const Rentals = () => {
  const { isSuperAdmin } = useAuth();
  const canEditRentals = isSuperAdmin;
  const [rentals, setRentals] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showSignaturePad, setShowSignaturePad] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [customerSearch, setCustomerSearch] = useState('');
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [editingItemIndex, setEditingItemIndex] = useState(null);
  
  const [formData, setFormData] = useState({
    customerId: '',
    startDate: getUaeDateKey(),
    items: [],
    signature: null
  });

  const [currentItem, setCurrentItem] = useState({
    productId: '',
    productName: '',
    quantity: 1,
    rentalDays: 30
  });

  const [successModal, setSuccessModal] = useState({
    isOpen: false,
    rental: null,
    customer: null,
    items: [],
    totalAmount: 0
  });

  const [confirmDialog, setConfirmDialog] = useState({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: null,
    type: 'warning'
  });

  // Filter products for Cylinder and Tool types
  const filteredProducts = useMemo(() => {
    if (!formData.customerId) return [];
    const allowed = products.filter(p => p.productType === 'Cylinder' || p.productType === 'Tool');
    if (!productSearch.trim()) return allowed;
    return allowed.filter(p =>
      p.productName.toLowerCase().includes(productSearch.toLowerCase()) ||
      (p.productCode && p.productCode.toLowerCase().includes(productSearch.toLowerCase()))
    );
  }, [productSearch, products, formData.customerId]);

  // Filter customers based on search input
  const filteredCustomers = useMemo(() => {
    if (!customerSearch.trim()) return customers;
    return customers.filter(c =>
      c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
      (c.email && c.email.toLowerCase().includes(customerSearch.toLowerCase())) ||
      (c.phone && c.phone.includes(customerSearch)) ||
      (c.customerCode && c.customerCode.toLowerCase().includes(customerSearch.toLowerCase()))
    );
  }, [customerSearch, customers]);

  // Calculate total rental amount for all items
  const rentalAmount = useMemo(() => {
    const pricePerDay = 10; // Fixed price
    return formData.items.reduce((total, item) => {
      return total + (item.quantity * pricePerDay * item.rentalDays);
    }, 0);
  }, [formData.items]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [rentalsRes, customersRes, productsRes] = await Promise.all([
        api.get('/rentals'),
        api.get('/customers'),
        api.get('/products')
      ]);
      setRentals(rentalsRes.data.data);
      setCustomers(customersRes.data.data);
      setProducts(productsRes.data.data);
    } catch (error) {
      console.error('Fetch error:', error);
      toast.error('Failed to fetch data');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateRental = async (e) => {
    e.preventDefault();
    
    // Validate all fields before showing signature pad
    if (!formData.customerId) {
      toast.error('Please select a customer');
      return;
    }
    if (formData.items.length === 0) {
      toast.error('Please add at least one item');
      return;
    }

    // Show signature pad
    setShowSignaturePad(true);
  };

  const handleSubmit = async (sig, customerName) => {
    try {
      const rentalData = {
        customerId: formData.customerId,
        startDate: formData.startDate,
        items: formData.items,
        rentalAmount: rentalAmount,
        signature: sig,
        securityDeposit: 0
      };

      const response = await api.post('/rentals', rentalData);
      const createdRental = response.data.data;
      const selectedCustomer = customers.find(c => c.id === formData.customerId);

      // Show success modal
      setSuccessModal({
        isOpen: true,
        rental: createdRental,
        customer: selectedCustomer,
        items: formData.items,
        totalAmount: rentalAmount
      });

      fetchData();
      resetForm();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to create rental');
    }
  };

  const completeRental = async (id) => {
    if (!canEditRentals) {
      toast.error('Only Super Admin can edit rental invoices');
      return;
    }
    setConfirmDialog({
      isOpen: true,
      title: 'Complete Rental',
      message: 'Are you sure you want to mark this rental as completed? This will update the cylinder status to available.',
      type: 'info',
      onConfirm: async () => {
        try {
          await api.put(`/rentals/${id}`, { status: 'completed', returnDate: new Date() });
          toast.success('Rental completed successfully');
          fetchData();
        } catch (error) {
          toast.error('Failed to complete rental');
        }
        setConfirmDialog({ ...confirmDialog, isOpen: false });
      }
    });
  };

  const resetForm = () => {
    setFormData({
      customerId: '',
      startDate: getUaeDateKey(),
      items: [],
      signature: null
    });
    setCurrentItem({
      productId: '',
      productName: '',
      quantity: 1,
      rentalDays: 30
    });
    setShowSignaturePad(false);
    setProductSearch('');
    setSelectedProduct(null);
    setShowProductDropdown(false);
    setCustomerSearch('');
    setSelectedCustomer(null);
    setShowCustomerDropdown(false);
    setEditingItemIndex(null);
    setShowModal(false);
  };

  const addItem = () => {
    if (!currentItem.productId || !currentItem.quantity || !currentItem.rentalDays) {
      toast.error('Please fill in all item details');
      return;
    }

    if (editingItemIndex !== null) {
      // Update existing item
      const updatedItems = [...formData.items];
      updatedItems[editingItemIndex] = currentItem;
      setFormData({ ...formData, items: updatedItems });
      setEditingItemIndex(null);
    } else {
      // Add new item
      setFormData({ ...formData, items: [...formData.items, currentItem] });
    }

    // Reset current item
    setCurrentItem({
      productId: '',
      productName: '',
      quantity: 1,
      rentalDays: 30
    });
    setSelectedProduct(null);
    setProductSearch('');
  };

  const removeItem = (index) => {
    setFormData({
      ...formData,
      items: formData.items.filter((_, i) => i !== index)
    });
  };

  const editItem = (index) => {
    setCurrentItem(formData.items[index]);
    const product = products.find(p => p.id === formData.items[index].productId);
    setSelectedProduct(product);
    setEditingItemIndex(index);
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-800';
      case 'completed': return 'bg-blue-100 text-blue-800';
      case 'overdue': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading) {
    return <div className="flex justify-center items-center h-64">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
    </div>;
  }

  return (
    <div className="form-viewport-page space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Cylinder Rentals</h1>
        <button
          onClick={() => setShowModal(true)}
          className="w-full sm:w-auto flex items-center justify-center px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700"
        >
          <PlusIcon className="h-5 w-5 mr-2" />
          Create Rental
        </button>
      </div>

      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="block sm:hidden bg-gradient-to-r from-blue-50 to-purple-50 px-4 py-2 text-xs text-gray-600 text-center border-b border-gray-200">
          ← Swipe to see all columns →
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Rental #</th>
                <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
                <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Employee</th>
                <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Created At</th>
                <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cylinder</th>
                <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Period</th>
                <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
                <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-3 sm:px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {rentals.map((rental) => (
                <tr key={rental.id}>
                  <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-xs sm:text-sm font-medium text-gray-900">
                    {rental.rentalNumber}
                  </td>
                  <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-xs sm:text-sm text-gray-900">
                    {rental.customer?.name || 'N/A'}
                  </td>
                  <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-xs sm:text-sm text-gray-900">
                    {(rental.employee?.fullName || rental.employee?.email || 'N/A')} ({rental.employee?.id ? rental.employee.id.slice(0, 8) : 'N/A'})
                  </td>
                  <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-xs sm:text-sm text-gray-900">
                    {rental.createdAt ? new Date(rental.createdAt).toLocaleString() : 'N/A'}
                  </td>
                  <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-xs sm:text-sm text-gray-900">
                    {rental.cylinder?.cylinderNumber || 'N/A'}
                  </td>
                  <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-xs sm:text-sm text-gray-900">
                    {rental.rentalPeriod} days
                  </td>
                  <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-xs sm:text-sm font-semibold text-gray-900">
                    AED {parseFloat(rental.rentalAmount).toFixed(2)}
                  </td>
                  <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs rounded-full ${getStatusColor(rental.status)}`}>
                      {rental.status}
                    </span>
                  </td>
                  <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-right text-xs sm:text-sm font-medium">
                    {canEditRentals && rental.status === 'active' && (
                      <button
                        onClick={() => completeRental(rental.id)}
                        className="text-primary-600 hover:text-primary-900"
                      >
                        Complete
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Modal */}
      {showModal && (
        <div className="form-modal-overlay">
          <div className="form-modal-wrap px-4 py-6">
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75 backdrop-blur-sm" onClick={resetForm}></div>
            
            <div className="form-modal-panel form-modal-body relative w-full max-w-2xl rounded-xl border border-gray-200 bg-white shadow-xl">
              {/* Header */}
              <div className="rounded-t-xl border-b border-gray-200 px-6 py-5">
                <h3 className="text-2xl font-bold text-gray-900">Create Rental Agreement</h3>
                <p className="mt-1 text-sm text-gray-600">Fill in the details to create a new cylinder rental</p>
              </div>

              <form className="space-y-4 p-4 sm:p-6">
                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-3">Customer</label>
                  <div className="relative">
                    <input
                      required
                      type="text"
                      placeholder="Search customer by name, email, phone..."
                      value={showCustomerDropdown ? customerSearch : (selectedCustomer ? selectedCustomer.name : '')}
                      onChange={(e) => {
                        setCustomerSearch(e.target.value);
                        setShowCustomerDropdown(true);
                      }}
                      onFocus={() => setShowCustomerDropdown(true)}
                      className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none transition-colors"
                    />
                    {showCustomerDropdown && filteredCustomers.length > 0 && (
                      <div className="absolute z-50 w-full mt-1 bg-white border-2 border-blue-500 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                        {filteredCustomers.map((customer) => (
                          <button
                            key={customer.id}
                            type="button"
                            onClick={() => {
                              setFormData({ ...formData, customerId: customer.id });
                              setSelectedCustomer(customer);
                              setCustomerSearch('');
                              setShowCustomerDropdown(false);
                            }}
                            className="w-full text-left px-4 py-2 hover:bg-blue-100 transition-colors border-b border-gray-100 last:border-b-0"
                          >
                            <div className="font-semibold text-gray-900">{customer.name}</div>
                            <div className="text-sm text-gray-600">{customer.email} • {customer.phone}</div>
                          </button>
                        ))}
                      </div>
                    )}
                    {showCustomerDropdown && filteredCustomers.length === 0 && customerSearch && (
                      <div className="absolute z-50 w-full mt-1 bg-white border-2 border-red-300 rounded-lg shadow-lg p-3 text-gray-500 text-sm">
                        No customers found
                      </div>
                    )}
                  </div>
                </div>

                {/* Multi-Item Section */}
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                  <h4 className="text-lg font-bold text-gray-900 mb-4">📦 Add Items</h4>
                  
                  <div className="space-y-4 mb-4">
                    {/* Product Search */}
                    <div>
                      <label className="block text-sm font-semibold text-gray-900 mb-2">
                        Search & Select Product <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        <input
                          type="text"
                          placeholder="Search product name or code..."
                          value={productSearch}
                          onChange={(e) => {
                            setProductSearch(e.target.value);
                            setShowProductDropdown(true);
                          }}
                          onFocus={() => {
                            if (formData.customerId) setShowProductDropdown(true);
                          }}
                          disabled={!formData.customerId}
                          className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none transition-colors disabled:bg-gray-100 disabled:cursor-not-allowed"
                          autoComplete="off"
                        />
                        {!formData.customerId && (
                          <p className="text-xs text-gray-600 mt-1">Please select a customer first</p>
                        )}
                        {/* Dropdown Results */}
                        {showProductDropdown && formData.customerId && (
                          <div className="absolute top-full left-0 right-0 mt-1 bg-white border-2 border-blue-300 rounded-lg shadow-lg z-50 max-h-60 overflow-y-auto">
                            {filteredProducts.length > 0 ? (
                              filteredProducts.map((product) => (
                                <button
                                  key={product.id}
                                  type="button"
                                  onClick={() => {
                                    setCurrentItem({ ...currentItem, productId: product.id, productName: product.productName });
                                    setSelectedProduct(product);
                                    setProductSearch('');
                                    setShowProductDropdown(false);
                                  }}
                                  className="w-full text-left px-4 py-3 hover:bg-blue-50 border-b border-gray-100 last:border-b-0 transition-colors"
                                >
                                  <div className="font-medium text-gray-900">{product.productName}</div>
                                  <div className="text-xs text-gray-600">
                                    Type: {product.productType} {product.productCode ? `• ${product.productCode}` : ''}
                                  </div>
                                </button>
                              ))
                            ) : (
                              <div className="px-4 py-3 text-sm text-gray-600">
                                {productSearch ? 'No products found' : 'No products available'}
                              </div>
                            )}
                          </div>
                        )}
                        {showProductDropdown && (
                          <div
                            className="fixed inset-0 z-40"
                            onClick={() => setShowProductDropdown(false)}
                          />
                        )}
                      </div>
                    </div>

                    {/* Selected Product Info */}
                    {selectedProduct && (
                      <div className="bg-gradient-to-r from-blue-50 to-green-50 border-2 border-green-300 rounded-lg p-4">
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="font-bold text-gray-900">{selectedProduct.productName}</p>
                            <p className="text-sm text-gray-700">
                              <span className="font-semibold">Type:</span> {selectedProduct.productType}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedProduct(null);
                              setCurrentItem({ ...currentItem, productId: '', productName: '' });
                              setProductSearch('');
                            }}
                            className="text-blue-600 hover:text-blue-800 font-medium text-sm"
                          >
                            Clear
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Quantity and Rental Days */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-semibold text-gray-900 mb-2">Quantity</label>
                        <input
                          type="number"
                          min="1"
                          value={currentItem.quantity}
                          onChange={(e) => setCurrentItem({ ...currentItem, quantity: parseInt(e.target.value) || 1 })}
                          className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none transition-colors"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-gray-900 mb-2">Rental Days</label>
                        <input
                          type="number"
                          min="1"
                          value={currentItem.rentalDays}
                          onChange={(e) => setCurrentItem({ ...currentItem, rentalDays: parseInt(e.target.value) || 1 })}
                          className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none transition-colors"
                        />
                      </div>
                    </div>

                    {/* Price and Subtotal */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-semibold text-gray-900 mb-2">Price per Day</label>
                        <div className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg bg-gray-100 text-gray-900 font-semibold">
                          AED 10
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-gray-900 mb-2">Subtotal</label>
                      <div className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 font-bold text-gray-900">
                        AED {(currentItem.quantity * 10 * currentItem.rentalDays).toFixed(2)}
                      </div>
                      </div>
                    </div>

                    {/* Add Item Button */}
                    <button
                      type="button"
                      onClick={addItem}
                      className="w-full rounded-lg bg-primary-600 px-4 py-2 font-semibold text-white transition-colors hover:bg-primary-700"
                    >
                      {editingItemIndex !== null ? '✏️ Update Item' : '+ Add Item'}
                    </button>
                  </div>

                  {/* Items List */}
                  {formData.items.length > 0 && (
                    <div className="space-y-3">
                      <h5 className="font-semibold text-gray-900">Items Added ({formData.items.length}):</h5>
                      {formData.items.map((item, index) => {
                        const subtotal = item.quantity * 10 * item.rentalDays;
                        return (
                          <div key={index} className="bg-white border border-gray-300 rounded-lg p-4">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                              <div className="flex-1">
                                <p className="font-semibold text-gray-900">{item.productName}</p>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2 text-sm text-gray-700">
                                  <div>
                                    <span className="text-gray-600">Qty:</span>
                                    <p className="font-semibold">{item.quantity}</p>
                                  </div>
                                  <div>
                                    <span className="text-gray-600">Days:</span>
                                    <p className="font-semibold">{item.rentalDays}</p>
                                  </div>
                                  <div>
                                    <span className="text-gray-600">Price/Day:</span>
                                    <p className="font-semibold">AED 10</p>
                                  </div>
                                  <div>
                                    <span className="text-gray-600">Subtotal:</span>
                                    <p className="font-bold text-blue-600">AED {subtotal.toFixed(2)}</p>
                                  </div>
                                </div>
                              </div>
                              <div className="flex gap-2 sm:ml-4">
                                <button
                                  type="button"
                                  onClick={() => editItem(index)}
                                  className="px-3 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 font-medium text-sm"
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() => removeItem(index)}
                                  className="px-3 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200 font-medium text-sm"
                                >
                                  Remove
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Auto-calculated Amount Display */}
                {formData.items.length > 0 && (
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                    <div className="space-y-2">
                      <div className="flex justify-between text-base">
                        <span className="font-bold text-gray-900">Total Rental Amount:</span>
                        <span className="font-bold text-gray-900">AED {rentalAmount.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Show Signature Pad only when button is clicked */}
                {showSignaturePad && (
                  <div className="border-t pt-4 sm:pt-6">
                    <CustomerSignaturePad
                      onSave={(sig, name) => {
                        handleSubmit(sig, name);
                      }}
                      onClose={() => {
                        setShowSignaturePad(false);
                      }}
                    />
                  </div>
                )}

                {/* Buttons */}
                <div className="flex flex-col gap-3 sm:flex-row sm:justify-end pt-4 border-t">
                  <button
                    type="button"
                    onClick={resetForm}
                    className="px-6 py-2 border-2 border-gray-300 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  {!showSignaturePad && (
                    <button
                      type="button"
                      onClick={handleCreateRental}
                      className="rounded-lg bg-primary-600 px-6 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-700"
                    >
                      Create Rental
                    </button>
                  )}
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Success Modal */}
      {successModal.isOpen && (
        <RentalSuccessModal
          rental={successModal.rental}
          customer={successModal.customer}
          items={successModal.items}
          totalAmount={successModal.totalAmount}
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

export default Rentals;
