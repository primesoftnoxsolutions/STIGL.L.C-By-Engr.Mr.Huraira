import React, { useState, useEffect, useMemo, useCallback } from 'react';
import api from '../utils/api';
import toast from 'react-hot-toast';
import { MagnifyingGlassIcon, ExclamationTriangleIcon, CircleStackIcon, CubeIcon, WrenchScrewdriverIcon } from '@heroicons/react/24/outline';
import { useAuth } from '../context/AuthContext';

const TABS = [
  { id: 'full', label: 'Full Cylinders', category: 'Full Cylinder', icon: '🟢', color: 'green' },
  { id: 'empty', label: 'Empty Cylinders', category: 'Empty Cylinder', icon: '⚪', color: 'gray' },
  { id: 'tools', label: 'Tools', category: 'Tool', icon: '🔧', color: 'orange' }
];

const InventorySparkline = ({ stroke, fillId }) => (
  <svg viewBox="0 0 80 32" className="h-8 w-[72px]" aria-hidden="true">
    <defs>
      <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={stroke} stopOpacity="0.22" />
        <stop offset="100%" stopColor={stroke} stopOpacity="0" />
      </linearGradient>
    </defs>
    <path
      d="M0 22 L12 18 L24 24 L36 12 L48 16 L60 10 L72 14 L80 8 L80 32 L0 32 Z"
      fill={`url(#${fillId})`}
    />
    <path
      d="M0 22 L12 18 L24 24 L36 12 L48 16 L60 10 L72 14 L80 8"
      fill="none"
      stroke={stroke}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const InventoryStatCard = ({ title, value, subtitle, icon: Icon, iconBg, iconColor, sparkColor, sparkId }) => (
  <div className="dash-card p-4 sm:p-5">
    <div className="flex items-center gap-3">
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${iconBg}`}>
        <Icon className={`h-5 w-5 ${iconColor}`} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-slate-500">{title}</p>
        <p className="mt-0.5 text-2xl font-bold leading-none text-slate-900 sm:text-[1.75rem]">{value}</p>
        <p className="mt-1 text-[11px] text-slate-400">{subtitle}</p>
      </div>
      <div className="hidden shrink-0 self-end pb-0.5 sm:block">
        <InventorySparkline stroke={sparkColor} fillId={sparkId} />
      </div>
    </div>
  </div>
);

const Inventory = () => {
  const { isEmployee } = useAuth();
  const [inventoryItems, setInventoryItems] = useState([]);
  const [summary, setSummary] = useState({
    'Full Cylinder': { totalStock: 0, itemCount: 0 },
    'Empty Cylinder': { totalStock: 0, itemCount: 0 },
    'Tool': { totalStock: 0, itemCount: 0 }
  });
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('full');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const fetchInventory = useCallback(async ({ silent = false, skipLoading = false } = {}) => {
    if (!skipLoading) {
      setLoading(true);
    }
    try {
      const [inventoryRes, summaryRes] = await Promise.all([
        api.get('/inventory'),
        api.get('/inventory/summary')
      ]);
      setInventoryItems(inventoryRes.data.data);
      setSummary(summaryRes.data.data);
    } catch (error) {
      if (!silent) {
        toast.error('Failed to fetch inventory');
      }
    } finally {
      if (!skipLoading) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    fetchInventory();
  }, [fetchInventory]);

  useEffect(() => {
    const refreshInterval = setInterval(() => {
      fetchInventory({ silent: true, skipLoading: true });
    }, 15000);

    const onFocus = () => {
      fetchInventory({ silent: true, skipLoading: true });
    };

    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(refreshInterval);
      window.removeEventListener('focus', onFocus);
    };
  }, [fetchInventory]);

  // Reset page when tab or search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, searchTerm]);

  // Get current tab config
  const currentTab = TABS.find(tab => tab.id === activeTab);

  // Filter inventory by tab category and search term
  const filteredInventory = useMemo(() => {
    return inventoryItems.filter(item => {
      const matchesTab = item.inventoryCategory === currentTab?.category;
      
      const matchesSearch = searchTerm === '' || 
        item.product?.productName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.product?.productCode?.toLowerCase().includes(searchTerm.toLowerCase());
      
      return matchesTab && matchesSearch;
    });
  }, [inventoryItems, searchTerm, currentTab]);

  const lowStockCount = useMemo(
    () => inventoryItems.filter((item) => {
      const quantity = Number(item.stockQuantity || 0);
      return quantity > 0 && quantity < 5;
    }).length,
    [inventoryItems]
  );

  // Pagination
  const totalPages = Math.ceil(filteredInventory.length / itemsPerPage);
  const paginatedInventory = filteredInventory.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Get stock status styling
  const getStockStatus = (quantity) => {
    if (quantity === 0) {
      return { 
        bg: 'bg-red-100', 
        text: 'text-red-800', 
        label: 'Out of Stock',
        icon: <ExclamationTriangleIcon className="h-4 w-4 text-red-600" />
      };
    } else if (quantity < 5) {
      return { 
        bg: 'bg-yellow-100', 
        text: 'text-yellow-800', 
        label: 'Low Stock',
        icon: <ExclamationTriangleIcon className="h-4 w-4 text-yellow-600" />
      };
    }
    return { 
      bg: 'bg-green-100', 
      text: 'text-green-800', 
      label: 'In Stock',
      icon: null
    };
  };

  if (loading) {
    return <div className="flex justify-center items-center h-64">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
    </div>;
  }

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-5 sm:space-y-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <InventoryStatCard
          title="Total Full Cylinders"
          value={summary['Full Cylinder']?.totalStock || 0}
          subtitle="Full cylinder stock"
          icon={CircleStackIcon}
          iconBg="bg-violet-100"
          iconColor="text-violet-600"
          sparkColor="#8b5cf6"
          sparkId="inventory-stat-full"
        />
        <InventoryStatCard
          title="Total Empty Cylinders"
          value={summary['Empty Cylinder']?.totalStock || 0}
          subtitle="Empty cylinder stock"
          icon={CubeIcon}
          iconBg="bg-emerald-100"
          iconColor="text-emerald-600"
          sparkColor="#10b981"
          sparkId="inventory-stat-empty"
        />
        <InventoryStatCard
          title="Total Tools"
          value={summary['Tool']?.totalStock || 0}
          subtitle="Tools in inventory"
          icon={WrenchScrewdriverIcon}
          iconBg="bg-sky-100"
          iconColor="text-sky-600"
          sparkColor="#0ea5e9"
          sparkId="inventory-stat-tools"
        />
        <InventoryStatCard
          title="Low Stock"
          value={lowStockCount}
          subtitle="Items below threshold"
          icon={ExclamationTriangleIcon}
          iconBg="bg-amber-100"
          iconColor="text-amber-600"
          sparkColor="#f59e0b"
          sparkId="inventory-stat-low-stock"
        />
      </div>
      {/* Tabs */}
      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white/95 shadow-xl shadow-slate-200/70">
        <div className="border-b border-slate-200/80">
          <nav className="flex -mb-px overflow-x-auto" aria-label="Tabs">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 min-w-0 border-b-2 px-4 py-3 sm:py-4 text-center text-sm font-medium whitespace-nowrap transition-colors ${
                  activeTab === tab.id
                    ? 'border-primary-500 bg-blue-50/70 text-primary-600'
                    : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'
                }`}
              >
                <span className="flex items-center justify-center gap-2">
                  <span className="text-lg">{tab.icon}</span>
                  <span className="hidden sm:inline">{tab.label}</span>
                  <span className="sm:hidden">{tab.label.split(' ')[0]}</span>
                  <span className={`ml-1 rounded-full px-2 py-0.5 text-xs ${
                    activeTab === tab.id 
                      ? 'bg-primary-100 text-primary-700' 
                      : 'bg-slate-100 text-slate-600'
                  }`}>
                    {summary[tab.category]?.totalStock || 0}
                  </span>
                </span>
              </button>
            ))}
          </nav>
        </div>

        {/* Search within tab */}
        <div className="border-b border-slate-200/80 bg-white p-4">
          <div className="relative max-w-md">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder={`Search ${currentTab?.label.toLowerCase()}...`}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-10 w-full rounded-xl border border-gray-200 pl-10 pr-3 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
            />
          </div>
        </div>

        {/* Table */}
        <div className="block sm:hidden border-b border-slate-200 bg-gradient-to-r from-blue-50 to-slate-100 px-4 py-2 text-center text-xs font-medium text-slate-600">
          Swipe to view all columns
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[980px] w-full">
            <thead className="bg-gradient-to-r from-slate-100 to-blue-50">
              <tr>
                <th className="px-5 py-3 sm:py-4 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-600">Product Code</th>
                <th className="px-5 py-3 sm:py-4 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-600">Product Name</th>
                <th className="px-5 py-3 sm:py-4 text-center text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-600">Current Stock</th>
                <th className="px-5 py-3 sm:py-4 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-600">Status</th>
                <th className="px-5 py-3 sm:py-4 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-600">Last Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/80 bg-white">
              {paginatedInventory.map((item) => {
                const stockStatus = getStockStatus(item.stockQuantity);
                return (
                  <tr key={item.id} className={`transition-colors duration-200 hover:bg-blue-50/35 ${item.stockQuantity === 0 ? 'bg-red-50/60' : ''}`}>
                    <td className="whitespace-nowrap px-5 py-3 sm:py-4">
                      <span className="inline-flex rounded-md bg-blue-50 px-2 py-1 text-xs font-mono font-bold tracking-wide text-primary-600 ring-1 ring-blue-100">
                        {item.product?.productCode}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-5 py-3 sm:py-4">
                      <div className="text-sm font-semibold text-slate-800">
                        {item.product?.productName}
                      </div>
                      <div className="text-xs text-slate-500">
                        {item.inventoryCategory}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-5 py-3 sm:py-4 text-center">
                      <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-bold ${
                        item.stockQuantity === 0 
                          ? 'bg-red-100 text-red-800' 
                          : item.stockQuantity < 5 
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-green-100 text-green-800'
                      }`}>
                        {stockStatus.icon}
                        {item.stockQuantity}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-5 py-3 sm:py-4">
                      <span className={`px-2 py-1 text-xs rounded-full ${stockStatus.bg} ${stockStatus.text}`}>
                        {stockStatus.label}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-5 py-3 sm:py-4 text-sm text-slate-600">
                      {item.lastPurchaseDate 
                        ? new Date(item.lastPurchaseDate).toLocaleDateString()
                        : '-'
                      }
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Empty State */}
        {filteredInventory.length === 0 && (
          <div className="text-center py-12">
            <div className="text-4xl mb-4">{currentTab?.icon}</div>
            <p className="text-gray-500 mb-2">
              {searchTerm 
                ? `No ${currentTab?.label.toLowerCase()} found matching "${searchTerm}"`
                : `No ${currentTab?.label.toLowerCase()} in inventory yet`
              }
            </p>
            <p className="text-xs text-gray-400 mt-2">
              {isEmployee ? 'Inventory is populated when stock is assigned to you' : 'Inventory is populated when purchases are confirmed in Purchase Management'}
            </p>
          </div>
        )}

        {/* Pagination */}
        {filteredInventory.length > 0 && (
          <div className="flex flex-col items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 sm:flex-row">
            <div className="text-sm text-slate-500">
              Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, filteredInventory.length)} of {filteredInventory.length} items
            </div>
            {totalPages > 1 && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                  disabled={currentPage === 1}
                  className="rounded-lg border border-slate-200 px-3 py-1 text-sm text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Previous
                </button>
                <span className="text-sm text-slate-600">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                  disabled={currentPage === totalPages}
                  className="rounded-lg border border-slate-200 px-3 py-1 text-sm text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            )}
          </div>
        )}
      </div>

    </div>
  );
};

export default Inventory;


