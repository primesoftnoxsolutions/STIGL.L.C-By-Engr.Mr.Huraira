import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import toast from 'react-hot-toast';
import { PlusIcon, PencilIcon, TrashIcon } from '@heroicons/react/24/outline';
import ConfirmDialog from '../components/ConfirmDialog';
import { useAuth } from '../context/AuthContext';

const Employees = () => {
  const { user } = useAuth();
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    fullName: '',
    role: 'employee',
    phone: '',
    address: ''
  });
  const [editingId, setEditingId] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: null,
    type: 'warning'
  });

  useEffect(() => {
    fetchEmployees();
  }, []);

  const fetchEmployees = async () => {
    try {
      const response = await api.get('/users');
      setEmployees(response.data.data);
    } catch (error) {
      toast.error('Failed to fetch employees');
    } finally {
      setLoading(false);
    }
  };

  // Filter out the logged-in user from the list (you can't delete yourself)
  const filteredEmployees = employees.filter(emp => emp.id !== user?.id);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      if (editingId) {
        await api.put(`/users/${editingId}`, formData);
        toast.success('Employee updated successfully');
      } else {
        await api.post('/auth/register', formData);
        toast.success('Employee created successfully');
      }
      
      fetchEmployees();
      resetForm();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Operation failed');
    }
  };

  const handleDelete = async (id) => {
    // Prevent deleting own account
    if (id === user?.id) {
      toast.error('You cannot delete your own account!');
      return;
    }

    setConfirmDialog({
      isOpen: true,
      title: 'Delete Employee',
      message: 'Are you sure you want to permanently delete this employee? This action cannot be undone.',
      type: 'danger',
      onConfirm: async () => {
        try {
          await api.delete(`/users/${id}`);
          toast.success('Employee deleted successfully');
          fetchEmployees();
        } catch (error) {
          const errorMessage = error.response?.data?.message || 'Failed to delete employee';
          toast.error(errorMessage);
        }
        setConfirmDialog({ ...confirmDialog, isOpen: false });
      }
    });
  };

  const handleEdit = (employee) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Edit Employee',
      message: 'Are you sure you want to edit this employee? Make sure to save your changes.',
      type: 'info',
      onConfirm: () => {
        setFormData({
          username: employee.username,
          email: employee.email,
          fullName: employee.fullName,
          role: employee.role,
          phone: employee.phone || '',
          address: employee.address || '',
          password: '' // Don't set password for editing
        });
        setEditingId(employee.id);
        setShowModal(true);
        setConfirmDialog({ ...confirmDialog, isOpen: false });
      }
    });
  };

  const resetForm = () => {
    setFormData({
      username: '',
      email: '',
      password: '',
      fullName: '',
      role: 'employee',
      phone: '',
      address: ''
    });
    setEditingId(null);
    setShowModal(false);
  };

  if (loading) {
    return <div className="flex justify-center items-center h-64">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
    </div>;
  }

  return (
    <div className="form-viewport-page space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Employee Management</h1>
        <button
          onClick={() => setShowModal(true)}
          className="w-full sm:w-auto flex items-center justify-center px-3 sm:px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 text-sm sm:text-base"
        >
          <PlusIcon className="h-4 w-4 sm:h-5 sm:w-5 sm:mr-2" />
          <span className="hidden xs:inline sm:inline">Add Employee</span>
          <span className="inline xs:hidden sm:hidden ml-1">Add</span>
        </button>
      </div>

      {/* Employees Table */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        {/* Scroll hint for mobile */}
        <div className="block sm:hidden bg-gradient-to-r from-blue-50 to-purple-50 px-4 py-2 text-xs text-gray-600 text-center border-b border-gray-200">
          ← Swipe to see all columns →
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
              <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
              <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
              <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Phone</th>
              <th className="px-3 sm:px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredEmployees.map((employee) => (
              <tr key={employee.id}>
                <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap">
                  <div className="text-sm font-medium text-gray-900">{employee.fullName}</div>
                  <div className="text-xs sm:text-sm text-gray-500">@{employee.username}</div>
                </td>
                <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-xs sm:text-sm text-gray-900">{employee.email}</td>
                <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap">
                  <span className={`px-2 py-1 text-xs rounded-full ${
                    employee.role === 'super_admin' ? 'bg-purple-100 text-purple-800' :
                    employee.role === 'manager' ? 'bg-blue-100 text-blue-800' :
                    'bg-green-100 text-green-800'
                  }`}>
                    {employee.role.replace('_', ' ')}
                  </span>
                  {employee.role === 'super_admin' && (
                    <span className="ml-2 text-xs text-purple-600">⭐</span>
                  )}
                </td>
                <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-xs sm:text-sm text-gray-900">{employee.phone || '-'}</td>
                <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-right text-sm font-medium">
                  <button
                    onClick={() => handleEdit(employee)}
                    className="text-primary-600 hover:text-primary-900 mr-3 sm:mr-4"
                    title="Edit employee"
                  >
                    <PencilIcon className="h-4 w-4 sm:h-5 sm:w-5" />
                  </button>
                  <button
                    onClick={() => handleDelete(employee.id)}
                    className="text-red-600 hover:text-red-900"
                    title="Delete employee"
                  >
                    <TrashIcon className="h-4 w-4 sm:h-5 sm:w-5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="form-modal-overlay">
          <div className="form-modal-wrap px-4">
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75" onClick={resetForm}></div>
            
            <div className="form-modal-panel form-modal-panel-compact form-modal-body relative bg-white rounded-lg max-w-md w-full p-4 sm:p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                {editingId ? 'Edit Employee' : 'Add New Employee'}
              </h3>
              
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Full Name</label>
                  <input
                    type="text"
                    required
                    value={formData.fullName}
                    onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">Username</label>
                  <input
                    type="text"
                    required
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">Email</label>
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                  />
                </div>

                {!editingId && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Password</label>
                    <input
                      type="password"
                      required={!editingId}
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700">Role</label>
                  <select
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                  >
                    <option value="employee">Employee</option>
                    <option value="manager">Manager</option>
                  </select>
                  <p className="mt-1 text-xs text-gray-500">
                    Select role for the new user
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">Phone</label>
                  <input
                    type="text"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                  />
                </div>

                <div className="flex flex-col gap-3 sm:flex-row sm:justify-end mt-4 sm:mt-6">
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
                    {editingId ? 'Update' : 'Create'}
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

export default Employees;
