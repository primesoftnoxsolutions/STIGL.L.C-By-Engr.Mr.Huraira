const { Product, Purchase, PurchaseHeader, PurchaseItem, SalesInvoiceItem, SalesInvoice, InventoryItem, DepositItem, Deposit, DepositReturn, DepositReturnItem, DailyStock, Payment, Customer, User, Rental, StockTransfer, StockTransferItem } = require('../models');
const { Op, fn, col, DataTypes } = require('sequelize');
const { ensureTableColumns } = require('../utils/schemaUtils');
const {
  toUaeDateKey,
  getUaeDayRange,
  addDaysToDateKey
} = require('../utils/uaeTime');
let dailyStockSchemaReady = false;
let dailyStockRebuildQueue = Promise.resolve();
const MANUAL_RETURN_SEED_SOURCE = 'manual_return_seed';

const buildVisibleDepositWhere = (extra = {}) => ({
  ...extra,
  [Op.or]: [
    { sourceType: null },
    { sourceType: { [Op.ne]: MANUAL_RETURN_SEED_SOURCE } }
  ]
});

const ensureDailyStockSchema = async () => {
  if (dailyStockSchemaReady) return;
  await ensureTableColumns(DailyStock.sequelize, 'daily_stocks', [
    {
      name: 'isSnapshot',
      definition: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false }
    },
    {
      name: 'toolPur',
      definition: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 }
    },
    {
      name: 'toolSales',
      definition: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 }
    },
    {
      name: 'openingTool',
      definition: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 }
    },
    {
      name: 'closingTool',
      definition: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 }
    }
  ]);
  dailyStockSchemaReady = true;
};

const isCurrentUaeDateKey = (dateKey) => (
  Boolean(dateKey) && String(dateKey) === toUaeDateKey()
);

const toInt = (val) => {
  const num = parseInt(val, 10);
  return Number.isNaN(num) ? 0 : num;
};

const computeClosingFull = (row) => (
  toInt(row.openingFull)
  + toInt(row.fullPur)
  + toInt(row.refilled)
  - toInt(row.fullCylSales)
  - toInt(row.gasSales)
  - toInt(row.transferGas)
  + toInt(row.receivedGas)
);

const computeClosingEmpty = (row, closingFullOverride) => (
  toInt(row.openingFull)
  + toInt(row.openingEmpty)
  + toInt(row.emptyPur)
  + toInt(row.fullPur)
  - toInt(row.fullCylSales)
  - toInt(row.emptyCylSales)
  - toInt(row.depositCylinder)
  + toInt(row.returnCylinder)
  - toInt(row.transferCylinders)
  + toInt(row.receivedCylinders)
  - toInt(closingFullOverride !== undefined ? closingFullOverride : row.closingFull)
);

const computeClosingTool = (row) => (
  toInt(row.openingTool)
  + toInt(row.toolPur)
  - toInt(row.toolSales)
  - toInt(row.transferTools)
  + toInt(row.receivedTools)
);

const hasRowTransactions = (row) => [
  'emptyPur',
  'toolPur',
  'fullPur',
  'refilled',
  'fullCylSales',
  'emptyCylSales',
  'toolSales',
  'gasSales',
  'depositCylinder',
  'returnCylinder',
  'transferGas',
  'transferCylinders',
  'transferTools',
  'receivedGas',
  'receivedCylinders',
  'receivedTools'
].some((key) => toInt(row[key]) !== 0);

const hasAnyRowValues = (row) => [
  'openingFull',
  'openingEmpty',
  'openingTool',
  'emptyPur',
  'toolPur',
  'fullPur',
  'refilled',
  'fullCylSales',
  'emptyCylSales',
  'toolSales',
  'gasSales',
  'depositCylinder',
  'returnCylinder',
  'transferGas',
  'transferCylinders',
  'transferTools',
  'receivedGas',
  'receivedCylinders',
  'receivedTools',
  'closingFull',
  'closingEmpty',
  'closingTool'
].some((key) => toInt(row?.[key]) !== 0);

const SNAPSHOT_FIELDS = [
  'emptyPur',
  'toolPur',
  'fullPur',
  'refilled',
  'fullCylSales',
  'emptyCylSales',
  'toolSales',
  'gasSales',
  'depositCylinder',
  'returnCylinder',
  'transferGas',
  'transferCylinders',
  'transferTools',
  'receivedGas',
  'receivedCylinders',
  'receivedTools',
  'closingTool',
  'closingFull',
  'closingEmpty'
];

const isSnapshotRow = (row) => SNAPSHOT_FIELDS.some((key) => toInt(row?.[key]) !== 0);
const snapshotFieldWhere = {
  [Op.or]: SNAPSHOT_FIELDS.map((field) => ({ [field]: { [Op.ne]: 0 } }))
};

const hasSnapshotForDate = async (dateKey) => {
  if (!dateKey) return false;
  const explicit = await DailyStock.findOne({ where: { reportDate: dateKey, isSnapshot: true } });
  if (explicit) return true;
  const legacy = await DailyStock.findOne({ where: { reportDate: dateKey, ...snapshotFieldWhere } });
  return Boolean(legacy);
};

const findLastSnapshotBefore = async (dateKey) => {
  if (!dateKey) return null;
  const explicit = await DailyStock.findOne({
    where: {
      reportDate: { [Op.lt]: dateKey },
      isSnapshot: true
    },
    order: [['reportDate', 'DESC']]
  });
  if (explicit?.reportDate) return String(explicit.reportDate);
  const legacy = await DailyStock.findOne({
    where: {
      reportDate: { [Op.lt]: dateKey },
      ...snapshotFieldWhere
    },
    order: [['reportDate', 'DESC']]
  });
  return legacy?.reportDate ? String(legacy.reportDate) : null;
};

const buildInventoryClosingMap = async (productIds = []) => {
  const where = { inventoryCategory: { [Op.in]: ['Full Cylinder', 'Empty Cylinder', 'Tool'] } };
  if (productIds.length) {
    where.productId = { [Op.in]: productIds };
  }
  const invs = await InventoryItem.findAll({ where });
  const map = new Map();
  invs.forEach(inv => {
    const entry = map.get(inv.productId) || { full: 0, empty: 0, tool: 0 };
    if (inv.inventoryCategory === 'Full Cylinder') entry.full = toInt(inv.stockQuantity);
    if (inv.inventoryCategory === 'Empty Cylinder') entry.empty = toInt(inv.stockQuantity);
    if (inv.inventoryCategory === 'Tool') entry.tool = toInt(inv.stockQuantity);  
    map.set(inv.productId, entry);
  });
  return map;
};

const normalizeName = (name = '') => {
  if (!name) return '';
  const parts = String(name).trim().split(/\s+/);
  if (parts.length > 1 && /^(cylinder|gas|tool)$/i.test(parts[0])) {
    parts.shift();
  }
  return parts.join(' ')
    .replace(/[^a-z0-9\s]/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
};

const normalizeItemType = (value = '') => {
  const lower = String(value || '').trim().toLowerCase();
  if (lower === 'gas') return 'Gas';
  if (lower === 'empty cylinder') return 'Empty Cylinder';
  if (lower === 'tool' || lower === 'tools') return 'Tool';
  return String(value || '').trim();
};

const createDailyStockMap = (products = []) => {
  const map = {};
  products.forEach((product) => {
    map[product.id] = {
      productId: product.id,
      productName: product.productName,
      productType: product.productType,
      openingFull: 0,
      openingEmpty: 0,
      openingTool: 0,
      emptyPur: 0,
      toolPur: 0,
      fullPur: 0,
      refilled: 0,
      fullCylSales: 0,
      emptyCylSales: 0,
      toolSales: 0,
      gasSales: 0,
      depositCylinder: 0,
      returnCylinder: 0,
      transferGas: 0,
      transferCylinders: 0,
      transferTools: 0,
      receivedGas: 0,
      receivedCylinders: 0,
      receivedTools: 0,
      closingTool: 0,
      closingFull: 0,
      closingEmpty: 0
    };
  });
  return map;
};

const isTransferEventInScope = (eventTime, range, rangeMode) => {
  if (!eventTime) return false;
  if (!range?.start) return true;

  const resolved = new Date(eventTime);
  if (Number.isNaN(resolved.getTime())) return false;

  if (rangeMode === 'before') {
    return resolved < range.start;
  }

  return resolved >= range.start && resolved <= range.end;
};

const resolveTransferTargetProductId = ({
  itemType,
  productId,
  map,
  productNameById,
  cylinderByName
}) => {
  const normalizedType = normalizeItemType(itemType);
  if (normalizedType !== 'Gas') {
    return map[productId] ? productId : null;
  }

  if (map[productId]) {
    return productId;
  }

  const gasName = normalizeName(productNameById.get(productId));
  return gasName ? cylinderByName.get(gasName) : null;
};

const applyDailyStockMovements = async ({
  map,
  employeeId,
  dateFilter,
  range,
  rangeMode = 'day',
  transferPerspective = 'system',
  productNameById,
  cylinderByName
}) => {
  const hasDateFilter = Boolean(dateFilter);

  const purchaseWhere = { status: 'confirmed' };
  if (hasDateFilter) purchaseWhere.updatedAt = dateFilter;
  if (employeeId) purchaseWhere.employeeId = employeeId;

  const legacyPurchases = await Purchase.findAll({
    attributes: ['productId', 'relatedProductId', 'purchaseType', 'cylinderCondition', [fn('SUM', col('quantity')), 'totalQty']],
    where: purchaseWhere,
    group: ['productId', 'relatedProductId', 'purchaseType', 'cylinderCondition']
  });

  legacyPurchases.forEach((purchase) => {
    const productId = purchase.productId;
    const quantity = toInt(purchase.get('totalQty'));
    if (!productId) return;

    if (purchase.purchaseType === 'Cylinder') {
      if (purchase.cylinderCondition === 'Full' && map[productId]) {
        map[productId].fullPur += quantity;
      } else if (purchase.cylinderCondition === 'Empty' && map[productId]) {
        map[productId].emptyPur += quantity;
      }
      return;
    }

    if (purchase.purchaseType === 'Gas') {
      const relatedProductId = purchase.relatedProductId;
      if (relatedProductId && map[relatedProductId]) {
        map[relatedProductId].refilled += quantity;
      }
      return;
    }

    if (purchase.purchaseType === 'Tool' && map[productId]) {
      map[productId].toolPur += quantity;
    }
  });

  const purchaseHeaderWhere = { status: 'confirmed' };
  if (hasDateFilter) purchaseHeaderWhere.updatedAt = dateFilter;
  if (employeeId) purchaseHeaderWhere.employeeId = employeeId;

  const groupedItems = await PurchaseItem.findAll({
    attributes: ['productId', 'relatedProductId', 'purchaseType', 'cylinderCondition', [fn('SUM', col('quantity')), 'totalQty']],
    include: [{
      model: PurchaseHeader,
      as: 'purchaseHeader',
      attributes: [],
      required: true,
      where: purchaseHeaderWhere
    }],
    group: ['productId', 'relatedProductId', 'purchaseType', 'cylinderCondition']
  });

  groupedItems.forEach((item) => {
    const quantity = toInt(item.get('totalQty'));

    if (item.purchaseType === 'Cylinder') {
      if (item.cylinderCondition === 'Full' && map[item.productId]) {
        map[item.productId].fullPur += quantity;
      } else if (item.cylinderCondition === 'Empty' && map[item.productId]) {
        map[item.productId].emptyPur += quantity;
      }
      return;
    }

    if (item.purchaseType === 'Gas') {
      if (item.relatedProductId && map[item.relatedProductId]) {
        map[item.relatedProductId].refilled += quantity;
      }
      return;
    }

    if (item.purchaseType === 'Tool' && item.productId && map[item.productId]) {
      map[item.productId].toolPur += quantity;
    }
  });

  const invoiceWhere = { status: { [Op.notIn]: ['draft', 'cancelled', 'deleted'] } };
  if (hasDateFilter) invoiceWhere.invoiceDate = dateFilter;
  if (employeeId) invoiceWhere.employeeId = employeeId;

  const invoiceInclude = {
    model: SalesInvoice,
    as: 'invoice',
    where: invoiceWhere,
    attributes: []
  };

  if (!employeeId) {
    invoiceInclude.include = [{
      model: User,
      as: 'employee',
      attributes: [],
      required: true,
      where: { role: { [Op.ne]: 'employee' } }
    }];
  }

  const salesItemsDetailed = await SalesInvoiceItem.findAll({
    include: [invoiceInclude]
  });

  const inventoryIds = [...new Set(salesItemsDetailed.map((item) => item.inventoryItemId).filter(Boolean))];
  const inventoryMap = {};
  if (inventoryIds.length > 0) {
    const inventoryItems = await InventoryItem.findAll({ where: { id: inventoryIds } });
    inventoryItems.forEach((inventoryItem) => {
      inventoryMap[inventoryItem.id] = inventoryItem.productId;
    });
  }

  salesItemsDetailed.forEach((item) => {
    const quantity = toInt(item.quantity);

    if (item.saleType === 'Full Cylinder' && map[item.productId]) {
      map[item.productId].fullCylSales += quantity;
      return;
    }

    if (item.saleType === 'Empty Cylinder' && map[item.productId]) {
      map[item.productId].emptyCylSales += quantity;
      return;
    }

    if (item.saleType === 'Tool' && map[item.productId]) {
      map[item.productId].toolSales += quantity;
      return;
    }

    if (item.saleType === 'Gas') {
      const inventoryProductId = item.inventoryItemId ? inventoryMap[item.inventoryItemId] : null;
      let cylinderProductId = inventoryProductId;
      if (!cylinderProductId && item.productId) {
        const gasName = normalizeName(productNameById.get(item.productId));
        cylinderProductId = gasName ? cylinderByName.get(gasName) : null;
      }
      if (cylinderProductId && map[cylinderProductId]) {
        map[cylinderProductId].gasSales += quantity;
      }
    }
  });

  const depositInclude = [{
    model: Deposit,
    as: 'deposit',
    attributes: [],
    required: true,
    where: buildVisibleDepositWhere()
  }];
  if (hasDateFilter) depositInclude[0].where.createdAt = dateFilter;
  if (employeeId) depositInclude[0].where.employeeId = employeeId;

  const depositItems = await DepositItem.findAll({
    attributes: ['productId', [fn('SUM', col('quantity')), 'totalQty']],
    include: depositInclude,
    group: ['productId']
  });

  depositItems.forEach((item) => {
    const quantity = toInt(item.get('totalQty'));
    if (item.productId && map[item.productId]) {
      map[item.productId].depositCylinder += quantity;
    }
  });

  const returnInclude = [{
    model: DepositReturn,
    as: 'depositReturn',
    attributes: [],
    required: true,
    where: {}
  }];
  if (hasDateFilter) returnInclude[0].where.createdAt = dateFilter;
  if (employeeId) returnInclude[0].where.employeeId = employeeId;
  if (!Object.keys(returnInclude[0].where).length) delete returnInclude[0].where;

  const returnItems = await DepositReturnItem.findAll({
    attributes: ['productId', [fn('SUM', col('quantity')), 'totalQty']],
    include: returnInclude,
    group: ['productId']
  });

  returnItems.forEach((item) => {
    const quantity = toInt(item.get('totalQty'));
    if (item.productId && map[item.productId]) {
      map[item.productId].returnCylinder += quantity;
    }
  });

  const transferWhere = {};
  if (hasDateFilter) {
    transferWhere[Op.or] = [
      { createdAt: dateFilter },
      { updatedAt: dateFilter }
    ];
  }
  if (employeeId) transferWhere.employeeId = employeeId;

  const transferItems = await StockTransferItem.findAll({
    include: [{
      model: StockTransfer,
      as: 'transfer',
      where: transferWhere,
      attributes: ['transferType', 'status', 'createdAt', 'updatedAt']
    }]
  });

  transferItems.forEach((item) => {
    const quantity = toInt(item.quantity);
    const transfer = item.transfer;
    if (!transfer || quantity <= 0) return;

    let movementType = null;
    let eventTime = null;

    if (transferPerspective === 'employee') {
      const isAcceptedAssign = transfer.transferType === 'assign' && transfer.status === 'received';
      const isEmployeeReturn = transfer.transferType === 'return' && ['pending', 'received'].includes(transfer.status);

      if (isAcceptedAssign) {
        movementType = 'received';
        eventTime = transfer.updatedAt || transfer.createdAt;
      } else if (isEmployeeReturn) {
        movementType = 'transfer';
        eventTime = transfer.createdAt;
      }
    } else {
      const isAssign = transfer.transferType === 'assign' && ['assigned', 'received'].includes(transfer.status);
      const isAcceptedReturn = transfer.transferType === 'return' && transfer.status === 'received';

      if (isAssign) {
        movementType = 'transfer';
        eventTime = transfer.createdAt;
      } else if (isAcceptedReturn) {
        movementType = 'received';
        eventTime = transfer.updatedAt || transfer.createdAt;
      }
    }

    if (!movementType || !isTransferEventInScope(eventTime, range, rangeMode)) {
      return;
    }

    const normalizedItemType = normalizeItemType(item.itemType);
    const targetProductId = resolveTransferTargetProductId({
      itemType: normalizedItemType,
      productId: item.productId,
      map,
      productNameById,
      cylinderByName
    });

    if (!targetProductId || !map[targetProductId]) {
      return;
    }

    if (normalizedItemType === 'Gas') {
      if (movementType === 'transfer') {
        map[targetProductId].transferGas += quantity;
      } else {
        map[targetProductId].receivedGas += quantity;
      }
      return;
    }

    if (normalizedItemType === 'Empty Cylinder') {
      if (movementType === 'transfer') {
        map[targetProductId].transferCylinders += quantity;
      } else {
        map[targetProductId].receivedCylinders += quantity;
      }
      return;
    }

    if (normalizedItemType === 'Tool') {
      if (movementType === 'transfer') {
        map[targetProductId].transferTools += quantity;
      } else {
        map[targetProductId].receivedTools += quantity;
      }
    }
  });
};

const buildDailyStockRows = async ({ dateKey, employeeId, useStoredSnapshot = true }) => {
  const products = await Product.findAll({
    attributes: ['id', 'productName', 'productType'],
    where: { productType: { [Op.ne]: 'Gas' } }
  });
  const gasProducts = await Product.findAll({
    attributes: ['id', 'productName'],
    where: { productType: 'Gas' }
  });

  const map = createDailyStockMap(products);
  const productIds = products.map(p => p.id);
  const inventoryClosingMap = employeeId ? new Map() : await buildInventoryClosingMap(productIds);
  const cylinderByName = new Map(
    products
      .filter(p => p.productType === 'Cylinder')
      .map(p => [normalizeName(p.productName), p.id])
  );
  const productNameById = new Map([
    ...products.map(p => [p.id, p.productName]),
    ...gasProducts.map(p => [p.id, p.productName])
  ]);
  const range = getUaeDayRange(dateKey);
  if (!range) {
    return [];
  }

  const dateWhere = { [Op.between]: [range.start, range.end] };

  if (employeeId) {
    const historicalMap = createDailyStockMap(products);

    await applyDailyStockMovements({
      map: historicalMap,
      employeeId,
      dateFilter: { [Op.lt]: range.start },
      range,
      rangeMode: 'before',
      transferPerspective: 'employee',
      productNameById,
      cylinderByName
    });

    await applyDailyStockMovements({
      map,
      employeeId,
      dateFilter: dateWhere,
      range,
      rangeMode: 'day',
      transferPerspective: 'employee',
      productNameById,
      cylinderByName
    });

    Object.values(map).forEach((row) => {
      const historicalRow = historicalMap[row.productId];
      const openingFull = computeClosingFull(historicalRow);
      const openingTool = computeClosingTool(historicalRow);
      const openingEmpty = computeClosingEmpty(historicalRow, openingFull);

      row.openingFull = openingFull;
      row.openingEmpty = openingEmpty;
      row.openingTool = openingTool;
      row.closingTool = computeClosingTool(row);
      row.closingFull = computeClosingFull(row);
      row.closingEmpty = computeClosingEmpty(row, row.closingFull);
    });

    return Object.values(map);
  }

  await applyDailyStockMovements({
    map,
    employeeId: null,
    dateFilter: dateWhere,
    range,
    rangeMode: 'day',
    transferPerspective: 'system',
    productNameById,
    cylinderByName
  });

  const storedRows = await DailyStock.findAll({
    where: {
      reportDate: dateKey,
      ...(productIds.length ? { productId: { [Op.in]: productIds } } : {})
    }
  });
  const storedByProduct = new Map();
  storedRows.forEach(row => storedByProduct.set(row.productId, row));

  const prevDateKey = addDaysToDateKey(dateKey, -1);
  const prevRows = prevDateKey ? await DailyStock.findAll({
    where: {
      reportDate: prevDateKey,
      ...(productIds.length ? { productId: { [Op.in]: productIds } } : {})
    }
  }) : [];
  const prevByProduct = new Map();
  prevRows.forEach(row => prevByProduct.set(row.productId, row));


  Object.values(map).forEach(row => {
    const stored = storedByProduct.get(row.productId);
    const prev = prevByProduct.get(row.productId);
    const prevIsSnapshot = prev && (prev.isSnapshot || isSnapshotRow(prev));
    const storedIsSnapshot = stored && (stored.isSnapshot || isSnapshotRow(stored));

    if (prevIsSnapshot) {
      row.openingFull = toInt(prev.closingFull);
      row.openingEmpty = toInt(prev.closingEmpty);
      row.openingTool = toInt(prev.closingTool);
    } else if (stored) {
      row.openingFull = toInt(stored.openingFull);
      row.openingEmpty = toInt(stored.openingEmpty);
      row.openingTool = toInt(stored.openingTool);
    } else if (isCurrentUaeDateKey(dateKey)) {
      // For current-day live report, reverse-calculate opening from live inventory
      // so that closing remains aligned with current stock movements.
      const inv = inventoryClosingMap.get(row.productId);
      const liveFull = toInt(inv?.full);
      const liveEmpty = toInt(inv?.empty);
      const liveTool = toInt(inv?.tool);

      row.openingTool = Math.max(
        0,
        liveTool
          - toInt(row.toolPur)
          + toInt(row.toolSales)
          + toInt(row.transferTools)
          - toInt(row.receivedTools)
      );

      row.openingFull = Math.max(
        0,
        liveFull
          - toInt(row.fullPur)
          - toInt(row.refilled)
          + toInt(row.fullCylSales)
          + toInt(row.gasSales)
          + toInt(row.transferGas)
          - toInt(row.receivedGas)
      );

      row.openingEmpty = Math.max(
        0,
        liveEmpty
          - toInt(row.emptyPur)
          - toInt(row.fullPur)
          + toInt(row.fullCylSales)
          + toInt(row.emptyCylSales)
          + toInt(row.depositCylinder)
          - toInt(row.returnCylinder)
          + toInt(row.transferCylinders)
          - toInt(row.receivedCylinders)
          + liveFull
          - row.openingFull
      );
    }

    row.closingTool = computeClosingTool(row);
    row.closingFull = computeClosingFull(row);
    row.closingEmpty = computeClosingEmpty(row, row.closingFull);

    if (useStoredSnapshot && stored && storedIsSnapshot) {
      row.openingFull = toInt(stored.openingFull);
      row.openingEmpty = toInt(stored.openingEmpty);
      row.openingTool = toInt(stored.openingTool);
      row.emptyPur = toInt(stored.emptyPur);
      row.toolPur = toInt(stored.toolPur);
      row.fullPur = toInt(stored.fullPur);
      row.refilled = toInt(stored.refilled);
      row.fullCylSales = toInt(stored.fullCylSales);
      row.emptyCylSales = toInt(stored.emptyCylSales);
      row.toolSales = toInt(stored.toolSales);
      row.gasSales = toInt(stored.gasSales);
      row.depositCylinder = toInt(stored.depositCylinder);
      row.returnCylinder = toInt(stored.returnCylinder);
      row.transferGas = toInt(stored.transferGas);
      row.transferCylinders = toInt(stored.transferCylinders);
      row.transferTools = toInt(stored.transferTools);
      row.receivedGas = toInt(stored.receivedGas);
      row.receivedCylinders = toInt(stored.receivedCylinders);
      row.receivedTools = toInt(stored.receivedTools);
      row.closingTool = computeClosingTool(row);
      row.closingFull = computeClosingFull(row);
      row.closingEmpty = computeClosingEmpty(row, row.closingFull);
    }

    if (isCurrentUaeDateKey(dateKey)) {
      const inv = inventoryClosingMap.get(row.productId);
      if (inv) {
        row.closingFull = toInt(inv.full);
        row.closingEmpty = toInt(inv.empty);
        row.closingTool = toInt(inv.tool);
      }
    }
  });

  return Object.values(map);
};

exports.getDailyStock = async (req, res) => {
  try {
    await ensureDailyStockSchema();
    const { startDate } = req.query;
    const dateKey = startDate || toUaeDateKey();
    const selectedRange = getUaeDayRange(dateKey);
    if (!selectedRange) {
      return res.status(400).json({ success: false, message: 'Invalid date. Use YYYY-MM-DD.' });
    }
    let resolvedEmployeeId = req.user?.role === 'employee' ? req.user.id : req.query.employeeId;
    if (resolvedEmployeeId && req.user?.role !== 'employee') {
      const selectedUser = await User.findByPk(resolvedEmployeeId, { attributes: ['id', 'role'] });
      if (!selectedUser) {
        resolvedEmployeeId = null;
      } else {
        const selectedRole = String(selectedUser.role || '').trim().toLowerCase();
        const isManagementRole = selectedRole === 'super_admin' || selectedRole === 'manager';
        if (isManagementRole) {
          // Super/Admin selection should behave as an all-operations view.
          resolvedEmployeeId = null;
        }
      }
    }
    const shouldUseStoredSnapshot = !resolvedEmployeeId && !isCurrentUaeDateKey(dateKey);
    const rows = await buildDailyStockRows({
      dateKey,
      employeeId: resolvedEmployeeId,
      useStoredSnapshot: shouldUseStoredSnapshot
    });
    const meaningfulRows = rows.filter((row) => hasAnyRowValues(row));
    res.status(200).json({ success: true, data: meaningfulRows });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

const saveDailyStockSnapshotInternal = async (dateKeyOverride, options = {}) => {
  await ensureDailyStockSchema();
  const dateKey = dateKeyOverride || toUaeDateKey();
  const skipEnsurePrev = options.skipEnsurePrev === true;
  const forceRecompute = options.forceRecompute === true;

  if (!skipEnsurePrev) {
    const prevKey = addDaysToDateKey(dateKey, -1);
    if (prevKey && !(await hasSnapshotForDate(prevKey))) {
      const lastSnapshotKey = await findLastSnapshotBefore(prevKey);
      let cursor = lastSnapshotKey ? addDaysToDateKey(lastSnapshotKey, 1) : prevKey;
      const maxDays = Number(process.env.DAILY_STOCK_BACKFILL_MAX_DAYS || 366);
      let processed = 0;
      while (cursor && cursor <= prevKey && processed < maxDays) {
        await saveDailyStockSnapshotInternal(cursor, { skipEnsurePrev: true });
        cursor = addDaysToDateKey(cursor, 1);
        processed += 1;
      }
    }
  }

  const rows = await buildDailyStockRows({
    dateKey,
    employeeId: null,
    useStoredSnapshot: !forceRecompute
  });

  const nextDateKey = addDaysToDateKey(dateKey, 1);

  await DailyStock.sequelize.transaction(async (transaction) => {
    for (const row of rows) {
      const existingSnapshot = await DailyStock.findOne({
        where: { reportDate: dateKey, productId: row.productId },
        transaction
      });

      const isFinalSnapshot = !forceRecompute
        && existingSnapshot
        && (existingSnapshot.isSnapshot || isSnapshotRow(existingSnapshot));
      const snapshotSource = isFinalSnapshot ? existingSnapshot : row;

      if (!isFinalSnapshot) {
        await DailyStock.upsert({
          reportDate: dateKey,
          productId: snapshotSource.productId,
          openingFull: toInt(snapshotSource.openingFull),
          openingEmpty: toInt(snapshotSource.openingEmpty),
          openingTool: toInt(snapshotSource.openingTool),
          emptyPur: toInt(snapshotSource.emptyPur),
          toolPur: toInt(snapshotSource.toolPur),
          fullPur: toInt(snapshotSource.fullPur),
          refilled: toInt(snapshotSource.refilled),
          fullCylSales: toInt(snapshotSource.fullCylSales),
          emptyCylSales: toInt(snapshotSource.emptyCylSales),
          toolSales: toInt(snapshotSource.toolSales),
          gasSales: toInt(snapshotSource.gasSales),
          depositCylinder: toInt(snapshotSource.depositCylinder),
          returnCylinder: toInt(snapshotSource.returnCylinder),
          transferGas: toInt(snapshotSource.transferGas),
          transferCylinders: toInt(snapshotSource.transferCylinders),
          transferTools: toInt(snapshotSource.transferTools),
          receivedGas: toInt(snapshotSource.receivedGas),
          receivedCylinders: toInt(snapshotSource.receivedCylinders),
          receivedTools: toInt(snapshotSource.receivedTools),
          closingTool: toInt(snapshotSource.closingTool),
          closingFull: toInt(snapshotSource.closingFull),
          closingEmpty: toInt(snapshotSource.closingEmpty),
          isSnapshot: true
        }, { transaction });
      } else if (existingSnapshot && !existingSnapshot.isSnapshot) {
        await existingSnapshot.update({ isSnapshot: true }, { transaction });
      }

      if (nextDateKey) {
        const existingNext = await DailyStock.findOne({
          where: { reportDate: nextDateKey, productId: row.productId },
          transaction
        });

        if (existingNext) {
          // Only seed opening for the next day if it hasn't been snapshotted yet.
          if (!existingNext.isSnapshot && !isSnapshotRow(existingNext)) {
            await existingNext.update({
              openingFull: toInt(snapshotSource.closingFull),
              openingEmpty: toInt(snapshotSource.closingEmpty),
              openingTool: toInt(snapshotSource.closingTool)
            }, { transaction });
          }
        } else {
          await DailyStock.create({
            reportDate: nextDateKey,
            productId: row.productId,
            openingFull: toInt(snapshotSource.closingFull),
            openingEmpty: toInt(snapshotSource.closingEmpty),
            openingTool: toInt(snapshotSource.closingTool)
          }, { transaction });
        }
      }
    }
  });

  return { dateKey, count: rows.length };
};

const rebuildDailyStockFromDateInternal = async (startDateKey) => {
  if (!startDateKey) return { startDateKey: null, endDateKey: null, processed: 0 };
  const todayKey = toUaeDateKey();
  let cursor = String(startDateKey);
  let processed = 0;
  const maxDays = Number(process.env.DAILY_STOCK_REBUILD_MAX_DAYS || 730);

  while (cursor && cursor <= todayKey && processed < maxDays) {
    await saveDailyStockSnapshotInternal(cursor, {
      skipEnsurePrev: true,
      forceRecompute: true
    });
    cursor = addDaysToDateKey(cursor, 1);
    processed += 1;
  }

  return {
    startDateKey: String(startDateKey),
    endDateKey: todayKey,
    processed
  };
};

const queueDailyStockRebuildFromDate = (startDateKey, options = {}) => {
  if (!startDateKey) {
    return Promise.resolve({ startDateKey: null, endDateKey: null, processed: 0 });
  }

  const requestedDateKey = String(startDateKey);
  const reason = options.reason ? String(options.reason) : 'queued';
  const run = async () => {
    const rebuilt = await rebuildDailyStockFromDateInternal(requestedDateKey);
    console.log(
      `[DAILY STOCK] Rebuild queued for ${reason}: `
      + `${rebuilt.startDateKey} -> ${rebuilt.endDateKey} (${rebuilt.processed} days)`
    );
    return rebuilt;
  };

  dailyStockRebuildQueue = dailyStockRebuildQueue
    .catch(() => null)
    .then(run);

  return dailyStockRebuildQueue;
};

exports.saveDailyStockSnapshot = async (dateKeyOverride, options = {}) => (
  saveDailyStockSnapshotInternal(dateKeyOverride, options)
);

exports.rebuildDailyStockFromDate = rebuildDailyStockFromDateInternal;
exports.queueDailyStockRebuildFromDate = queueDailyStockRebuildFromDate;

// @desc    Get cash paper report with sales, deposits, returns, and rentals
// @route   GET /api/reports/cash-paper
// @access  Private
exports.getCashPaperReport = async (req, res) => {
  try {
    let { startDate, endDate, employeeId } = req.query;
    
    // Default to today (UAE) if no dates provided
    const today = toUaeDateKey();
    if (!startDate) startDate = today;
    if (!endDate) endDate = today;
    if (req.user?.role === 'employee') {
      employeeId = req.user.id;
    }

    // Build UAE date filter from user-selected date-only values
    const startRange = getUaeDayRange(startDate);
    const endRange = getUaeDayRange(endDate);
    if (!startRange || !endRange) {
      return res.status(400).json({
        success: false,
        message: 'Invalid date range. Use YYYY-MM-DD.'
      });
    }
    const minRangeStart = startRange.start <= endRange.start ? startRange.start : endRange.start;
    const maxRangeEnd = startRange.end >= endRange.end ? startRange.end : endRange.end;
    const dateWhere = {
      [Op.between]: [minRangeStart, maxRangeEnd]
    };

    // ===== 1) CREDIT SALES INVOICES (pending status) =====
    const creditWhere = { status: { [Op.ne]: 'deleted' }, paymentStatus: 'pending', invoiceDate: dateWhere };
    if (employeeId) creditWhere.employeeId = employeeId;

    const creditSales = await SalesInvoice.findAll({
      where: creditWhere,
      include: [{ model: Customer, as: 'customer', attributes: ['id', 'name'], required: false }],
      attributes: ['id', 'invoiceNumber', 'total', 'invoiceDate'],
      raw: false,
      subQuery: false
    });

    let totalCredit = 0;
    let totalCreditVAT = 0;
    const creditSalesData = creditSales.map(inv => {
      const amount = parseFloat(inv.total) || 0;
      const vat = amount * 0.05;
      totalCredit += amount;
      totalCreditVAT += vat;
      return {
        invoiceId: inv.invoiceNumber,
        customer: inv.customer?.name || 'N/A',
        vat: vat.toFixed(2),
        amount: amount.toFixed(2)
      };
    });

    // ===== 2) CASH SALES INVOICES (paid or partial) =====
    const cashWhere = { status: { [Op.ne]: 'deleted' }, paymentStatus: { [Op.in]: ['paid', 'partial'] }, invoiceDate: dateWhere };
    if (employeeId) cashWhere.employeeId = employeeId;

    const cashSales = await SalesInvoice.findAll({
      where: cashWhere,
      include: [{ model: Customer, as: 'customer', attributes: ['id', 'name'], required: false }],
      attributes: ['id', 'invoiceNumber', 'total', 'invoiceDate'],
      raw: false,
      subQuery: false
    });

    let totalDebit = 0;
    let totalDebitVAT = 0;
    const cashSalesData = cashSales.map(inv => {
      const amount = parseFloat(inv.total) || 0;
      const vat = amount * 0.05;
      totalDebit += amount;
      totalDebitVAT += vat;
      return {
        invoiceId: inv.invoiceNumber,
        customer: inv.customer?.name || 'N/A',
        vat: vat.toFixed(2),
        amount: amount.toFixed(2)
      };
    });

    // ===== 3) DEPOSIT CYLINDER INVOICES =====
    const depositWhere = buildVisibleDepositWhere({ createdAt: dateWhere });
    if (employeeId) depositWhere.employeeId = employeeId;

    const deposits = await Deposit.findAll({
      where: depositWhere,
      include: [{ model: Customer, as: 'customer', attributes: ['id', 'name'], required: false }],
      attributes: ['id', 'totalAmount', 'createdAt'],
      raw: false,
      subQuery: false
    });

    let totalDepositCylinder = 0;
    const depositData = deposits.map(dep => {
      const amount = parseFloat(dep.totalAmount) || 0;
      totalDepositCylinder += amount;
      return {
        invoiceId: dep.invoiceNumber || dep.id,
        customer: dep.customer?.name || 'N/A',
        amount: amount.toFixed(2)
      };
    });

    // ===== 4) RETURN CYLINDER INVOICES =====
    const returnWhere = { createdAt: dateWhere };
    if (employeeId) returnWhere.employeeId = employeeId;

    const returns = await DepositReturn.findAll({
      where: returnWhere,
      include: [
        { model: Customer, as: 'customer', attributes: ['id', 'name'], required: false },
        { model: DepositReturnItem, as: 'items', include: [{ model: DepositItem, as: 'depositItem', attributes: ['price'] }] }
      ],
      attributes: ['id', 'returnNumber', 'createdAt'],
      raw: false,
      subQuery: false
    });

    let totalReturnCylinder = 0;
    const returnData = returns.map(ret => {
      const items = ret.items || [];
      const amount = items.reduce((sum, it) => {
        const price = parseFloat(it.depositItem?.price || 0) || 0;
        const qty = parseInt(it.quantity || 0, 10) || 0;
        return sum + (price * qty);
      }, 0);
      totalReturnCylinder += amount;
      return {
        invoiceId: ret.returnNumber || ret.id,
        customer: ret.customer?.name || 'N/A',
        amount: amount.toFixed(2)
      };
    });

    // ===== 5) RENTAL COLLECTION INVOICES =====
    const rentalWhere = { startDate: dateWhere };
    if (employeeId) rentalWhere.employeeId = employeeId;

    const rentals = await Rental.findAll({
      where: rentalWhere,
      include: [{ model: Customer, as: 'customer', attributes: ['id', 'name'], required: false }],
      attributes: ['id', 'rentalNumber', 'rentalAmount', 'startDate'],
      raw: false,
      subQuery: false
    });

    let totalRentalCollection = 0;
    let totalRentalVAT = 0;
    const rentalData = rentals.map(rental => {
      const amount = parseFloat(rental.rentalAmount) || 0;
      const vat = amount * 0.05;
      totalRentalCollection += amount;
      totalRentalVAT += vat;
      return {
        invoiceId: rental.rentalNumber,
        customer: rental.customer?.name || 'N/A',
        vat: vat.toFixed(2),
        amount: amount.toFixed(2)
      };
    });

    // ===== 6) CALCULATE SUMMARY =====
    const totalVAT = totalCreditVAT + totalDebitVAT + totalRentalVAT;
    const otherAmount = 0;
    // Grand Total = Cash + Credit + Rental + VAT
    // NOTE: Deposit and Return are tracking-only (security/adjustments), NOT included in financial totals
    const grandTotal = totalDebit + totalCredit + totalRentalCollection + totalVAT;

    const summary = {
      totalCredit: totalCredit.toFixed(2),
      totalDebit: totalDebit.toFixed(2),
      totalDepositCylinder: totalDepositCylinder.toFixed(2),
      totalReturnCylinder: totalReturnCylinder.toFixed(2),
      totalRentalCollection: totalRentalCollection.toFixed(2),
      totalVAT: totalVAT.toFixed(2),
      other: otherAmount.toFixed(2),
      grandTotal: grandTotal.toFixed(2)
    };

    res.status(200).json({
      success: true,
      data: {
        creditSales: creditSalesData,
        cashSales: cashSalesData,
        deposits: depositData,
        returns: returnData,
        rentals: rentalData,
        summary,
        dateRange: {
          startDate: startDate || null,
          endDate: endDate || null
        }
      }
    });
  } catch (error) {
    console.error('Cash paper report error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Server error getting cash paper report',
      error: error.message
    });
  }
};
