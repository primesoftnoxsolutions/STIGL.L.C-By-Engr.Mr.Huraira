import React, { useEffect, useMemo, useState } from 'react';
import api from '../utils/api';
import toast from 'react-hot-toast';
import {
  buildCustomerRateKey,
  getProductTypeForCustomerRate,
  normalizeCustomerRateType
} from '../utils/customerRate';

const CustomerItemRates = () => {
  const [customers, setCustomers] = useState([]);
  const [customersLoading, setCustomersLoading] = useState(false);
  const [products, setProducts] = useState([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [ratesLoading, setRatesLoading] = useState(false);
  const [savingRates, setSavingRates] = useState(false);

  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [customerQuery, setCustomerQuery] = useState('');
  const [customerSuggestions, setCustomerSuggestions] = useState([]);
  const [rateItems, setRateItems] = useState([]);
  const [rates, setRates] = useState({});
  const [newItemType, setNewItemType] = useState('');
  const [newItemId, setNewItemId] = useState('');
  const [newItemQuery, setNewItemQuery] = useState('');
  const [newItemSuggestions, setNewItemSuggestions] = useState([]);
  const [newRate, setNewRate] = useState('');

  const isCustomerSelected = Boolean(selectedCustomer);

  const customerLabel = useMemo(() => {
    if (!selectedCustomer) return '';
    return `${selectedCustomer.name} (${selectedCustomer.customerCode || 'N/A'})`;
  }, [selectedCustomer]);

  useEffect(() => {
    const fetchCustomers = async () => {
      try {
        setCustomersLoading(true);
        const res = await api.get('/customers');
        const list = Array.isArray(res.data?.data) ? res.data.data : [];
        setCustomers(list);
      } catch (error) {
        console.error('Failed to fetch customers:', error);
        toast.error('Failed to load customers');
      } finally {
        setCustomersLoading(false);
      }
    };

    fetchCustomers();
  }, []);

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        setProductsLoading(true);
        const res = await api.get('/products');
        const list = Array.isArray(res.data?.data) ? res.data.data : [];
        setProducts(list);
        setRateItems([]);
        setRates({});
      } catch (error) {
        console.error('Failed to fetch products:', error);
        toast.error('Failed to load products');
      } finally {
        setProductsLoading(false);
      }
    };

    fetchProducts();
  }, []);

  useEffect(() => {
    setRateItems([]);
    setRates({});
    setNewItemType('');
    setNewItemId('');
    setNewItemQuery('');
    setNewItemSuggestions([]);
    setNewRate('');

    if (!selectedCustomer) return;

    const fetchRates = async () => {
      try {
        setRatesLoading(true);
        const res = await api.get('/customer-item-rates', {
          params: { customerId: selectedCustomer.id }
        });
        const list = Array.isArray(res.data?.data) ? res.data.data : [];
        const nextItems = list.map((rate) => {
          const product = rate.product || products.find((p) => p.id === rate.itemId);
          const itemType = normalizeCustomerRateType(rate.itemType) || rate.itemType || product?.productType || 'N/A';
          return {
            key: buildCustomerRateKey(itemType, rate.itemId) || `${itemType}::${rate.itemId}`,
            id: rate.itemId,
            name: product?.productName || 'Unknown Item',
            unit: product?.productCategory || product?.productType || 'N/A',
            type: itemType
          };
        });
        const nextRates = list.reduce((acc, rate) => {
          const itemType = normalizeCustomerRateType(rate.itemType) || rate.itemType;
          const key = buildCustomerRateKey(itemType, rate.itemId);
          if (key) {
            acc[key] = rate.rate;
          }
          return acc;
        }, {});
        setRateItems(nextItems);
        setRates(nextRates);
      } catch (error) {
        console.error('Failed to load customer rates:', error);
        toast.error('Failed to load customer rates');
      } finally {
        setRatesLoading(false);
      }
    };

    fetchRates();
  }, [selectedCustomer, products]);

  const handleRateChange = (id, value) => {
    setRates((prev) => ({ ...prev, [id]: value }));
  };

  const itemTypes = useMemo(() => {
    const types = Array.from(new Set(
      products.flatMap((product) => {
        if (product.productType === 'Cylinder') {
          return ['Full Cylinder', 'Empty Cylinder'];
        }
        return product.productType ? [product.productType] : [];
      })
    ));
    return types.length > 0 ? types : ['Gas', 'Full Cylinder', 'Empty Cylinder', 'Tool'];
  }, [products]);

  const availableItemOptions = useMemo(() => {
    if (!newItemType) return [];
    const productType = getProductTypeForCustomerRate(newItemType);
    if (!productType) return [];
    return products.filter((product) => product.productType === productType);
  }, [newItemType, products]);

  const handleAddItem = () => {
    const parsedRate = parseFloat(newRate);
    if (!newItemType || !newItemId || !Number.isFinite(parsedRate) || parsedRate <= 0) return;

    const selected = availableItemOptions.find((item) => item.id === newItemId);
    if (!selected) return;

    const itemType = normalizeCustomerRateType(newItemType) || newItemType;
    const rateKey = buildCustomerRateKey(itemType, selected.id);
    if (!rateKey) return;

    setRateItems((prev) => {
      const exists = prev.some((item) => item.key === rateKey);
      if (exists) return prev;
      return [
        ...prev,
        {
          key: rateKey,
          id: selected.id,
          name: selected.productName,
          unit: selected.productCategory || selected.productType || 'N/A',
          type: itemType
        }
      ];
    });

    setRates((prev) => ({
      ...prev,
      [rateKey]: parsedRate
    }));

    setNewItemType('');
    setNewItemId('');
    setNewItemQuery('');
    setNewItemSuggestions([]);
    setNewRate('');
  };

  const handleReset = () => {
    setRateItems([]);
    setRates({});
    setNewItemType('');
    setNewItemId('');
    setNewItemQuery('');
    setNewItemSuggestions([]);
    setNewRate('');
  };

  const handleSaveRates = async () => {
    if (!selectedCustomer) {
      toast.error('Select a customer first');
      return;
    }

    if (rateItems.length === 0) {
      toast.error('Add at least one item rate before saving');
      return;
    }

    const itemsPayload = rateItems.map((item) => ({
      itemType: item.type,
      itemId: item.id,
      rate: rates[item.key]
    }));

    const invalid = itemsPayload.some((item) => {
      const rateValue = parseFloat(item.rate);
      return !item.itemType || !item.itemId || !Number.isFinite(rateValue) || rateValue <= 0;
    });

    if (invalid) {
      toast.error('All rates must be greater than zero');
      return;
    }

    try {
      setSavingRates(true);
      const res = await api.post('/customer-item-rates', {
        customerId: selectedCustomer.id,
        items: itemsPayload
      });
      const list = Array.isArray(res.data?.data) ? res.data.data : [];
      const nextItems = list.map((rate) => {
        const product = rate.product || products.find((p) => p.id === rate.itemId);
        const itemType = normalizeCustomerRateType(rate.itemType) || rate.itemType || product?.productType || 'N/A';
        return {
          key: buildCustomerRateKey(itemType, rate.itemId) || `${itemType}::${rate.itemId}`,
          id: rate.itemId,
          name: product?.productName || 'Unknown Item',
          unit: product?.productCategory || product?.productType || 'N/A',
          type: itemType
        };
      });
      const nextRates = list.reduce((acc, rate) => {
        const itemType = normalizeCustomerRateType(rate.itemType) || rate.itemType;
        const key = buildCustomerRateKey(itemType, rate.itemId);
        if (key) {
          acc[key] = rate.rate;
        }
        return acc;
      }, {});
      setRateItems(nextItems);
      setRates(nextRates);
      toast.success('Rates saved successfully');
    } catch (error) {
      console.error('Failed to save customer rates:', error);
      toast.error(error?.response?.data?.message || 'Failed to save rates');
    } finally {
      setSavingRates(false);
    }
  };

  const handleCustomerInput = (value) => {
    setCustomerQuery(value);
    setSelectedCustomer(null);

    const query = value.trim().toLowerCase();
    if (!query) {
      setCustomerSuggestions([]);
      return;
    }

    const matches = customers.filter((customer) => {
      const name = (customer.name || '').toLowerCase();
      const code = (customer.customerCode || '').toLowerCase();
      return name.includes(query) || code.includes(query);
    });

    setCustomerSuggestions(matches.slice(0, 8));
  };

  const selectCustomer = (customer) => {
    if (!customer) return;
    setSelectedCustomer(customer);
    setCustomerQuery(customer.name || '');
    setCustomerSuggestions([]);
  };

  const handleItemQueryChange = (value) => {
    setNewItemQuery(value);
    setNewItemId('');

    if (!newItemType) {
      setNewItemSuggestions([]);
      return;
    }

    const query = value.trim().toLowerCase();
    if (!query) {
      setNewItemSuggestions(availableItemOptions.slice(0, 8));
      return;
    }

    const matches = availableItemOptions.filter((product) =>
      (product.productName || '').toLowerCase().includes(query)
    );
    setNewItemSuggestions(matches.slice(0, 8));
  };

  const selectItem = (item) => {
    if (!item) return;
    setNewItemId(item.id);
    setNewItemQuery(item.productName || '');
    setNewItemSuggestions([]);
  };

  return (
    <div className="form-viewport-page min-h-full space-y-5">
      <div className="relative overflow-visible rounded-[14px] border border-transparent bg-gradient-to-br from-blue-50 via-slate-50 to-white p-4 shadow-lg sm:p-6">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(129,140,248,0.22),_transparent_60%)]"></div>
        <div className="relative grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,460px)] lg:items-end">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Customer Item Rates</h1>
            <p className="mt-1 text-sm text-gray-600">
              Manage customer-specific pricing for items, services, and special rate plans.
            </p>
            {customerLabel && (
              <p className="mt-2 text-xs text-gray-500">{customerLabel}</p>
            )}
          </div>

          <div className="relative z-20">
            <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
              Customer
            </label>
            <div className="relative overflow-visible">
              <input
                value={customerQuery}
                onChange={(e) => handleCustomerInput(e.target.value)}
                onBlur={() => setTimeout(() => setCustomerSuggestions([]), 150)}
                placeholder="Search customer by name or code"
                className="h-11 w-full rounded-xl border border-gray-200 px-3 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
              />
              {customerSuggestions.length > 0 && (
                <div className="absolute z-50 mt-2 w-full rounded-xl border border-slate-200 bg-white shadow-lg">
                  {customerSuggestions.map((customer) => (
                    <button
                      key={customer.id}
                      type="button"
                      onMouseDown={(event) => {
                        event.preventDefault();
                        selectCustomer(customer);
                      }}
                      className="w-full px-3 py-2 text-left text-sm transition hover:bg-blue-50/60"
                    >
                      <div className="font-medium text-gray-800">{customer.name}</div>
                      <div className="text-xs text-gray-500">
                        {customer.customerCode || 'No code'}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {!customerLabel && customersLoading && (
              <p className="mt-2 text-xs text-gray-500">Loading customers...</p>
            )}
            {!customerLabel && !customersLoading && customerQuery && customerSuggestions.length === 0 && (
              <p className="mt-2 text-xs text-gray-500">
                No matching customers. Select from the list to continue.
              </p>
            )}
          </div>
        </div>
      </div>

      {isCustomerSelected && (
        <div className="relative z-20 overflow-visible rounded-2xl border border-slate-200/80 bg-white/95 p-4 shadow-xl shadow-slate-200/70 sm:p-6">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Add Item</h2>
              <p className="text-xs text-gray-600">Add a custom rate for the selected customer.</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-4">
            <div>
              <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                Item Type
              </label>
              <select
                value={newItemType}
                onChange={(e) => {
                  setNewItemType(e.target.value);
                  setNewItemId('');
                  setNewItemQuery('');
                  setNewItemSuggestions([]);
                }}
                disabled={productsLoading}
                className="h-11 w-full rounded-xl border border-gray-200 px-3 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <option value="">Select type</option>
                {itemTypes.map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                Item Name
              </label>
              <div className="relative overflow-visible">
                <input
                  value={newItemQuery}
                  onChange={(e) => handleItemQueryChange(e.target.value)}
                  onBlur={() => setTimeout(() => setNewItemSuggestions([]), 150)}
                  disabled={!newItemType || productsLoading}
                  placeholder={newItemType ? 'Search item name' : 'Select item type first'}
                  className="h-11 w-full rounded-xl border border-gray-200 px-3 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200 disabled:cursor-not-allowed disabled:opacity-60"
                />
                {newItemSuggestions.length > 0 && (
                  <div className="absolute z-50 mt-2 w-full rounded-xl border border-slate-200 bg-white shadow-lg">
                    {newItemSuggestions.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onMouseDown={(event) => {
                          event.preventDefault();
                          selectItem(item);
                        }}
                        className="w-full px-3 py-2 text-left text-sm transition hover:bg-blue-50/60"
                      >
                        <div className="font-medium text-gray-800">{item.productName}</div>
                        <div className="text-xs text-gray-500">
                          {item.productCategory || item.productType || 'N/A'}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {productsLoading && (
                <p className="mt-1 text-xs text-gray-500">Loading items...</p>
              )}
              {!productsLoading && newItemType && newItemQuery && newItemSuggestions.length === 0 && (
                <p className="mt-1 text-xs text-gray-500">
                  No matching items. Select from the list to continue.
                </p>
              )}
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                Rate
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={newRate}
                onChange={(e) => setNewRate(e.target.value)}
                placeholder="0.00"
                className="h-11 w-full rounded-xl border border-gray-200 px-3 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
              />
            </div>
            <div className="flex items-end">
              <button
                type="button"
                onClick={handleAddItem}
                disabled={
                  !newItemType ||
                  !newItemId ||
                  !Number.isFinite(parseFloat(newRate)) ||
                  parseFloat(newRate) <= 0 ||
                  productsLoading
                }
                className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-primary-600 px-4 text-sm font-semibold text-white shadow transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Add
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white/95 p-4 shadow-xl shadow-slate-200/70 sm:p-6">
        <div className="overflow-x-auto">
          <table className="min-w-[760px] w-full">
            <thead className="bg-gradient-to-r from-slate-100 to-blue-50">
              <tr>
                <th className="px-5 py-3 sm:py-4 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-600">Item Name</th>
                <th className="px-5 py-3 sm:py-4 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-600">Unit / Type</th>
                <th className="px-5 py-3 sm:py-4 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-600">Rate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/80 bg-white text-slate-700">
              {rateItems.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-5 py-10 text-center text-sm text-slate-500">
                    {ratesLoading
                      ? 'Loading customer rates...'
                      : productsLoading
                        ? 'Loading items...'
                        : 'No items added yet.'}
                  </td>
                </tr>
              ) : (
                rateItems.map((item) => (
                  <tr key={item.key} className="transition-colors duration-200 hover:bg-blue-50/35">
                    <td className="px-5 py-3 sm:py-4 text-sm font-medium text-slate-800">{item.name}</td>
                    <td className="px-5 py-3 sm:py-4 text-sm text-slate-500">{item.unit}{item.type ? ` - ${item.type}` : ''}</td>
                    <td className="px-5 py-3 sm:py-4">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={rates[item.key]}
                        onChange={(e) => handleRateChange(item.key, e.target.value)}
                        disabled={!isCustomerSelected}
                        placeholder="0.00"
                        className="h-10 w-full rounded-xl border border-gray-200 px-3 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200 disabled:cursor-not-allowed disabled:opacity-60"
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4 sm:mt-6 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            disabled={!isCustomerSelected || savingRates || rateItems.length === 0}
            onClick={handleSaveRates}
            className="inline-flex h-11 items-center justify-center rounded-xl bg-primary-600 px-5 text-sm font-semibold text-white shadow transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {savingRates ? 'Saving...' : 'Save Rates'}
          </button>
          <button
            type="button"
            disabled={!isCustomerSelected}
            onClick={handleReset}
            className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Reset / Clear
          </button>
        </div>
      </div>
    </div>
  );
};

export default CustomerItemRates;
