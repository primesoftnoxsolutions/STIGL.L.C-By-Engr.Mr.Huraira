import React, { useState } from 'react';

export default function SalesInvoiceForm({ onCreate }) {
  const [customer, setCustomer] = useState('');
  const [invoiceDate, setInvoiceDate] = useState('2026-01-31');
  const [saleType, setSaleType] = useState('Retail');
  const [product, setProduct] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [unitPrice, setUnitPrice] = useState('');
  const [deliveryCharges, setDeliveryCharges] = useState('');
  const [items, setItems] = useState([]);

  function addItem() {
    if (!product || !quantity || !unitPrice) return;
    const it = { id: Date.now(), product, quantity: Number(quantity), unitPrice: Number(unitPrice), amount: Number((quantity*unitPrice).toFixed(2)) };
    setItems(prev => [...prev, it]);
    setProduct(''); setQuantity(1); setUnitPrice('');
  }

  function removeItem(id) { setItems(prev => prev.filter(i => i.id !== id)); }

  function totalAmount() {
    const subtotal = items.reduce((s,i) => s + i.amount, 0);
    const delivery = parseFloat(deliveryCharges || 0);
    return (subtotal + (isNaN(delivery)?0:delivery)).toFixed(2);
  }

  function handleCreate() {
    if (!customer || items.length === 0) return alert('Please add customer and at least one item');
    const payload = { customer, invoiceDate, saleType, items, deliveryCharges: parseFloat(deliveryCharges||0), total: totalAmount() };
    if (onCreate) onCreate(payload);
  }

  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="glass-card p-6 md:p-10">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
          <div>
            <h1 className="responsive-title gradient-text">Create Sales Invoice</h1>
            <p className="text-sm text-gray-600 mt-1">Customer *</p>
          </div>

          <div className="flex items-center gap-3">
            <button className="glass-button px-4 py-2">Cancel</button>
            <button className="px-5 py-2 flex items-center gap-3 rounded-xl text-white bg-gradient-to-r from-red-500/85 to-rose-500/85 hover:from-red-600/95 hover:to-rose-600/95 shadow-lg transition-all duration-300">Create Invoice ({items.length} items)</button>
          </div>
        </div>

        <div className="responsive-grid-2 mb-6">
          <div>
            <label className="block text-sm text-gray-700 mb-2">Customer *</label>
            <input
              list="sales-form-customers"
              value={customer}
              onChange={e => setCustomer(e.target.value)}
              placeholder="Search customer"
              className="glass-input w-full p-3"
            />
            <datalist id="sales-form-customers">
              <option value="Walk-in" />
            </datalist>
          </div>

          <div>
            <label className="block text-sm text-gray-700 mb-2">Invoice Date</label>
            <input type="date" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} className="glass-input w-full p-3" />
          </div>
        </div>

        <div className="responsive-grid-3 mb-4">
          <div>
            <label className="block text-sm text-gray-700 mb-2">Sale Type *</label>
            <select value={saleType} onChange={e => setSaleType(e.target.value)} className="glass-input w-full p-3">
              <option value="">Select Type...</option>
              <option>Retail</option>
              <option>Wholesale</option>
              <option>Return</option>
            </select>
          </div>

          <div>
            <label className="block text-sm text-gray-700 mb-2">Product *</label>
            <input
              list="sales-form-products"
              value={product}
              onChange={e => setProduct(e.target.value)}
              placeholder="Search product"
              className="glass-input w-full p-3"
            />
            <datalist id="sales-form-products">
              <option value="Gas Cylinder 12kg" />
              <option value="Refill 12kg" />
            </datalist>
          </div>

          <div>
            <label className="block text-sm text-gray-700 mb-2">Quantity *</label>
            <input type="number" min="1" value={quantity} onChange={e => setQuantity(e.target.value)} className="glass-input w-full p-3" />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end mb-6">
          <div>
            <label className="block text-sm text-gray-700 mb-2">Unit Price (AED) *</label>
            <input type="number" step="0.01" value={unitPrice} onChange={e => setUnitPrice(e.target.value)} className="glass-input w-full p-3" placeholder="0" />
          </div>

          <div>
            <label className="block text-sm text-gray-700 mb-2">Delivery Charges (Optional)</label>
            <input type="number" step="0.01" value={deliveryCharges} onChange={e => setDeliveryCharges(e.target.value)} className="glass-input w-full p-3" placeholder="0" />
            <div className="text-xs text-gray-500 mt-1">Delivery charges will be included in VAT calculation</div>
          </div>

          <div>
            <button type="button" onClick={addItem} className="glass-button-primary w-full p-3">Add</button>
          </div>
        </div>

        <div className="mb-6">
          <div className="bg-white/10 p-4 rounded-xl border border-white/10">
            <div className="flex justify-between text-sm text-gray-400 mb-3">Invoice Items</div>
            {items.length === 0 && <div className="text-sm text-gray-500">No items added yet.</div>}
            {items.length > 0 && (
              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-gray-400"><th>Product</th><th>Qty</th><th>Unit</th><th>Amount</th><th></th></tr></thead>
                  <tbody>
                    {items.map(it => (
                      <tr key={it.id} className="border-t border-white/5"><td className="py-2">{it.product}</td><td>{it.quantity}</td><td>{it.unitPrice.toFixed(2)}</td><td>{it.amount.toFixed(2)}</td><td><button onClick={() => removeItem(it.id)} className="text-red-400">Remove</button></td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="text-sm text-gray-500">VAT Info: Delivery charges will be included in VAT calculation.</div>
          <div className="flex items-center gap-4">
            <div className="text-sm">Total: <span className="font-bold text-lg">AED {totalAmount()}</span></div>
            <button onClick={handleCreate} className="px-5 py-2 rounded-xl text-white bg-gradient-to-r from-red-500/85 to-rose-500/85 hover:from-red-600/95 hover:to-rose-600/95 shadow-lg transition-all duration-300">Create Invoice ({items.length} items)</button>
          </div>
        </div>
      </div>
    </div>
  );
}
