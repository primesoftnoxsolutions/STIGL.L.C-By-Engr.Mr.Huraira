const { sequelize, Deposit, DepositItem, DepositReturn, DepositReturnItem, InventoryItem, Product, Customer, User, Notification, CustomerItemRate, StockTransfer, StockTransferItem } = require('../models');
const { logInventoryMutation } = require('../utils/stockLogger');
const { Op, DataTypes } = require('sequelize');
const { ensureTableColumns } = require('../utils/schemaUtils');
const { toUaeDateKey } = require('../utils/uaeTime');
const { queueDailyStockRebuildFromDate } = require('./reportController');

let depositSchemaReady = false;
let depositItemSchemaReady = false;
let depositReturnSchemaReady = false;
let customerSchemaReady = false;
const MANUAL_RETURN_SEED_SOURCE = 'manual_return_seed';

const getDateKeyFromValue = (value) => {
  if (!value) return null;
  const resolved = value instanceof Date ? value : new Date(value);
  return Number.isNaN(resolved.getTime()) ? null : toUaeDateKey(resolved);
};

const rebuildDailyStockForDateValue = async (dateValue, reason) => {
  const dateKey = getDateKeyFromValue(dateValue);
  if (!dateKey) return;

  try {
    await queueDailyStockRebuildFromDate(dateKey, { reason });
  } catch (error) {
    console.error(`[DAILY STOCK] Rebuild failed after ${reason}:`, error.message);
  }
};

const ensureDepositSchema = async () => {
  if (depositSchemaReady) return;
  await ensureTableColumns(sequelize, 'deposits', [
    {
      name: 'invoiceNumber',
      definition: { type: DataTypes.STRING(20), allowNull: false, defaultValue: '' }
    },
    {
      name: 'customerSignature',
      definition: { type: DataTypes.TEXT, allowNull: true }
    },
    {
      name: 'employeeSignature',
      definition: { type: DataTypes.TEXT, allowNull: true }
    },
    {
      name: 'authorizedById',
      definition: { type: DataTypes.UUID, allowNull: true }
    },
    {
      name: 'authorizedByName',
      definition: { type: DataTypes.STRING(100), allowNull: true }
    },
    {
      name: 'authorizedBySignature',
      definition: { type: DataTypes.TEXT, allowNull: true }
    },
    {
      name: 'receivedByName',
      definition: { type: DataTypes.STRING(100), allowNull: true }
    },
    {
      name: 'sourceType',
      definition: { type: DataTypes.STRING(50), allowNull: true }
    },
    {
      name: 'sourceReferenceId',
      definition: { type: DataTypes.STRING(100), allowNull: true }
    },
    {
      name: 'notes',
      definition: { type: DataTypes.TEXT, allowNull: true }
    }
  ]);

  depositSchemaReady = true;
};

const ensureDepositItemSchema = async () => {
  if (depositItemSchemaReady) return;
  await ensureTableColumns(sequelize, 'deposit_items', [
    {
      name: 'returnedQuantity',
      definition: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 }
    }
  ]);
  depositItemSchemaReady = true;
};

const ensureDepositReturnSchema = async () => {
  if (depositReturnSchemaReady) return;
  await DepositReturn.sync();
  await ensureTableColumns(sequelize, 'deposit_returns', [
    {
      name: 'employeeSignature',
      definition: { type: DataTypes.TEXT, allowNull: true }
    },
    {
      name: 'authorizedById',
      definition: { type: DataTypes.UUID, allowNull: true }
    },
    {
      name: 'authorizedByName',
      definition: { type: DataTypes.STRING(100), allowNull: true }
    },
    {
      name: 'authorizedBySignature',
      definition: { type: DataTypes.TEXT, allowNull: true }
    },
    {
      name: 'receivedByName',
      definition: { type: DataTypes.STRING(100), allowNull: true }
    },
    {
      name: 'notes',
      definition: { type: DataTypes.TEXT, allowNull: true }
    }
  ]);
  depositReturnSchemaReady = true;
};

const ensureCustomerSchema = async () => {
  if (customerSchemaReady) return;
  await ensureTableColumns(sequelize, 'customers', [
    {
      name: 'fullName',
      definition: { type: DataTypes.STRING(150), allowNull: true }
    },
    {
      name: 'companyName',
      definition: { type: DataTypes.STRING(150), allowNull: true }
    }
  ]);

  customerSchemaReady = true;
};

const calculateMonthsElapsed = (startDate, endDate) => {
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  let months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
  if (end.getDate() < start.getDate()) {
    months -= 1;
  }
  return Math.max(0, months);
};

const buildCustomerLabel = (customer) => {
  if (!customer) return 'Unknown Customer';
  return customer.name || customer.customerCode || customer.phone || customer.email || 'Customer';
};

const buildCustomerRateMap = async (customerId, transaction) => {
  if (!customerId) return new Map();
  const rates = await CustomerItemRate.findAll({
    where: { customerId },
    transaction
  });
  const map = new Map();
  rates.forEach(rate => {
    const value = parseFloat(rate.rate);
    if (rate.itemId && Number.isFinite(value)) {
      map.set(rate.itemId, value);
    }
  });
  return map;
};

const buildVisibleDepositWhere = (extra = {}) => ({
  ...extra,
  [Op.or]: [
    { sourceType: null },
    { sourceType: { [Op.ne]: MANUAL_RETURN_SEED_SOURCE } }
  ]
});

const ensureSequencesTable = async (transaction) => {
  await sequelize.query(
    'CREATE TABLE IF NOT EXISTS Sequences (name TEXT PRIMARY KEY, lastValue INTEGER);',
    { transaction }
  );
};

const getNextSequenceValue = async ({ transaction, sequenceName, maxQuery }) => {
  await ensureSequencesTable(transaction);

  const [maxRows] = await sequelize.query(maxQuery, { transaction });
  const maxSeq = parseInt(maxRows?.[0]?.maxSeq || 0, 10) || 0;
  const [rows] = await sequelize.query(
    'SELECT lastValue FROM Sequences WHERE name = ?;',
    { replacements: [sequenceName], transaction }
  );

  let seq = 1;
  if (!rows || rows.length === 0) {
    seq = maxSeq + 1;
    await sequelize.query(
      'INSERT INTO Sequences (name, lastValue) VALUES (?, ?);',
      { replacements: [sequenceName, seq], transaction }
    );
    return seq;
  }

  await sequelize.query(
    'UPDATE Sequences SET lastValue = lastValue + 1 WHERE name = ?;',
    { replacements: [sequenceName], transaction }
  );
  const [newRow] = await sequelize.query(
    'SELECT lastValue FROM Sequences WHERE name = ?;',
    { replacements: [sequenceName], transaction }
  );
  seq = parseInt(newRow?.[0]?.lastValue || 0, 10) || seq;

  if (seq <= maxSeq) {
    seq = maxSeq + 1;
    await sequelize.query(
      'UPDATE Sequences SET lastValue = ? WHERE name = ?;',
      { replacements: [seq, sequenceName], transaction }
    );
  }

  return seq;
};

const getNextDepositInvoiceNumber = async (transaction) => {
  const seq = await getNextSequenceValue({
    transaction,
    sequenceName: 'deposit_invoice',
    maxQuery: `SELECT MAX(CAST(
      CASE
        WHEN "invoiceNumber" LIKE 'DEP-%' THEN SUBSTR("invoiceNumber", 5)
        WHEN "invoiceNumber" LIKE 'dp%' THEN SUBSTR("invoiceNumber", 3)
        ELSE NULL
      END AS INTEGER
    )) as maxSeq FROM deposits;`
  });

  return 'DEP-' + String(seq).padStart(4, '0');
};

const getNextReturnNumber = async (transaction) => {
  const seq = await getNextSequenceValue({
    transaction,
    sequenceName: 'return_invoice',
    maxQuery: `SELECT MAX(CAST(
      CASE
        WHEN "returnNumber" LIKE 'RET-%' THEN SUBSTR("returnNumber", 5)
        WHEN "returnNumber" LIKE 'ret%' THEN SUBSTR("returnNumber", 4)
        ELSE NULL
      END AS INTEGER
    )) as maxSeq FROM deposit_returns;`
  });

  return 'RET-' + String(seq).padStart(4, '0');
};

const isManualReturnSeedDeposit = (deposit, returnId) => (
  Boolean(deposit)
  && deposit.sourceType === MANUAL_RETURN_SEED_SOURCE
  && String(deposit.sourceReferenceId || '') === String(returnId || '')
);

const createManualSeedDepositForReturn = async ({
  transaction,
  depositReturnId,
  customerId,
  preparedById,
  preparedBySignature,
  authorizedBySignature,
  authorizedByName,
  authorizedById,
  items
}) => {
  const normalizedItems = new Map();

  (items || []).forEach((item) => {
    const productId = item.productId;
    const quantity = parseInt(item.quantity || 0, 10) || 0;
    if (!productId || quantity <= 0) return;
    normalizedItems.set(productId, (normalizedItems.get(productId) || 0) + quantity);
  });

  const invoiceNumber = await getNextDepositInvoiceNumber(transaction);
  const deposit = await Deposit.create({
    customerId,
    employeeId: preparedById,
    paymentType: 'Cash',
    totalAmount: 0,
    employeeSignature: preparedBySignature,
    authorizedBySignature,
    authorizedByName,
    authorizedById,
    invoiceNumber,
    sourceType: MANUAL_RETURN_SEED_SOURCE,
    sourceReferenceId: depositReturnId
  }, { transaction });

  const createdItems = [];
  for (const [productId, quantity] of normalizedItems.entries()) {
    const item = await DepositItem.create({
      depositId: deposit.id,
      productId,
      quantity,
      price: 0,
      amount: 0
    }, { transaction });
    createdItems.push(item);
  }

  return { deposit, items: createdItems };
};

const buildEmployeeEmptyAvailability = async (employeeId, options = {}) => {
  const { excludeDepositId, excludeDepositItemId, transaction } = options;
  if (!employeeId) return new Map();

  const assignRows = await StockTransferItem.findAll({
    attributes: [
      'productId',
      [sequelize.fn('SUM', sequelize.col('StockTransferItem.quantity')), 'totalQty']
    ],
    include: [{
      model: StockTransfer,
      as: 'transfer',
      attributes: [],
      where: {
        employeeId,
        transferType: 'assign',
        status: 'received'
      }
    }],
    where: { itemType: 'Empty Cylinder' },
    group: ['productId'],
    transaction
  });

  const returnRows = await StockTransferItem.findAll({
    attributes: [
      'productId',
      [sequelize.fn('SUM', sequelize.col('StockTransferItem.quantity')), 'totalQty']
    ],
    include: [{
      model: StockTransfer,
      as: 'transfer',
      attributes: [],
      where: {
        employeeId,
        transferType: 'return',
        status: { [Op.in]: ['pending', 'received'] }
      }
    }],
    where: { itemType: 'Empty Cylinder' },
    group: ['productId'],
    transaction
  });

  const depositWhere = buildVisibleDepositWhere({ employeeId });
  if (excludeDepositId) {
    depositWhere.id = { [Op.ne]: excludeDepositId };
  }

  const depositItems = await DepositItem.findAll({
    attributes: ['id', 'productId', 'quantity'],
    include: [{
      model: Deposit,
      as: 'deposit',
      attributes: [],
      where: depositWhere
    }],
    transaction
  });

  const depositItemIds = depositItems
    .map((row) => row.id)
    .filter(Boolean)
    .filter((id) => !excludeDepositItemId || id !== excludeDepositItemId);

  const returnedMap = new Map();
  if (depositItemIds.length > 0) {
    const returnedRows = await DepositReturnItem.findAll({
      attributes: ['depositItemId', [sequelize.fn('SUM', sequelize.col('quantity')), 'returnedQty']],
      where: { depositItemId: { [Op.in]: depositItemIds } },
      group: ['depositItemId'],
      transaction
    });
    returnedRows.forEach((row) => {
      const qty = parseInt(row.get('returnedQty') || 0, 10) || 0;
      returnedMap.set(row.depositItemId, qty);
    });
  }

  const map = new Map();

  const applyRows = (rows, direction) => {
    rows.forEach((row) => {
      const pid = row.productId;
      const qty = parseInt(row.get('totalQty'), 10) || 0;
      const prev = map.get(pid) || 0;
      map.set(pid, prev + (direction * qty));
    });
  };

  applyRows(assignRows, 1);
  applyRows(returnRows, -1);

  depositItems.forEach((row) => {
    if (excludeDepositItemId && row.id === excludeDepositItemId) return;
    const qty = parseInt(row.quantity || 0, 10) || 0;
    const returnedQty = returnedMap.get(row.id) || 0;
    const outstandingQty = Math.max(0, qty - returnedQty);
    const prev = map.get(row.productId) || 0;
    map.set(row.productId, prev - outstandingQty);
  });

  return map;
};

const createDepositOverdueNotifications = async (targetUserIds = null) => {
  try {
    await ensureDepositItemSchema();
    await ensureCustomerSchema();
    const pendingItems = await DepositItem.findAll({
      include: [
        {
          model: Deposit,
          as: 'deposit',
          attributes: ['id', 'customerId', 'createdAt'],
          where: buildVisibleDepositWhere(),
          include: [{ model: Customer, as: 'customer', attributes: ['id', 'name', 'customerCode', 'phone', 'email'] }]
        }
      ]
    });

    const pendingIds = pendingItems.map(item => item.id).filter(Boolean);
    const returnedMap = new Map();
    if (pendingIds.length > 0) {
      const returnedRows = await DepositReturnItem.findAll({
        attributes: ['depositItemId', [sequelize.fn('SUM', sequelize.col('quantity')), 'returnedQty']],
        where: { depositItemId: { [Op.in]: pendingIds } },
        group: ['depositItemId']
      });
      returnedRows.forEach(row => {
        const qty = parseInt(row.get('returnedQty') || 0, 10) || 0;
        returnedMap.set(row.depositItemId, qty);
      });
    }

    const pendingByCustomer = new Map();
    (pendingItems || []).forEach((item) => {
      const returnedQty = returnedMap.get(item.id) || 0;
      const remainingQty = Math.max(0, parseInt(item.quantity || 0, 10) - returnedQty);
      if (remainingQty <= 0) return;
      const deposit = item.deposit;
      if (!deposit || !deposit.customerId) return;
      const customerId = deposit.customerId;
      const depositDate = new Date(deposit.createdAt);
      const entry = pendingByCustomer.get(customerId) || {
        customer: deposit.customer,
        customerId,
        pendingQuantity: 0,
        oldestDepositDate: depositDate,
        oldestDepositId: deposit.id,
        lastDepositDate: depositDate
      };

      entry.pendingQuantity += remainingQty;
      if (depositDate < entry.oldestDepositDate) {
        entry.oldestDepositDate = depositDate;
        entry.oldestDepositId = deposit.id;
      }
      if (depositDate > entry.lastDepositDate) {
        entry.lastDepositDate = depositDate;
      }
      if (!entry.customer && deposit.customer) {
        entry.customer = deposit.customer;
      }
      pendingByCustomer.set(customerId, entry);
    });

    const normalizeUserIds = (input) => (Array.isArray(input) ? input : [])
      .map((item) => (typeof item === 'object' ? item?.id : item))
      .filter(Boolean);

    let adminIds = normalizeUserIds(targetUserIds);
    if (adminIds.length === 0) {
      const admins = await User.findAll({
        where: { role: { [Op.in]: ['manager', 'super_admin'] }, isActive: true },
        attributes: ['id']
      });
      if (!admins.length) return;
      adminIds = admins.map((admin) => admin.id);
    }
    const existingNotifications = await Notification.findAll({
      where: { userId: { [Op.in]: adminIds } },
      order: [['createdAt', 'DESC']]
    });

    const existingDepositNotificationsByUser = new Map();
    const existingAlertKeyByUser = new Map();

    existingNotifications.forEach((notification) => {
      const meta = notification.meta || {};
      if (meta.kind !== 'deposit_overdue') return;
      const list = existingDepositNotificationsByUser.get(notification.userId) || [];
      list.push(notification);
      existingDepositNotificationsByUser.set(notification.userId, list);

      if (meta.alertKey) {
        const map = existingAlertKeyByUser.get(notification.userId) || new Map();
        map.set(meta.alertKey, notification);
        existingAlertKeyByUser.set(notification.userId, map);
      }
    });

    const now = new Date();
    // Update existing notifications status based on current pending data
    for (const [userId, list] of existingDepositNotificationsByUser.entries()) {
      for (const notification of list) {
        const meta = notification.meta || {};
        const customerId = meta.customerId;
        const entry = pendingByCustomer.get(customerId);
        if (!entry) {
          if (meta.status !== 'resolved') {
            const resolvedMeta = {
              ...meta,
              status: 'resolved',
              resolvedAt: now.toISOString()
            };
            await notification.update({ meta: resolvedMeta });
          }
          continue;
        }

        const monthsElapsed = calculateMonthsElapsed(entry.oldestDepositDate, now);
        const daysElapsed = Math.floor((now - entry.oldestDepositDate) / (1000 * 60 * 60 * 24));
        const customerLabel = buildCustomerLabel(entry.customer);
        const updatedMeta = {
          ...meta,
          customerId: entry.customerId,
          customerName: customerLabel,
          pendingQuantity: entry.pendingQuantity,
          monthsElapsed,
          daysElapsed,
          oldestDepositId: entry.oldestDepositId,
          oldestDepositDate: entry.oldestDepositDate.toISOString().slice(0, 10),
          lastDepositDate: entry.lastDepositDate ? entry.lastDepositDate.toISOString().slice(0, 10) : null,
          status: 'pending',
          resolvedAt: null
        };
        const updatedMessage = `Customer ${customerLabel} still has ${entry.pendingQuantity} cylinder(s) pending return.`;
        await notification.update({ meta: updatedMeta, message: updatedMessage });
      }
    }

    // Create new notifications per 3-month cycle
    for (const entry of pendingByCustomer.values()) {
      const monthsElapsed = calculateMonthsElapsed(entry.oldestDepositDate, now);
      if (monthsElapsed < 3) continue;

      const cycle = Math.floor(monthsElapsed / 3) * 3;
      if (cycle < 3) continue;

      const daysElapsed = Math.floor((now - entry.oldestDepositDate) / (1000 * 60 * 60 * 24));
      const customerLabel = buildCustomerLabel(entry.customer);
      const depositDateLabel = entry.oldestDepositDate.toISOString().slice(0, 10);
      const lastDepositLabel = entry.lastDepositDate ? entry.lastDepositDate.toISOString().slice(0, 10) : null;
      const alertKey = `${entry.customerId}:${cycle}`;
      const message = `Customer ${customerLabel} still has ${entry.pendingQuantity} cylinder(s) pending return.`;

      for (const adminId of adminIds) {
        const existingKeys = existingAlertKeyByUser.get(adminId);
        if (existingKeys && existingKeys.has(alertKey)) {
          continue;
        }

        await Notification.create({
          userId: adminId,
          type: 'stock_assigned',
          title: `Deposit Return Reminder (${cycle} month${cycle === 1 ? '' : 's'})`,
          message,
          meta: {
            kind: 'deposit_overdue',
            alertKey,
            thresholdMonths: cycle,
            customerId: entry.customerId,
            customerName: customerLabel,
            pendingQuantity: entry.pendingQuantity,
            monthsElapsed,
            daysElapsed,
            oldestDepositId: entry.oldestDepositId,
            oldestDepositDate: depositDateLabel,
            lastDepositDate: lastDepositLabel,
            status: 'pending'
          }
        });

        const updatedMap = existingAlertKeyByUser.get(adminId) || new Map();
        updatedMap.set(alertKey, true);
        existingAlertKeyByUser.set(adminId, updatedMap);
      }
    }
  } catch (error) {
    console.error('Deposit overdue notification error:', error);
  }
};

const getPendingCylinderSummary = async (req, res) => {
  try {
    await ensureDepositItemSchema();
    const limit = parseInt(req.query.limit || 0, 10) || 0;

    const pendingItems = await DepositItem.findAll({
      include: [
        {
          model: Deposit,
          as: 'deposit',
          attributes: ['id', 'customerId', 'createdAt'],
          where: buildVisibleDepositWhere(),
          include: [{ model: Customer, as: 'customer', attributes: ['id', 'name', 'customerCode', 'phone', 'email'] }]
        }
      ]
    });

    const pendingIds = pendingItems.map(item => item.id).filter(Boolean);
    const returnedMap = new Map();
    if (pendingIds.length > 0) {
      const returnedRows = await DepositReturnItem.findAll({
        attributes: ['depositItemId', [sequelize.fn('SUM', sequelize.col('quantity')), 'returnedQty']],
        where: { depositItemId: { [Op.in]: pendingIds } },
        group: ['depositItemId']
      });
      returnedRows.forEach(row => {
        const qty = parseInt(row.get('returnedQty') || 0, 10) || 0;
        returnedMap.set(row.depositItemId, qty);
      });
    }

    const pendingByCustomer = new Map();
    (pendingItems || []).forEach((item) => {
      const returnedQty = returnedMap.get(item.id) || 0;
      const remainingQty = Math.max(0, parseInt(item.quantity || 0, 10) - returnedQty);
      if (remainingQty <= 0) return;
      const deposit = item.deposit;
      if (!deposit || !deposit.customerId) return;
      const customerId = deposit.customerId;
      const depositDate = new Date(deposit.createdAt);
      const entry = pendingByCustomer.get(customerId) || {
        customer: deposit.customer,
        customerId,
        pendingQuantity: 0,
        lastDepositDate: depositDate
      };

      entry.pendingQuantity += remainingQty;
      if (depositDate > entry.lastDepositDate) {
        entry.lastDepositDate = depositDate;
      }
      if (!entry.customer && deposit.customer) {
        entry.customer = deposit.customer;
      }
      pendingByCustomer.set(customerId, entry);
    });

    let data = Array.from(pendingByCustomer.values()).map(entry => ({
      customerId: entry.customerId,
      customerName: buildCustomerLabel(entry.customer),
      pendingQuantity: entry.pendingQuantity,
      lastDepositDate: entry.lastDepositDate ? entry.lastDepositDate.toISOString() : null
    }));

    data.sort((a, b) => {
      if (b.pendingQuantity !== a.pendingQuantity) {
        return b.pendingQuantity - a.pendingQuantity;
      }
      return new Date(b.lastDepositDate || 0) - new Date(a.lastDepositDate || 0);
    });

    if (limit > 0) {
      data = data.slice(0, limit);
    }

    res.json({ success: true, data });
  } catch (err) {
    console.error('Pending cylinder summary error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch pending cylinder summary' });
  }
};

async function getEmptyProducts(req, res) {
  try {
    if (req.user?.role === 'employee') {
      const availability = await buildEmployeeEmptyAvailability(req.user.id);
      const availableProductIds = Array.from(availability.entries())
        .filter(([, qty]) => (parseInt(qty, 10) || 0) > 0)
        .map(([productId]) => productId);

      if (availableProductIds.length === 0) {
        return res.json({ success: true, data: [] });
      }

      const products = await Product.findAll({
        where: { id: { [Op.in]: availableProductIds } },
        attributes: ['id', 'productName', 'leastSellingPrice']
      });
      const productMap = new Map(products.map((p) => [p.id, p]));

      const data = availableProductIds.map((productId) => {
        const product = productMap.get(productId);
        const qty = parseInt(availability.get(productId), 10) || 0;
        return {
          productId,
          productName: product?.productName || '',
          inventoryItemId: null,
          stockQuantity: qty,
          defaultPrice: product ? product.leastSellingPrice : 0
        };
      });

      return res.json({ success: true, data });
    }

    const invs = await InventoryItem.findAll({
      where: { inventoryCategory: 'Empty Cylinder', stockQuantity: { [Op.gt]: 0 } },
      include: [{ model: Product, as: 'product' }]
    });

    const products = invs.map(i => ({
      productId: i.productId,
      productName: i.product ? i.product.productName : undefined,
      inventoryItemId: i.id,
      stockQuantity: i.stockQuantity,
      defaultPrice: i.product ? i.product.leastSellingPrice : 0
    }));

    res.json({ success: true, data: products });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Failed to fetch empty products' });
  }
}

async function createDeposit(req, res) {
  try {
    await ensureDepositSchema();
    await ensureDepositItemSchema();
  } catch (err) {
    console.error('Deposit schema check failed:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to prepare deposit schema',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }

  const t = await sequelize.transaction();
  try {
    const {
      customerId,
      employeeId,
      paymentType,
      bankName,
      checkNumber,
      items,
      customerSignature,
      receivedByName,
      notes,
      employeeSignature
    } = req.body;
    if (!customerId || !items || !Array.isArray(items) || items.length === 0) {
      await t.rollback();
      return res.status(400).json({ success: false, message: 'Invalid payload' });
    }

    const rateMap = await buildCustomerRateMap(customerId, t);
    const productIds = items.map(it => it.productId).filter(Boolean);
    const products = productIds.length > 0
      ? await Product.findAll({ where: { id: productIds }, transaction: t, attributes: ['id', 'leastSellingPrice'] })
      : [];
    const productMap = new Map(products.map(p => [p.id, p]));

    const normalizedItems = [];
    let total = 0;

    for (const it of items) {
      const quantity = parseInt(it.quantity || 0, 10);
      const productId = it.productId;
      if (!productId || !quantity || quantity <= 0) {
        await t.rollback();
        return res.status(400).json({ success: false, message: 'Invalid product or quantity' });
      }

      const minRate = rateMap.get(productId);
      let price = parseFloat(it.price);
      if (!Number.isFinite(price) || price <= 0) {
        if (minRate) {
          price = minRate;
        } else if (productMap.has(productId)) {
          price = parseFloat(productMap.get(productId).leastSellingPrice);
        }
      }

      if (minRate && Number.isFinite(price) && price < minRate) {
        await t.rollback();
        return res.status(400).json({
          success: false,
          message: `Fixed rate for this customer is AED ${minRate.toFixed(2)}. Price cannot be lower.`
        });
      }

      if (!Number.isFinite(price) || price <= 0) {
        await t.rollback();
        return res.status(400).json({ success: false, message: 'Invalid price' });
      }

      const normalizedPrice = parseFloat(price.toFixed(2));
      total += normalizedPrice * quantity;
      normalizedItems.push({ ...it, productId, quantity, price: normalizedPrice });
    }

    const invoiceNumber = await getNextDepositInvoiceNumber(t);

    const preparedByUser = req.user || null;
    const isAuthorizedRole = preparedByUser && ['manager', 'super_admin'].includes(preparedByUser.role);
    const preparedById = preparedByUser?.id || employeeId || null;
    const preparedBySignature = preparedByUser?.signature || employeeSignature || null;
    const authorizedBySignature = isAuthorizedRole ? (preparedByUser?.signature || null) : null;
    const authorizedByName = isAuthorizedRole ? (preparedByUser?.fullName || preparedByUser?.username || null) : null;
    const authorizedById = isAuthorizedRole ? preparedByUser?.id : null;

    if (preparedByUser?.role === 'employee') {
      const availability = await buildEmployeeEmptyAvailability(preparedById, { transaction: t });
      const remaining = new Map(availability);
      for (const it of normalizedItems) {
        const available = remaining.get(it.productId) || 0;
        const qty = parseInt(it.quantity || 0, 10) || 0;
        if (qty > available) {
          await t.rollback();
          return res.status(400).json({
            success: false,
            message: `Insufficient assigned empty stock. Available: ${available}`
          });
        }
        remaining.set(it.productId, Math.max(0, available - qty));
      }
    }

    const deposit = await Deposit.create({
      customerId,
      employeeId: preparedById,
      paymentType,
      bankName,
      checkNumber,
      totalAmount: total,
      customerSignature,
      receivedByName,
      notes,
      employeeSignature: preparedBySignature,
      authorizedBySignature,
      authorizedByName,
      authorizedById,
      invoiceNumber
    }, { transaction: t });

    // For each item, create DepositItem and decrement inventory (Empty Cylinder)
    for (const it of normalizedItems) {
      const quantity = parseInt(it.quantity || 0);
      const price = parseFloat(it.price || 0).toFixed(2);

      const amount = (quantity * parseFloat(price)).toFixed(2);

      await DepositItem.create({ depositId: deposit.id, productId: it.productId, quantity, price, amount }, { transaction: t });

      // Find inventory item for empty cylinder
      const inv = await InventoryItem.findOne({ where: { productId: it.productId, inventoryCategory: 'Empty Cylinder' } });
      if (!inv) {
        await t.rollback();
        return res.status(400).json({ success: false, message: 'No empty inventory for product' });
      }

      if (inv.stockQuantity < quantity) {
        await t.rollback();
        return res.status(400).json({ success: false, message: `Insufficient empty cylinders for product ${it.productId}` });
      }

      const beforeQty = inv.stockQuantity || 0;
      const afterQty = beforeQty - quantity;
      inv.stockQuantity = afterQty;
      await inv.save({ transaction: t });
      await logInventoryMutation({
        inventoryItem: inv,
        quantityBefore: beforeQty,
        quantityAfter: afterQty,
        sourceModule: 'deposit',
        sourceAction: 'create',
        sourceId: deposit.id,
        sourceRef: deposit.invoiceNumber,
        actorUserId: req.user?.id,
        notes: 'Deposit created, empty cylinders reserved'
      }, t);
    }

    await t.commit();
    await rebuildDailyStockForDateValue(
      deposit.createdAt,
      `deposit create ${deposit.invoiceNumber || deposit.id || ''}`.trim()
    );

    res.json({ success: true, data: { depositId: deposit.id } });
  } catch (err) {
    console.error(err);
    await t.rollback();
    res.status(500).json({
      success: false,
      message: 'Failed to create deposit',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
}

async function getCustomerDeposits(req, res) {
  try {
    const { customerId } = req.params;
    if (!customerId) return res.status(400).json({ success: false, message: 'Missing customerId' });

    await ensureDepositSchema();
    await ensureDepositItemSchema();

    const deposits = await Deposit.findAll({
      where: buildVisibleDepositWhere({ customerId }),
      include: [{ model: DepositItem, as: 'items', required: false, include: [{ model: Product, as: 'product' }] }],
      order: [['createdAt', 'DESC']]
    });

    const allItemIds = (deposits || []).flatMap(dep => (dep.items || []).map(it => it.id)).filter(Boolean);
    const returnedMap = new Map();
    if (allItemIds.length > 0) {
      const returnedRows = await DepositReturnItem.findAll({
        attributes: ['depositItemId', [sequelize.fn('SUM', sequelize.col('quantity')), 'returnedQty']],
        where: { depositItemId: { [Op.in]: allItemIds } },
        group: ['depositItemId']
      });
      returnedRows.forEach(row => {
        const qty = parseInt(row.get('returnedQty') || 0, 10) || 0;
        returnedMap.set(row.depositItemId, qty);
      });
    }

    const mapped = (deposits || []).map(dep => {
      const items = (dep.items || []).map(it => {
        const qty = parseInt(it.quantity || 0, 10);
        const returnedQty = returnedMap.get(it.id) || 0;
        const remainingQty = Math.max(0, qty - returnedQty);
        return {
          id: it.id,
          productId: it.productId,
          productName: it.product?.productName || '',
          quantity: qty,
          returnedQuantity: returnedQty,
          remainingQuantity: remainingQty
        };
      }).filter(it => it.remainingQuantity > 0);

      return {
        id: dep.id,
        invoiceNumber: dep.invoiceNumber || dep.id,
        customerId: dep.customerId,
        createdAt: dep.createdAt,
        items
      };
    }).filter(dep => dep.items.length > 0);

    res.json({ success: true, data: mapped });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Failed to fetch deposits' });
  }
}

async function getAllDeposits(req, res) {
  try {
    await ensureDepositSchema();
    await createDepositOverdueNotifications();
    const where = req.user?.role === 'employee'
      ? buildVisibleDepositWhere({ employeeId: req.user.id })
      : buildVisibleDepositWhere();
    const deposits = await Deposit.findAll({
      where,
      include: [
        { model: DepositItem, as: 'items', include: [{ model: Product, as: 'product' }] },
        { model: Customer, as: 'customer' },
        { model: User, as: 'employee', attributes: ['id', 'fullName', 'email', 'signature', 'role'] }
      ],
      order: [['createdAt', 'DESC']]
    });
    res.json({ success: true, data: deposits });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Failed to fetch deposits' });
  }
}

async function getAllReturns(req, res) {
  try {
    await ensureDepositReturnSchema();
    const where = {};
    if (req.user?.role === 'employee') {
      where.employeeId = req.user.id;
    }
    const returns = await DepositReturn.findAll({
      where,
      include: [
        { model: Customer, as: 'customer' },
        { model: User, as: 'employee', attributes: ['id', 'fullName', 'email', 'signature', 'role'] },
        {
          model: DepositReturnItem,
          as: 'items',
          include: [
            { model: Deposit, as: 'deposit', attributes: ['id', 'invoiceNumber'] },
            { model: DepositItem, as: 'depositItem', attributes: ['id', 'price'] },
            { model: Product, as: 'product', attributes: ['id', 'productName'] }
          ]
        }
      ],
      order: [['createdAt', 'DESC']]
    });
    res.json({ success: true, data: returns });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Failed to fetch returns' });
  }
}

async function getLastDeposit(req, res) {
  try {
    await ensureDepositSchema();
    const deposit = await Deposit.findOne({
      where: buildVisibleDepositWhere(),
      include: [
        { model: DepositItem, as: 'items', include: [{ model: Product, as: 'product' }] },
        { model: Customer, as: 'customer' },
        { model: User, as: 'employee', attributes: ['id', 'fullName', 'email', 'signature', 'role'] }
      ],
      order: [['createdAt', 'DESC']]
    });
    if (!deposit) return res.status(404).json({ success: false, message: 'No deposits found' });
    res.json({ success: true, data: deposit });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Failed to fetch last deposit' });
  }
}

async function returnDepositItems(req, res) {
  const t = await sequelize.transaction();
  try {
    await ensureDepositSchema();
    await ensureDepositItemSchema();
    await ensureDepositReturnSchema();

    const { customerId, employeeId, items, customerSignature, receivedByName, notes, employeeSignature } = req.body;
    if (!customerId) {
      await t.rollback();
      return res.status(400).json({ success: false, message: 'Customer is required' });
    }
    if (!items || !Array.isArray(items) || items.length === 0) {
      await t.rollback();
      return res.status(400).json({ success: false, message: 'Invalid payload' });
    }

    const returnNumber = await getNextReturnNumber(t);

    const preparedByUser = req.user || null;
    const isAuthorizedRole = preparedByUser && ['manager', 'super_admin'].includes(preparedByUser.role);
    const preparedById = preparedByUser?.id || employeeId || null;
    const preparedBySignature = preparedByUser?.signature || employeeSignature || null;
    const authorizedBySignature = isAuthorizedRole ? (preparedByUser?.signature || null) : null;
    const authorizedByName = isAuthorizedRole ? (preparedByUser?.fullName || preparedByUser?.username || null) : null;
    const authorizedById = isAuthorizedRole ? preparedByUser?.id : null;

    const depositReturn = await DepositReturn.create({
      returnNumber,
      customerId,
      employeeId: preparedById,
      customerSignature: customerSignature || null,
      employeeSignature: preparedBySignature,
      authorizedBySignature,
      authorizedByName,
      authorizedById,
      receivedByName,
      notes,
      totalQuantity: 0
    }, { transaction: t });

    const itemsToProcess = [];
    const manualItems = [];
    for (const rawItem of items) {
      const qty = parseInt(rawItem.quantity || 0, 10) || 0;
      const depositItemId = rawItem.depositItemId || rawItem.itemId || rawItem.id;
      if (depositItemId) {
        itemsToProcess.push({ depositItemId: String(depositItemId), quantity: qty });
        continue;
      }
      if (rawItem.productId) {
        manualItems.push({ productId: rawItem.productId, quantity: qty });
        continue;
      }
      await t.rollback();
      return res.status(400).json({ success: false, message: 'Invalid return items' });
    }

    if (manualItems.length > 0) {
      const hasInvalidManualItem = manualItems.some((item) => !item.productId || item.quantity <= 0);
      if (hasInvalidManualItem) {
        await t.rollback();
        return res.status(400).json({ success: false, message: 'Invalid manual return items' });
      }

      const seedDeposit = await createManualSeedDepositForReturn({
        transaction: t,
        depositReturnId: depositReturn.id,
        customerId,
        preparedById,
        preparedBySignature,
        authorizedBySignature,
        authorizedByName,
        authorizedById,
        items: manualItems
      });

      (seedDeposit.items || []).forEach((item) => {
        itemsToProcess.push({
          depositItemId: item.id,
          quantity: parseInt(item.quantity || 0, 10) || 0
        });
      });
    }

    if (itemsToProcess.length === 0) {
      await t.rollback();
      return res.status(400).json({ success: false, message: 'Invalid payload' });
    }

    let totalQty = 0;
    const pendingReturnByItem = new Map();

    for (const it of itemsToProcess) {
      const id = it.depositItemId;
      const qty = parseInt(it.quantity || 0, 10);
      if (!id || qty <= 0) {
        await t.rollback();
        return res.status(400).json({ success: false, message: 'Invalid return items' });
      }

      const item = await DepositItem.findByPk(id, { transaction: t });
      if (!item) {
        await t.rollback();
        return res.status(404).json({ success: false, message: `Deposit item ${id} not found` });
      }
      const parentDeposit = await Deposit.findByPk(item.depositId, { transaction: t });
      if (!parentDeposit || parentDeposit.customerId !== customerId) {
        await t.rollback();
        return res.status(400).json({ success: false, message: 'Item does not belong to selected customer' });
      }

      const itemQty = parseInt(item.quantity || 0, 10);
      const prevReturned = await DepositReturnItem.sum('quantity', { where: { depositItemId: item.id }, transaction: t });
      const returnedQty = parseInt(prevReturned || 0, 10) || 0;
      const alreadyPending = pendingReturnByItem.get(item.id) || 0;
      const remainingQty = Math.max(0, itemQty - returnedQty - alreadyPending);
      if (qty > remainingQty) {
        await t.rollback();
        return res.status(400).json({ success: false, message: `Return quantity exceeds remaining for item ${id}` });
      }
      pendingReturnByItem.set(item.id, alreadyPending + qty);

      totalQty += qty;

      // increment inventory empty cylinder
      const inv = await InventoryItem.findOne({ where: { productId: item.productId, inventoryCategory: 'Empty Cylinder' }, transaction: t });
      if (inv) {
        const beforeQty = inv.stockQuantity || 0;
        const afterQty = beforeQty + qty;
        inv.stockQuantity = afterQty;
        await inv.save({ transaction: t });
        await logInventoryMutation({
          inventoryItem: inv,
          quantityBefore: beforeQty,
          quantityAfter: afterQty,
          sourceModule: 'deposit',
          sourceAction: 'return_create',
          sourceId: depositReturn.id,
          sourceRef: depositReturn.returnNumber,
          actorUserId: req.user?.id,
          notes: 'Deposit return received'
        }, t);
      }

      await DepositReturnItem.create({
        depositReturnId: depositReturn.id,
        depositId: item.depositId,
        depositItemId: item.id,
        productId: item.productId,
        quantity: qty
      }, { transaction: t });
    }

    await depositReturn.update({ totalQuantity: totalQty }, { transaction: t });

    await t.commit();
    await rebuildDailyStockForDateValue(
      depositReturn.createdAt,
      `deposit return create ${depositReturn.returnNumber || depositReturn.id || ''}`.trim()
    );
    res.json({ success: true, data: { returnId: depositReturn.id, returnNumber } });
  } catch (err) {
    console.error(err);
    await t.rollback();
    res.status(500).json({ success: false, message: 'Failed to process return' });
  }
}

async function updateDepositReturn(req, res) {
  if (req.user?.role !== 'super_admin') {
    return res.status(403).json({ success: false, message: 'Only Super Admin can edit return invoices' });
  }
  const t = await sequelize.transaction();
  try {
    await ensureDepositSchema();
    await ensureDepositItemSchema();
    await ensureDepositReturnSchema();

    const { returnId } = req.params;
    const { items, customerSignature, receivedByName, notes } = req.body || {};

    if (!returnId) {
      await t.rollback();
      return res.status(400).json({ success: false, message: 'Missing returnId' });
    }
    if (!items || !Array.isArray(items) || items.length === 0) {
      await t.rollback();
      return res.status(400).json({ success: false, message: 'Invalid payload' });
    }

    const depositReturn = await DepositReturn.findByPk(returnId, { transaction: t });
    if (!depositReturn) {
      await t.rollback();
      return res.status(404).json({ success: false, message: 'Return invoice not found' });
    }

    const existingItems = await DepositReturnItem.findAll({
      where: { depositReturnId: returnId },
      transaction: t
    });
    const existingMap = new Map(existingItems.map(it => [it.depositItemId, it]));
    const newQtyMap = new Map();
    const depositItemCache = new Map();
    const parentDepositCache = new Map();

    const getParentDeposit = async (depositItem) => {
      if (!depositItem?.depositId) return null;
      if (parentDepositCache.has(depositItem.depositId)) {
        return parentDepositCache.get(depositItem.depositId);
      }
      const deposit = await Deposit.findByPk(depositItem.depositId, { transaction: t });
      parentDepositCache.set(depositItem.depositId, deposit);
      return deposit;
    };

    for (const it of items) {
      const id = it.depositItemId || it.itemId || it.id;
      const qty = parseInt(it.quantity || 0, 10);
      if (!id || qty <= 0) {
        await t.rollback();
        return res.status(400).json({ success: false, message: 'Invalid return items' });
      }
      if (newQtyMap.has(id)) {
        await t.rollback();
        return res.status(400).json({ success: false, message: 'Duplicate return items are not allowed' });
      }
      newQtyMap.set(id, qty);

      let depositItem = depositItemCache.get(id);
      if (!depositItem) {
        depositItem = await DepositItem.findByPk(id, { transaction: t });
        depositItemCache.set(id, depositItem);
      }
      if (!depositItem) {
        await t.rollback();
        return res.status(404).json({ success: false, message: `Deposit item ${id} not found` });
      }

      const parentDeposit = await getParentDeposit(depositItem);
      if (!parentDeposit || parentDeposit.customerId !== depositReturn.customerId) {
        await t.rollback();
        return res.status(400).json({ success: false, message: 'Item does not belong to selected customer' });
      }

      if (isManualReturnSeedDeposit(parentDeposit, returnId)) {
        continue;
      }

      const itemQty = parseInt(depositItem.quantity || 0, 10);
      const returnedOther = await DepositReturnItem.sum('quantity', {
        where: { depositItemId: id, depositReturnId: { [Op.ne]: returnId } },
        transaction: t
      });
      const returnedOtherQty = parseInt(returnedOther || 0, 10) || 0;
      const remainingQty = Math.max(0, itemQty - returnedOtherQty);
      if (qty > remainingQty) {
        await t.rollback();
        return res.status(400).json({ success: false, message: `Return quantity exceeds remaining for item ${id}` });
      }
    }

    const allIds = new Set([...existingMap.keys(), ...newQtyMap.keys()]);
    for (const id of allIds) {
      const oldQty = existingMap.get(id)?.quantity || 0;
      const newQty = newQtyMap.get(id) || 0;
      const delta = newQty - oldQty;
      if (delta === 0) continue;

      let depositItem = depositItemCache.get(id);
      if (!depositItem) {
        depositItem = await DepositItem.findByPk(id, { transaction: t });
        depositItemCache.set(id, depositItem);
      }
      if (!depositItem) {
        await t.rollback();
        return res.status(404).json({ success: false, message: `Deposit item ${id} not found` });
      }

      const parentDeposit = await getParentDeposit(depositItem);
      if (newQty > 0 && isManualReturnSeedDeposit(parentDeposit, returnId)) {
        depositItem.quantity = newQty;
        depositItem.price = 0;
        depositItem.amount = 0;
        await depositItem.save({ transaction: t });
      }

      const inv = await InventoryItem.findOne({
        where: { productId: depositItem.productId, inventoryCategory: 'Empty Cylinder' },
        transaction: t
      });
      if (!inv) {
        await t.rollback();
        return res.status(400).json({ success: false, message: 'No empty inventory for product' });
      }
      if (delta < 0 && (inv.stockQuantity || 0) < Math.abs(delta)) {
        await t.rollback();
        return res.status(400).json({ success: false, message: 'Insufficient empty cylinders to reduce return quantity' });
      }
      const beforeQty = inv.stockQuantity || 0;
      const afterQty = beforeQty + delta;
      inv.stockQuantity = afterQty;
      await inv.save({ transaction: t });
      await logInventoryMutation({
        inventoryItem: inv,
        quantityBefore: beforeQty,
        quantityAfter: afterQty,
        sourceModule: 'deposit',
        sourceAction: 'return_update',
        sourceId: depositReturn.id,
        sourceRef: depositReturn.returnNumber,
        actorUserId: req.user?.id,
        notes: 'Deposit return updated'
      }, t);
    }

    await DepositReturnItem.destroy({ where: { depositReturnId: returnId }, transaction: t });

    const manualSeedDepositIds = new Set();
    for (const id of allIds) {
      const depositItem = depositItemCache.get(id) || await DepositItem.findByPk(id, { transaction: t });
      if (!depositItem) continue;
      const parentDeposit = await getParentDeposit(depositItem);
      if (!isManualReturnSeedDeposit(parentDeposit, returnId)) continue;
      manualSeedDepositIds.add(parentDeposit.id);

      const nextQty = newQtyMap.get(id) || 0;
      if (nextQty > 0) {
        depositItem.quantity = nextQty;
        depositItem.price = 0;
        depositItem.amount = 0;
        await depositItem.save({ transaction: t });
      } else {
        await DepositItem.destroy({ where: { id: depositItem.id }, transaction: t });
      }
    }

    for (const [id, qty] of newQtyMap.entries()) {
      if (!qty || qty <= 0) continue;
      const depositItem = depositItemCache.get(id) || await DepositItem.findByPk(id, { transaction: t });
      if (!depositItem) {
        await t.rollback();
        return res.status(404).json({ success: false, message: `Deposit item ${id} not found` });
      }
      await DepositReturnItem.create({
        depositReturnId: returnId,
        depositId: depositItem.depositId,
        depositItemId: depositItem.id,
        productId: depositItem.productId,
        quantity: qty
      }, { transaction: t });
    }

    for (const depositId of manualSeedDepositIds) {
      const remainingSeedItems = await DepositItem.count({ where: { depositId }, transaction: t });
      if (remainingSeedItems === 0) {
        await Deposit.destroy({ where: { id: depositId }, transaction: t });
      }
    }

    depositReturn.totalQuantity = Array.from(newQtyMap.values()).reduce((sum, qty) => sum + qty, 0);
    if (customerSignature != null) {
      depositReturn.customerSignature = customerSignature;
    }
    if (receivedByName != null) {
      depositReturn.receivedByName = receivedByName;
    }
    if (notes != null) {
      depositReturn.notes = notes;
    }

    const actingUser = req.user || null;
    const canAuthorize = actingUser && ['manager', 'super_admin'].includes(actingUser.role);
    if (canAuthorize) {
      if (!depositReturn.authorizedBySignature && actingUser.signature) {
        depositReturn.authorizedBySignature = actingUser.signature;
      }
      if (!depositReturn.authorizedByName) {
        depositReturn.authorizedByName = actingUser.fullName || actingUser.username || depositReturn.authorizedByName;
      }
      if (!depositReturn.authorizedById) {
        depositReturn.authorizedById = actingUser.id;
      }
    }
    if (!depositReturn.employeeSignature && actingUser?.signature) {
      depositReturn.employeeSignature = actingUser.signature;
    }
    await depositReturn.save({ transaction: t });

    await t.commit();
    await rebuildDailyStockForDateValue(
      depositReturn.createdAt,
      `deposit return update ${depositReturn.returnNumber || depositReturn.id || ''}`.trim()
    );
    res.json({ success: true, data: { returnId } });
  } catch (err) {
    console.error(err);
    await t.rollback();
    res.status(500).json({ success: false, message: 'Failed to update return' });
  }
}

async function deleteDepositReturn(req, res) {
  if (req.user?.role !== 'super_admin') {
    return res.status(403).json({ success: false, message: 'Only Super Admin can delete return invoices' });
  }
  const t = await sequelize.transaction();
  try {
    await ensureDepositSchema();
    await ensureDepositItemSchema();
    await ensureDepositReturnSchema();

    const { returnId } = req.params;
    if (!returnId) {
      await t.rollback();
      return res.status(400).json({ success: false, message: 'Missing returnId' });
    }

    const depositReturn = await DepositReturn.findByPk(returnId, { transaction: t });
    if (!depositReturn) {
      await t.rollback();
      return res.status(404).json({ success: false, message: 'Return invoice not found' });
    }

    const returnItems = await DepositReturnItem.findAll({
      where: { depositReturnId: returnId },
      include: [{
        model: Deposit,
        as: 'deposit',
        attributes: ['id', 'sourceType', 'sourceReferenceId']
      }],
      transaction: t
    });
    const manualSeedDepositIds = new Set();

    for (const item of returnItems) {
      const qty = parseInt(item.quantity || 0, 10);
      if (!qty) continue;
      if (isManualReturnSeedDeposit(item.deposit, returnId)) {
        manualSeedDepositIds.add(item.depositId);
      }
      const inv = await InventoryItem.findOne({
        where: { productId: item.productId, inventoryCategory: 'Empty Cylinder' },
        transaction: t
      });
      if (!inv) {
        await t.rollback();
        return res.status(400).json({ success: false, message: 'No empty inventory for product' });
      }
      if ((inv.stockQuantity || 0) < qty) {
        await t.rollback();
        return res.status(400).json({ success: false, message: 'Insufficient empty cylinders to delete return' });
      }
      const beforeQty = inv.stockQuantity || 0;
      const afterQty = beforeQty - qty;
      inv.stockQuantity = afterQty;
      await inv.save({ transaction: t });
      await logInventoryMutation({
        inventoryItem: inv,
        quantityBefore: beforeQty,
        quantityAfter: afterQty,
        sourceModule: 'deposit',
        sourceAction: 'return_delete',
        sourceId: depositReturn.id,
        sourceRef: depositReturn.returnNumber,
        actorUserId: req.user?.id,
        notes: 'Deposit return deleted'
      }, t);
    }

    await DepositReturnItem.destroy({ where: { depositReturnId: returnId }, transaction: t });
    await DepositReturn.destroy({ where: { id: returnId }, transaction: t });
    for (const depositId of manualSeedDepositIds) {
      await DepositItem.destroy({ where: { depositId }, transaction: t });
      await Deposit.destroy({ where: { id: depositId }, transaction: t });
    }

    await t.commit();
    await rebuildDailyStockForDateValue(
      depositReturn.createdAt,
      `deposit return delete ${depositReturn.returnNumber || depositReturn.id || ''}`.trim()
    );
    res.json({ success: true, data: { returnId } });
  } catch (err) {
    console.error(err);
    await t.rollback();
    res.status(500).json({ success: false, message: 'Failed to delete return' });
  }
}

async function updateDepositItem(req, res) {
  if (req.user?.role !== 'super_admin') {
    return res.status(403).json({ success: false, message: 'Only Super Admin can edit deposit invoices' });
  }
  const t = await sequelize.transaction();
  try {
    await ensureDepositSchema();
    await ensureDepositItemSchema();

    const { depositId, itemId } = req.params;
    const { customerId, productId, quantity, price } = req.body || {};

    if (!depositId || !itemId) {
      await t.rollback();
      return res.status(400).json({ success: false, message: 'Missing depositId or itemId' });
    }

    const deposit = await Deposit.findByPk(depositId, { transaction: t });
    if (!deposit) {
      await t.rollback();
      return res.status(404).json({ success: false, message: 'Deposit not found' });
    }
    const depositOwner = deposit.employeeId
      ? await User.findByPk(deposit.employeeId, { attributes: ['id', 'role', 'fullName'], transaction: t })
      : null;
    const isEmployeeOwnedDeposit = depositOwner?.role === 'employee';

    const item = await DepositItem.findOne({ where: { id: itemId, depositId }, transaction: t });
    if (!item) {
      await t.rollback();
      return res.status(404).json({ success: false, message: 'Deposit item not found' });
    }

    const oldQty = parseInt(item.quantity || 0, 10);
    const returnedQty = await DepositReturnItem.sum('quantity', { where: { depositItemId: item.id }, transaction: t }) || 0;

    if (returnedQty > 0) {
      await t.rollback();
      return res.status(400).json({ success: false, message: 'Returned items cannot be edited' });
    }

    const newQty = quantity != null ? parseInt(quantity || 0, 10) : oldQty;
    const newProductId = productId || item.productId;
    const parsedPrice = price != null ? parseFloat(price) : parseFloat(item.price || 0);
    const effectiveCustomerId = customerId || deposit.customerId;
    const rateMap = await buildCustomerRateMap(effectiveCustomerId, t);
    const minRate = rateMap.get(newProductId);

    if (!newProductId) {
      await t.rollback();
      return res.status(400).json({ success: false, message: 'Product is required' });
    }
    if (!newQty || newQty <= 0) {
      await t.rollback();
      return res.status(400).json({ success: false, message: 'Quantity must be at least 1' });
    }
    if (Number.isNaN(parsedPrice)) {
      await t.rollback();
      return res.status(400).json({ success: false, message: 'Invalid price' });
    }
    if (minRate && parsedPrice < minRate) {
      await t.rollback();
      return res.status(400).json({
        success: false,
        message: `Fixed rate for this customer is AED ${minRate.toFixed(2)}. Price cannot be lower.`
      });
    }

    if (isEmployeeOwnedDeposit) {
      const availability = await buildEmployeeEmptyAvailability(depositOwner.id, {
        excludeDepositItemId: item.id,
        transaction: t
      });
      const available = availability.get(newProductId) || 0;
      if (newQty > available) {
        await t.rollback();
        return res.status(400).json({
          success: false,
          message: `Insufficient assigned empty stock for ${depositOwner.fullName || 'employee'}. Available: ${available}`
        });
      }
    }

    // Update inventory for empty cylinders
    const oldProductId = item.productId;
    const oldInv = await InventoryItem.findOne({
      where: { productId: oldProductId, inventoryCategory: 'Empty Cylinder' },
      transaction: t
    });
    if (!oldInv) {
      await t.rollback();
      return res.status(400).json({ success: false, message: 'No empty inventory for existing product' });
    }

    if (newProductId !== oldProductId) {
      const newInv = await InventoryItem.findOne({
        where: { productId: newProductId, inventoryCategory: 'Empty Cylinder' },
        transaction: t
      });
      if (!newInv) {
        await t.rollback();
        return res.status(400).json({ success: false, message: 'No empty inventory for new product' });
      }

      // restore old qty to old inventory
      const oldBefore = oldInv.stockQuantity || 0;
      const oldAfter = oldBefore + oldQty;
      oldInv.stockQuantity = oldAfter;

      // reserve new qty from new inventory
      if ((newInv.stockQuantity || 0) < newQty) {
        await t.rollback();
        return res.status(400).json({ success: false, message: 'Insufficient empty cylinders for selected product' });
      }
      const newBefore = newInv.stockQuantity || 0;
      const newAfter = newBefore - newQty;
      newInv.stockQuantity = newAfter;

      await oldInv.save({ transaction: t });
      await newInv.save({ transaction: t });

      await logInventoryMutation({
        inventoryItem: oldInv,
        quantityBefore: oldBefore,
        quantityAfter: oldAfter,
        sourceModule: 'deposit',
        sourceAction: 'item_update',
        sourceId: deposit.id,
        sourceRef: deposit.invoiceNumber,
        actorUserId: req.user?.id,
        notes: 'Deposit item product changed (restore old)'
      }, t);

      await logInventoryMutation({
        inventoryItem: newInv,
        quantityBefore: newBefore,
        quantityAfter: newAfter,
        sourceModule: 'deposit',
        sourceAction: 'item_update',
        sourceId: deposit.id,
        sourceRef: deposit.invoiceNumber,
        actorUserId: req.user?.id,
        notes: 'Deposit item product changed (reserve new)'
      }, t);
    } else {
      const delta = newQty - oldQty;
      if (delta > 0 && (oldInv.stockQuantity || 0) < delta) {
        await t.rollback();
        return res.status(400).json({ success: false, message: 'Insufficient empty cylinders for quantity update' });
      }
      const beforeQty = oldInv.stockQuantity || 0;
      const afterQty = beforeQty - delta;
      oldInv.stockQuantity = afterQty;
      await oldInv.save({ transaction: t });
      await logInventoryMutation({
        inventoryItem: oldInv,
        quantityBefore: beforeQty,
        quantityAfter: afterQty,
        sourceModule: 'deposit',
        sourceAction: 'item_update',
        sourceId: deposit.id,
        sourceRef: deposit.invoiceNumber,
        actorUserId: req.user?.id,
        notes: 'Deposit item quantity updated'
      }, t);
    }

    item.productId = newProductId;
    item.quantity = newQty;
    item.price = parseFloat(parsedPrice.toFixed(2)).toFixed(2);
    item.amount = parseFloat((newQty * parseFloat(item.price)).toFixed(2)).toFixed(2);
    await item.save({ transaction: t });

    if (customerId && customerId !== deposit.customerId) {
      deposit.customerId = customerId;
    }

    const items = await DepositItem.findAll({ where: { depositId }, transaction: t });
    const total = items.reduce((sum, it) => {
      const amt = it.amount != null ? parseFloat(it.amount || 0) : (parseFloat(it.price || 0) * parseInt(it.quantity || 0, 10));
      return sum + (Number.isNaN(amt) ? 0 : amt);
    }, 0);
    deposit.totalAmount = parseFloat(total.toFixed(2)).toFixed(2);
    await deposit.save({ transaction: t });

    await t.commit();
    await rebuildDailyStockForDateValue(
      deposit.createdAt,
      `deposit item update ${deposit.invoiceNumber || deposit.id || ''}`.trim()
    );
    res.json({ success: true, data: { depositId, itemId } });
  } catch (err) {
    console.error(err);
    await t.rollback();
    res.status(500).json({ success: false, message: 'Failed to update deposit item' });
  }
}

async function deleteDepositItem(req, res) {
  if (req.user?.role !== 'super_admin') {
    return res.status(403).json({ success: false, message: 'Only Super Admin can delete deposit invoices' });
  }
  const t = await sequelize.transaction();
  try {
    await ensureDepositSchema();
    await ensureDepositItemSchema();

    const { depositId, itemId } = req.params;
    if (!depositId || !itemId) {
      await t.rollback();
      return res.status(400).json({ success: false, message: 'Missing depositId or itemId' });
    }

    const deposit = await Deposit.findByPk(depositId, { transaction: t });
    if (!deposit) {
      await t.rollback();
      return res.status(404).json({ success: false, message: 'Deposit not found' });
    }

    const item = await DepositItem.findOne({ where: { id: itemId, depositId }, transaction: t });
    if (!item) {
      await t.rollback();
      return res.status(404).json({ success: false, message: 'Deposit item not found' });
    }

    const qty = parseInt(item.quantity || 0, 10);
    const returnedQty = await DepositReturnItem.sum('quantity', { where: { depositItemId: item.id }, transaction: t }) || 0;

    if (returnedQty > 0) {
      await t.rollback();
      return res.status(400).json({ success: false, message: 'Returned items cannot be deleted' });
    }

    const inv = await InventoryItem.findOne({
      where: { productId: item.productId, inventoryCategory: 'Empty Cylinder' },
      transaction: t
    });
    if (!inv) {
      await t.rollback();
      return res.status(400).json({ success: false, message: 'No empty inventory for product' });
    }
    const beforeQty = inv.stockQuantity || 0;
    const afterQty = beforeQty + qty;
    inv.stockQuantity = afterQty;
    await inv.save({ transaction: t });
    await logInventoryMutation({
      inventoryItem: inv,
      quantityBefore: beforeQty,
      quantityAfter: afterQty,
      sourceModule: 'deposit',
      sourceAction: 'item_delete',
      sourceId: deposit.id,
      sourceRef: deposit.invoiceNumber,
      actorUserId: req.user?.id,
      notes: 'Deposit item deleted, stock restored'
    }, t);

    await DepositItem.destroy({ where: { id: itemId }, transaction: t });

    const remainingItems = await DepositItem.findAll({ where: { depositId }, transaction: t });
    if (remainingItems.length === 0) {
      await Deposit.destroy({ where: { id: depositId }, transaction: t });
    } else {
      const total = remainingItems.reduce((sum, it) => {
        const amt = it.amount != null ? parseFloat(it.amount || 0) : (parseFloat(it.price || 0) * parseInt(it.quantity || 0, 10));
        return sum + (Number.isNaN(amt) ? 0 : amt);
      }, 0);
      deposit.totalAmount = parseFloat(total.toFixed(2)).toFixed(2);
      await deposit.save({ transaction: t });
    }

    await t.commit();
    await rebuildDailyStockForDateValue(
      deposit.createdAt,
      `deposit item delete ${deposit.invoiceNumber || deposit.id || ''}`.trim()
    );
    res.json({ success: true, data: { depositId, itemId } });
  } catch (err) {
    console.error(err);
    await t.rollback();
    res.status(500).json({ success: false, message: 'Failed to delete deposit item' });
  }
}

module.exports = {
  getEmptyProducts,
  createDeposit,
  getCustomerDeposits,
  returnDepositItems,
  updateDepositReturn,
  deleteDepositReturn,
  getAllDeposits,
  getAllReturns,
  getLastDeposit,
  createDepositOverdueNotifications,
  getPendingCylinderSummary,
  updateDepositItem,
  deleteDepositItem
};
