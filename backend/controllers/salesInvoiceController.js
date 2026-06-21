const { SalesInvoice, SalesInvoiceItem, Customer, User, Cylinder, InventoryItem, Product, CustomerItemRate, StockTransfer, StockTransferItem, CompanySettings, sequelize } = require('../models');
const { logInventoryMutation } = require('../utils/stockLogger');
const { Op, DataTypes } = require('sequelize');
const { ensureTableColumns } = require('../utils/schemaUtils');
const {
  buildCustomerRateLookupKey,
  ensureCustomerItemRateSchema
} = require('../utils/customerItemRate');
const {
  buildUaeDateRange,
  parseUaeDateInput,
  toUaeDateKey,
  makeUaeDateFromKey
} = require('../utils/uaeTime');
const { queueDailyStockRebuildFromDate } = require('./reportController');

let salesInvoiceSchemaReady = false;
let companySettingsGasSchemaReady = false;

const minDateKey = (...dateKeys) => {
  const validKeys = dateKeys.filter(Boolean).map((value) => String(value));
  return validKeys.length ? validKeys.sort()[0] : null;
};

const rebuildDailyStockForInvoice = async ({ oldDateKey = null, newDateKey = null, action, invoiceNumber }) => {
  const affectedDateKey = minDateKey(oldDateKey, newDateKey);
  if (!affectedDateKey) return;

  try {
    await queueDailyStockRebuildFromDate(affectedDateKey, {
      reason: `invoice ${action} ${invoiceNumber || ''}`.trim()
    });
  } catch (error) {
    console.error(
      `[DAILY STOCK] Rebuild failed after invoice ${action} ${invoiceNumber || ''}:`,
      error.message
    );
  }
};

const ensureSalesInvoiceSchema = async () => {
  if (salesInvoiceSchemaReady) return;
  await ensureTableColumns(sequelize, 'sales_invoices', [
    {
      name: 'authorizedBySignature',
      definition: { type: DataTypes.TEXT, allowNull: true }
    },
    {
      name: 'authorizedByName',
      definition: { type: DataTypes.STRING(100), allowNull: true }
    },
    {
      name: 'authorizedById',
      definition: { type: DataTypes.UUID, allowNull: true }
    }
  ]);
  salesInvoiceSchemaReady = true;
};

const ensureCompanySettingsGasSchema = async () => {
  if (companySettingsGasSchemaReady) return;
  await ensureTableColumns(sequelize, 'company_settings', [
    {
      name: 'gasSaleInvoicePrefix',
      definition: { type: DataTypes.STRING(50), allowNull: true }
    },
    {
      name: 'gasSaleInvoiceNextNumber',
      definition: { type: DataTypes.INTEGER, allowNull: true }
    },
    {
      name: 'gasSaleInvoicePadding',
      definition: { type: DataTypes.INTEGER, allowNull: true }
    }
  ]);
  companySettingsGasSchemaReady = true;
};

const getCompanySettingsRow = async (transaction) => {
  await ensureCompanySettingsGasSchema();
  let settings = await CompanySettings.findOne({ transaction });
  if (!settings) {
    settings = await CompanySettings.create({
      companyName: 'Company'
    }, { transaction });
  }
  return settings;
};

const parseGasInvoiceStart = (input) => {
  if (!input && input !== 0) return null;
  const trimmed = String(input).trim();
  const match = trimmed.match(/^(.*?)(\d+)$/);
  if (!match) return null;
  const prefix = match[1] || '';
  const numberStr = match[2];
  const nextNumber = parseInt(numberStr, 10);
  if (!Number.isFinite(nextNumber) || nextNumber <= 0) return null;
  return {
    prefix,
    nextNumber,
    padding: numberStr.length,
    formatted: `${prefix}${numberStr}`
  };
};

const formatGasInvoiceNumber = (prefix, number, padding) => {
  const parsedNumber = parseInt(number, 10);
  if (!Number.isFinite(parsedNumber)) return null;
  const pad = Number.isFinite(parseInt(padding, 10)) ? parseInt(padding, 10) : String(parsedNumber).length;
  const numberStr = String(parsedNumber).padStart(pad, '0');
  return `${prefix || ''}${numberStr}`;
};

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const findMaxInvoiceNumberForPrefix = async (prefix, transaction) => {
  const likePrefix = `${prefix || ''}%`;
  const rows = await SalesInvoice.findAll({
    attributes: ['invoiceNumber'],
    where: { invoiceNumber: { [Op.like]: likePrefix } },
    transaction
  });

  const regex = new RegExp(`^${escapeRegex(prefix || '')}(\\d+)$`);
  let maxNumber = null;
  rows.forEach(row => {
    const invoiceNumber = row.invoiceNumber || '';
    const match = invoiceNumber.match(regex);
    if (match) {
      const value = parseInt(match[1], 10);
      if (Number.isFinite(value)) {
        maxNumber = maxNumber === null ? value : Math.max(maxNumber, value);
      }
    }
  });

  return maxNumber;
};

const generateGasSaleInvoiceNumber = async (transaction) => {
  const settings = await getCompanySettingsRow(transaction);
  const prefix = settings.gasSaleInvoicePrefix;
  const nextNumber = parseInt(settings.gasSaleInvoiceNextNumber, 10);
  const padding = parseInt(settings.gasSaleInvoicePadding, 10);

  if (prefix === null || prefix === undefined || !Number.isFinite(nextNumber)) {
    throw new Error('Gas sale invoice series is not configured. Please contact Super Admin.');
  }

  const invoiceNumber = formatGasInvoiceNumber(prefix, nextNumber, padding);
  if (!invoiceNumber) {
    throw new Error('Invalid gas sale invoice series configuration.');
  }

  const existing = await SalesInvoice.findOne({
    where: { invoiceNumber },
    transaction
  });
  if (existing) {
    throw new Error('Gas sale invoice series conflicts with existing invoice numbers. Please update the series.');
  }

  await settings.update({
    gasSaleInvoiceNextNumber: nextNumber + 1
  }, { transaction });

  return invoiceNumber;
};

const hasConfiguredInvoiceSeries = (settings) => (
  settings?.gasSaleInvoicePrefix !== null &&
  settings?.gasSaleInvoicePrefix !== undefined &&
  Number.isFinite(parseInt(settings?.gasSaleInvoiceNextNumber, 10))
);

const buildCustomerRateMap = async (customerId, transaction) => {
  if (!customerId) return new Map();
  await ensureCustomerItemRateSchema(sequelize, CustomerItemRate);
  const rates = await CustomerItemRate.findAll({
    where: { customerId },
    transaction
  });
  const map = new Map();
  rates.forEach(rate => {
    const value = parseFloat(rate.rate);
    const key = buildCustomerRateLookupKey(rate.itemType, rate.itemId);
    if (key && Number.isFinite(value)) {
      map.set(key, value);
    }
  });
  return map;
};

const getConfiguredItemRate = (rateMap, saleType, productId) => {
  const key = buildCustomerRateLookupKey(saleType, productId);
  if (!key) return null;

  const rate = rateMap.get(key);
  return Number.isFinite(rate) && rate > 0 ? rate : null;
};

const buildEmployeeGasAvailability = async (employeeId, options = {}) => {
  const { excludeInvoiceId, transaction } = options;
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
    where: { itemType: 'Gas' },
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
    where: { itemType: 'Gas' },
    group: ['productId'],
    transaction
  });

  const invoiceWhere = {
    employeeId,
    status: { [Op.notIn]: ['cancelled', 'deleted'] }
  };
  if (excludeInvoiceId) {
    invoiceWhere.id = { [Op.ne]: excludeInvoiceId };
  }

  const soldRows = await SalesInvoiceItem.findAll({
    attributes: [
      'productId',
      [sequelize.fn('SUM', sequelize.col('SalesInvoiceItem.quantity')), 'totalQty']
    ],
    where: { saleType: 'Gas' },
    include: [{
      model: SalesInvoice,
      as: 'invoice',
      attributes: [],
      where: invoiceWhere
    }],
    group: ['productId'],
    transaction
  });

  const map = new Map();

  const applyRows = (rows, direction) => {
    rows.forEach(row => {
      const pid = row.productId;
      const qty = parseInt(row.get('totalQty'), 10) || 0;
      const prev = map.get(pid) || 0;
      map.set(pid, prev + direction * qty);
    });
  };

  applyRows(assignRows, 1);
  applyRows(returnRows, -1);
  applyRows(soldRows, -1);

  return map;
};

const applyInventoryUpdate = async ({
  inventoryItem,
  quantityAfter,
  sourceModule,
  sourceAction,
  sourceId,
  sourceRef,
  actorUserId,
  notes,
  transaction
}) => {
  const beforeQty = inventoryItem.stockQuantity || 0;
  const afterQty = Math.max(0, quantityAfter);
  await inventoryItem.update({ stockQuantity: afterQty }, { transaction });
  await logInventoryMutation({
    inventoryItem,
    quantityBefore: beforeQty,
    quantityAfter: afterQty,
    sourceModule,
    sourceAction,
    sourceId,
    sourceRef,
    actorUserId,
    notes
  }, transaction);
};

const applySaleInventoryEffect = async ({
  item,
  direction,
  transaction,
  sourceModule,
  sourceAction,
  sourceId,
  sourceRef,
  actorUserId
}) => {
  const qty = parseInt(item.quantity || 0, 10) || 0;
  if (!qty || !item.saleType) return;

  if (item.saleType === 'Gas') {
    const fullCylinderInventory = await InventoryItem.findOne({
      where: {
        id: item.inventoryItemId,
        inventoryCategory: 'Full Cylinder'
      },
      transaction
    });

    if (!fullCylinderInventory) {
      return;
    }

    const fullBefore = fullCylinderInventory.stockQuantity || 0;
    const fullAfter = direction === 1 ? (fullBefore - qty) : (fullBefore + qty);
    await fullCylinderInventory.update({
      stockQuantity: Math.max(0, fullAfter),
      totalSold: direction === 1 ? fullCylinderInventory.totalSold + qty : fullCylinderInventory.totalSold,
      lastSaleDate: direction === 1 ? new Date() : fullCylinderInventory.lastSaleDate
    }, { transaction });

    await logInventoryMutation({
      inventoryItem: fullCylinderInventory,
      quantityBefore: fullBefore,
      quantityAfter: Math.max(0, fullAfter),
      sourceModule,
      sourceAction,
      sourceId,
      sourceRef,
      actorUserId,
      notes: direction === 1 ? 'Gas sale deducted full cylinder' : 'Gas sale reversal added full cylinder'
    }, transaction);

    let emptyCylinderInventory = await InventoryItem.findOne({
      where: {
        productId: fullCylinderInventory.productId,
        inventoryCategory: 'Empty Cylinder'
      },
      transaction
    });

    if (!emptyCylinderInventory && direction === 1) {
      emptyCylinderInventory = await InventoryItem.create({
        productId: fullCylinderInventory.productId,
        inventoryCategory: 'Empty Cylinder',
        stockQuantity: 0,
        totalPurchased: 0,
        totalSold: 0
      }, { transaction });
    }

    if (!emptyCylinderInventory) {
      return;
    }

    const emptyBefore = emptyCylinderInventory.stockQuantity || 0;
    const emptyAfter = direction === 1 ? (emptyBefore + qty) : (emptyBefore - qty);
    if (direction === -1 && emptyAfter < 0) {
      throw new Error('Insufficient empty cylinders to reverse gas sale');
    }

    await emptyCylinderInventory.update({
      stockQuantity: emptyAfter,
      lastPurchaseDate: direction === 1 ? new Date() : emptyCylinderInventory.lastPurchaseDate
    }, { transaction });

    await logInventoryMutation({
      inventoryItem: emptyCylinderInventory,
      quantityBefore: emptyBefore,
      quantityAfter: emptyAfter,
      sourceModule,
      sourceAction,
      sourceId,
      sourceRef,
      actorUserId,
      notes: direction === 1 ? 'Gas sale created empty cylinder' : 'Gas sale reversal removed empty cylinder'
    }, transaction);
  } else if (item.saleType === 'Full Cylinder') {
    const inventoryItem = await InventoryItem.findOne({
      where: {
        productId: item.productId,
        inventoryCategory: 'Full Cylinder'
      },
      transaction
    });
    if (!inventoryItem) return;

    const beforeQty = inventoryItem.stockQuantity || 0;
    const afterQty = direction === 1 ? (beforeQty - qty) : (beforeQty + qty);
    await inventoryItem.update({
      stockQuantity: Math.max(0, afterQty),
      totalSold: direction === 1 ? inventoryItem.totalSold + qty : inventoryItem.totalSold,
      lastSaleDate: direction === 1 ? new Date() : inventoryItem.lastSaleDate
    }, { transaction });

    await logInventoryMutation({
      inventoryItem,
      quantityBefore: beforeQty,
      quantityAfter: Math.max(0, afterQty),
      sourceModule,
      sourceAction,
      sourceId,
      sourceRef,
      actorUserId,
      notes: direction === 1 ? 'Full cylinder sale' : 'Full cylinder sale reversal'
    }, transaction);
  } else if (item.saleType === 'Empty Cylinder') {
    const inventoryItem = await InventoryItem.findOne({
      where: {
        productId: item.productId,
        inventoryCategory: 'Empty Cylinder'
      },
      transaction
    });
    if (!inventoryItem) return;

    const beforeQty = inventoryItem.stockQuantity || 0;
    const afterQty = direction === 1 ? (beforeQty - qty) : (beforeQty + qty);
    await inventoryItem.update({
      stockQuantity: Math.max(0, afterQty),
      totalSold: direction === 1 ? inventoryItem.totalSold + qty : inventoryItem.totalSold,
      lastSaleDate: direction === 1 ? new Date() : inventoryItem.lastSaleDate
    }, { transaction });

    await logInventoryMutation({
      inventoryItem,
      quantityBefore: beforeQty,
      quantityAfter: Math.max(0, afterQty),
      sourceModule,
      sourceAction,
      sourceId,
      sourceRef,
      actorUserId,
      notes: direction === 1 ? 'Empty cylinder sale' : 'Empty cylinder sale reversal'
    }, transaction);
  } else if (item.saleType === 'Tool') {
    const inventoryItem = await InventoryItem.findOne({
      where: {
        productId: item.productId,
        inventoryCategory: 'Tool'
      },
      transaction
    });
    if (!inventoryItem) return;

    const beforeQty = inventoryItem.stockQuantity || 0;
    const afterQty = direction === 1 ? (beforeQty - qty) : (beforeQty + qty);
    await inventoryItem.update({
      stockQuantity: Math.max(0, afterQty),
      totalSold: direction === 1 ? inventoryItem.totalSold + qty : inventoryItem.totalSold,
      lastSaleDate: direction === 1 ? new Date() : inventoryItem.lastSaleDate
    }, { transaction });

    await logInventoryMutation({
      inventoryItem,
      quantityBefore: beforeQty,
      quantityAfter: Math.max(0, afterQty),
      sourceModule,
      sourceAction,
      sourceId,
      sourceRef,
      actorUserId,
      notes: direction === 1 ? 'Tool sale' : 'Tool sale reversal'
    }, transaction);
  }
};

const isRetryableDeleteError = (error) => {
  const message = String(error?.message || '').toLowerCase();
  const parentMessage = String(error?.parent?.message || '').toLowerCase();
  return (
    message.includes('sqlite_busy') ||
    message.includes('database is locked') ||
    parentMessage.includes('sqlite_busy') ||
    parentMessage.includes('database is locked') ||
    error?.name === 'SequelizeTimeoutError'
  );
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// @desc    Get all sales invoices
// @route   GET /api/sales-invoices
// @access  Private
exports.getAllInvoices = async (req, res) => {
  try {
    await ensureSalesInvoiceSchema();
    const { status, customerId, startDate, endDate, compact, includeItems } = req.query;
    const shouldIncludeItems = !(
      String(compact).toLowerCase() === '1' ||
      String(compact).toLowerCase() === 'true' ||
      String(includeItems).toLowerCase() === '0' ||
      String(includeItems).toLowerCase() === 'false'
    );
    const where = { status: { [Op.ne]: 'deleted' } };

    if (status) where.status = status;
    if (customerId) where.customerId = customerId;
    if (req.user.role === 'employee') {
      where.employeeId = req.user.id;
    }
    if (startDate && endDate) {
      const range = buildUaeDateRange(startDate, endDate);
      if (range) {
        where.invoiceDate = {
          [Op.between]: [range.start, range.end]
        };
      }
    }

    const include = [
      {
        model: Customer,
        as: 'customer',
        attributes: ['id', 'name', 'customerCode', 'phone']
      },
      {
        model: User,
        as: 'employee',
        attributes: ['id', 'fullName', 'email']
      }
    ];
    if (shouldIncludeItems) {
      include.push({
        model: SalesInvoiceItem,
        as: 'items',
        include: [
          {
            model: Cylinder,
            as: 'cylinder',
            attributes: ['id', 'cylinderNumber', 'cylinderType']
          }
        ]
      });
    }

    const invoices = await SalesInvoice.findAll({
      where,
      include,
      order: [['invoiceDate', 'DESC']]
    });

    res.status(200).json({
      success: true,
      count: invoices.length,
      data: invoices
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Get single sales invoice
// @route   GET /api/sales-invoices/:id
// @access  Private
exports.getInvoice = async (req, res) => {
  try {
    await ensureSalesInvoiceSchema();
    const invoice = await SalesInvoice.findByPk(req.params.id, {
      include: [
        {
          model: Customer,
          as: 'customer'
        },
        {
          model: User,
          as: 'employee',
          attributes: ['id', 'fullName', 'email', 'signature']
        },
        {
          model: SalesInvoiceItem,
          as: 'items',
          include: [
            {
              model: Cylinder,
              as: 'cylinder'
            }
          ]
        }
      ]
    });

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: 'Invoice not found'
      });
    }
    if (req.user.role === 'employee' && invoice.employeeId !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access this invoice'
      });
    }

    res.status(200).json({
      success: true,
      data: invoice
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Get Gas Sale Invoice numbering series
// @route   GET /api/sales-invoices/gas-series
// @access  Private
exports.getGasInvoiceSeries = async (req, res) => {
  try {
    await ensureCompanySettingsGasSchema();
    const settings = await CompanySettings.findOne();
    const prefix = settings?.gasSaleInvoicePrefix ?? null;
    const nextNumber = settings?.gasSaleInvoiceNextNumber ?? null;
    const padding = settings?.gasSaleInvoicePadding ?? null;
    const configured = prefix !== null && prefix !== undefined && Number.isFinite(parseInt(nextNumber, 10));
    const preview = configured
      ? formatGasInvoiceNumber(prefix, nextNumber, padding)
      : null;

    res.status(200).json({
      success: true,
      data: {
        configured,
        prefix,
        nextNumber,
        padding,
        preview
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Set/Update Gas Sale Invoice numbering series
// @route   PUT /api/sales-invoices/gas-series
// @access  Private (Super Admin)
exports.setGasInvoiceSeries = async (req, res) => {
  const t = await sequelize.transaction();

  try {
    if (req.user.role !== 'super_admin') {
      await t.rollback();
      return res.status(403).json({
        success: false,
        message: 'Only Super Admin can set invoice series'
      });
    }

    const { startingNumber } = req.body || {};
    const parsed = parseGasInvoiceStart(startingNumber);
    if (!parsed) {
      await t.rollback();
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid starting invoice number (e.g., INV-1001)'
      });
    }

    const settings = await getCompanySettingsRow(t);
    const maxExisting = await findMaxInvoiceNumberForPrefix(parsed.prefix, t);
    if (maxExisting !== null && maxExisting >= parsed.nextNumber) {
      await t.rollback();
      const maxLabel = formatGasInvoiceNumber(parsed.prefix, maxExisting, parsed.padding);
      return res.status(400).json({
        success: false,
        message: `Starting number must be greater than existing max (${maxLabel}).`
      });
    }

    const initialInvoice = formatGasInvoiceNumber(parsed.prefix, parsed.nextNumber, parsed.padding);
    const existing = await SalesInvoice.findOne({
      where: { invoiceNumber: initialInvoice },
      transaction: t
    });
    if (existing) {
      await t.rollback();
      return res.status(400).json({
        success: false,
        message: 'Starting number already exists. Please choose a higher number.'
      });
    }

    await settings.update({
      gasSaleInvoicePrefix: parsed.prefix,
      gasSaleInvoiceNextNumber: parsed.nextNumber,
      gasSaleInvoicePadding: parsed.padding
    }, { transaction: t });

    await t.commit();

    res.status(200).json({
      success: true,
      data: {
        prefix: parsed.prefix,
        nextNumber: parsed.nextNumber,
        padding: parsed.padding,
        preview: formatGasInvoiceNumber(parsed.prefix, parsed.nextNumber, parsed.padding)
      }
    });
  } catch (error) {
    await t.rollback();
    res.status(500).json({
      success: false,
      message: 'Failed to set invoice series',
      error: error.message
    });
  }
};

// @desc    Create sales invoice
// @route   POST /api/sales-invoices
// @access  Private
exports.createInvoice = async (req, res) => {
  const t = await sequelize.transaction();

  try {
    await ensureSalesInvoiceSchema();
    const { customerId, invoiceDate, dueDate, items, status, deliveryCharges, paymentMethod, paymentStatus, paidAmount, balanceAmount, employeeSignature, receivedBySignature, receivedByName, notes } = req.body;
    const resolvedInvoiceDate = parseUaeDateInput(invoiceDate) || makeUaeDateFromKey(toUaeDateKey());
    const resolvedDueDate = parseUaeDateInput(dueDate) || null;

    const rateMap = await buildCustomerRateMap(customerId, t);
    const productIds = (items || []).map(item => item.productId).filter(Boolean);
    const products = productIds.length > 0
      ? await Product.findAll({ where: { id: productIds }, transaction: t, attributes: ['id', 'leastSellingPrice', 'productType'] })
      : [];
    const productMap = new Map(products.map(p => [p.id, p]));

    const normalizedItems = [];
    for (const item of items || []) {
      const productId = item.productId || null;
      const configuredRate = productId ? getConfiguredItemRate(rateMap, item.saleType, productId) : null;
      const leastPrice = productId && productMap.has(productId)
        ? parseFloat(productMap.get(productId).leastSellingPrice)
        : null;
      const minAllowedPrice = Number.isFinite(configuredRate) && configuredRate > 0
        ? configuredRate
        : (Number.isFinite(leastPrice) && leastPrice > 0 ? leastPrice : 0);
      let unitPrice = parseFloat(item.unitPrice);

      if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
        if (minAllowedPrice > 0) {
          unitPrice = minAllowedPrice;
        } else if (productId && productMap.has(productId)) {
          unitPrice = parseFloat(productMap.get(productId).leastSellingPrice);
        }
      }

      if (minAllowedPrice > 0 && Number.isFinite(unitPrice) && unitPrice < minAllowedPrice) {
        await t.rollback();
        const fixedRateNote = Number.isFinite(configuredRate)
          ? `Customer item rate: AED ${configuredRate.toFixed(2)}. `
          : '';
        const leastPriceNote = Number.isFinite(leastPrice)
          ? `Product rate: AED ${leastPrice.toFixed(2)}.`
          : '';
        return res.status(400).json({
          success: false,
          message: `${fixedRateNote}${leastPriceNote} Price cannot be lower than AED ${minAllowedPrice.toFixed(2)}.`
        });
      }

      if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
        await t.rollback();
        return res.status(400).json({
          success: false,
          message: 'Invalid item price'
        });
      }

      normalizedItems.push({ ...item, unitPrice: parseFloat(unitPrice.toFixed(2)) });
    }

    if (req.user.role === 'employee') {
      const invalidType = (items || []).find(item => item.saleType !== 'Gas');
      if (invalidType) {
        await t.rollback();
        return res.status(403).json({
          success: false,
          message: 'Employees can create Gas invoices only'
        });
      }

      for (const item of normalizedItems) {
        const product = productMap.get(item.productId);
        if (!product || product.productType !== 'Gas') {
          await t.rollback();
          return res.status(400).json({
            success: false,
            message: 'Gas invoices must use Gas products only'
          });
        }
      }

      const availability = await buildEmployeeGasAvailability(req.user.id, { transaction: t });
      const remaining = new Map(availability);
      for (const item of normalizedItems) {
        const qty = parseInt(item.quantity || 0, 10) || 0;
        const available = remaining.get(item.productId) || 0;
        if (qty > available) {
          await t.rollback();
          return res.status(400).json({
            success: false,
            message: `Insufficient assigned gas stock. Available: ${available}`
          });
        }
        remaining.set(item.productId, Math.max(0, available - qty));
      }
    }

    const effectiveStatus = status || 'active';

    // Generate invoice number:
    // if configurable series is set, use it for ALL sale types.
    // otherwise fallback to legacy INV000001 sequence.
    let invoiceNumber = null;
    const settings = await getCompanySettingsRow(t);
    if (hasConfiguredInvoiceSeries(settings)) {
      try {
        invoiceNumber = await generateGasSaleInvoiceNumber(t);
      } catch (seriesError) {
        await t.rollback();
        return res.status(400).json({
          success: false,
          message: seriesError.message || 'Invoice series is not configured'
        });
      }
    } else {
      const count = await SalesInvoice.count({ transaction: t });
      invoiceNumber = `INV${String(count + 1).padStart(6, '0')}`;
    }

    // Calculate totals with automatic 5% VAT for UAE
    const VAT_RATE = 0.05; // 5% VAT for UAE
    let subtotal = 0;
    let totalDiscount = 0;

    normalizedItems.forEach(item => {
      subtotal += item.quantity * item.unitPrice;
      totalDiscount += item.discount || 0;
    });

    // Delivery charges (default to 0 if not provided)
    const delivery = parseFloat(deliveryCharges) || 0;

    // Calculate VAT automatically (5% of subtotal + delivery charges after discount)
    const taxableAmount = subtotal - totalDiscount + delivery;
    const totalTax = taxableAmount * VAT_RATE;
    const total = taxableAmount + totalTax;

    // Determine payment amounts
    const actualPaidAmount = paymentMethod === 'cash' ? total : (parseFloat(paidAmount) || 0);
    const actualBalanceAmount = total - actualPaidAmount;
    const actualPaymentStatus = paymentMethod === 'cash' ? 'paid' : (paymentStatus || 'pending');

    // Create invoice
    const isAuthorizedRole = ['manager', 'super_admin'].includes(req.user.role);
    const authorizedBySignature = isAuthorizedRole ? (req.user.signature || null) : null;
    const authorizedByName = isAuthorizedRole ? (req.user.fullName || req.user.username || null) : null;
    const authorizedById = isAuthorizedRole ? req.user.id : null;

    const invoice = await SalesInvoice.create({
      invoiceNumber,
      customerId,
      employeeId: req.user.id,
      invoiceDate: resolvedInvoiceDate,
      dueDate: resolvedDueDate,
      subtotal,
      tax: totalTax,
      discount: totalDiscount,
      deliveryCharges: delivery,
      total,
      paidAmount: actualPaidAmount,
      balanceAmount: actualBalanceAmount,
      status: effectiveStatus,
      paymentMethod: paymentMethod || null,
      paymentStatus: actualPaymentStatus,
      employeeSignature: employeeSignature || req.user.signature,
      receivedBySignature,
      receivedByName,
      authorizedBySignature,
      authorizedByName,
      authorizedById,
      notes
    }, { transaction: t });

    // Create invoice items and update inventory
    for (const item of normalizedItems) {
      const totalPrice = (item.quantity * item.unitPrice) - (item.discount || 0) + (item.tax || 0);
      
      // Convert empty string to null for cylinderId
      const cylinderId = item.cylinderId && item.cylinderId.trim() !== '' ? item.cylinderId : null;
      
      await SalesInvoiceItem.create({
        invoiceId: invoice.id,
        cylinderId: cylinderId,
        productId: item.productId || null,
        saleType: item.saleType || null,
        inventoryItemId: item.inventoryItemId || null,
        productName: item.productName,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discount: item.discount || 0,
        tax: item.tax || 0,
        totalPrice,
        notes: item.notes
      }, { transaction: t });

      // Update inventory based on sale type
      if (effectiveStatus === 'active' && item.saleType && req.user.role !== 'employee') {
        await applySaleInventoryEffect({
          item,
          direction: 1,
          transaction: t,
          sourceModule: 'sales_invoice',
          sourceAction: 'create',
          sourceId: invoice.id,
          sourceRef: invoice.invoiceNumber,
          actorUserId: req.user?.id
        });
      }

      // Legacy: Update cylinder status if cylinderId provided
      if (effectiveStatus === 'active' && cylinderId) {
        const cylinder = await Cylinder.findByPk(cylinderId, { transaction: t });
        if (cylinder) {
          await cylinder.update({ 
            status: 'rented'
          }, { transaction: t });
        }
      }
    }

    // Update customer balance only for credit (pending) invoices
    // Cash payments are settled immediately, so no balance increase
    if (effectiveStatus === 'active' && actualPaymentStatus === 'pending') {
      const customer = await Customer.findByPk(customerId, { transaction: t });
      if (customer) {
        await customer.update({
          currentBalance: parseFloat(customer.currentBalance) + parseFloat(actualBalanceAmount)
        }, { transaction: t });
      }
    }

    await t.commit();

    const createdInvoiceDateKey = effectiveStatus === 'active'
      ? toUaeDateKey(new Date(resolvedInvoiceDate || invoice.invoiceDate))
      : null;
    await rebuildDailyStockForInvoice({
      newDateKey: createdInvoiceDateKey,
      action: 'create',
      invoiceNumber: invoice.invoiceNumber
    });
  
    // Fetch complete invoice (best effort; do not fail creation if this lookup fails)
    let completeInvoice = null;
    try {
      completeInvoice = await SalesInvoice.findByPk(invoice.id, {
        include: [
          { model: Customer, as: 'customer' },
          { model: User, as: 'employee' },
          { model: SalesInvoiceItem, as: 'items', include: [{ model: Cylinder, as: 'cylinder' }] }
        ]
      });
    } catch (fetchError) {
      console.error('Error fetching created invoice details:', fetchError);
    }
  
    res.status(201).json({
      success: true,
      data: completeInvoice || invoice
    });
  } catch (error) {
    await t.rollback();
    console.error('Error creating invoice:', error);
    console.error('Error details:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to create invoice',
      error: error.message
    });
  }
};

// @desc    Update sales invoice
// @route   PUT /api/sales-invoices/:id
// @access  Private
exports.updateInvoice = async (req, res) => {
  const t = await sequelize.transaction();

  try {
    if (req.user.role !== 'super_admin') {
      await t.rollback();
      return res.status(403).json({
        success: false,
        message: 'Only Super Admin can edit invoices'
      });
    }
    await ensureSalesInvoiceSchema();
    const invoice = await SalesInvoice.findByPk(req.params.id, { transaction: t });

    if (!invoice) {
      await t.rollback();
      return res.status(404).json({
        success: false,
        message: 'Invoice not found'
      });
    }
    const invoiceCreator = await User.findByPk(invoice.employeeId, {
      attributes: ['id', 'role', 'fullName'],
      transaction: t
    });
    const isEmployeeOwnedInvoice = invoiceCreator?.role === 'employee';

    if (req.user.role === 'employee' && invoice.employeeId !== req.user.id) {
      await t.rollback();
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this invoice'
      });
    }

    const { customerId, invoiceDate, dueDate, items, status, deliveryCharges, paymentMethod, paymentStatus, paidAmount, balanceAmount, employeeSignature, receivedBySignature, receivedByName, notes } = req.body;
    const resolvedInvoiceDate = parseUaeDateInput(invoiceDate);
    const resolvedDueDate = parseUaeDateInput(dueDate);
    const oldTotal = parseFloat(invoice.total);
    const oldCustomerId = invoice.customerId;
    const oldStatus = invoice.status;
    const newStatus = status || invoice.status;
    const oldPaymentStatus = invoice.paymentStatus;
    const oldBalanceAmount = parseFloat(invoice.balanceAmount) || 0;
    const oldInvoiceDateKey = invoice.invoiceDate ? toUaeDateKey(new Date(invoice.invoiceDate)) : null;
    const nextInvoiceDateValue = resolvedInvoiceDate || invoice.invoiceDate;
    const newInvoiceDateKey = nextInvoiceDateValue ? toUaeDateKey(new Date(nextInvoiceDateValue)) : null;

    const isAuthorizedRole = ['manager', 'super_admin'].includes(req.user.role);
    const authorizedBySignature = isAuthorizedRole
      ? (invoice.authorizedBySignature || req.user.signature || null)
      : invoice.authorizedBySignature;
    const authorizedByName = isAuthorizedRole
      ? (invoice.authorizedByName || req.user.fullName || req.user.username || null)
      : invoice.authorizedByName;
    const authorizedById = isAuthorizedRole
      ? (invoice.authorizedById || req.user.id)
      : invoice.authorizedById;

    // If items are being updated, recalculate totals
    if (items && items.length > 0) {
      const existingItems = await SalesInvoiceItem.findAll({
        where: { invoiceId: invoice.id },
        transaction: t
      });
      const effectiveCustomerId = customerId || invoice.customerId;
      const rateMap = await buildCustomerRateMap(effectiveCustomerId, t);
      const productIds = items.map(item => item.productId).filter(Boolean);
      const products = productIds.length > 0
        ? await Product.findAll({ where: { id: productIds }, transaction: t, attributes: ['id', 'leastSellingPrice', 'productType'] })
        : [];
      const productMap = new Map(products.map(p => [p.id, p]));

      const normalizedItems = [];
      for (const item of items) {
        const productId = item.productId || null;
        const configuredRate = productId ? getConfiguredItemRate(rateMap, item.saleType, productId) : null;
        const leastPrice = productId && productMap.has(productId)
          ? parseFloat(productMap.get(productId).leastSellingPrice)
          : null;
        const minAllowedPrice = Number.isFinite(configuredRate) && configuredRate > 0
          ? configuredRate
          : (Number.isFinite(leastPrice) && leastPrice > 0 ? leastPrice : 0);
        let unitPrice = parseFloat(item.unitPrice);

        if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
          if (minAllowedPrice > 0) {
            unitPrice = minAllowedPrice;
          } else if (productId && productMap.has(productId)) {
            unitPrice = parseFloat(productMap.get(productId).leastSellingPrice);
          }
        }

        if (minAllowedPrice > 0 && Number.isFinite(unitPrice) && unitPrice < minAllowedPrice) {
          await t.rollback();
          const fixedRateNote = Number.isFinite(configuredRate)
            ? `Customer item rate: AED ${configuredRate.toFixed(2)}. `
            : '';
          const leastPriceNote = Number.isFinite(leastPrice)
            ? `Product rate: AED ${leastPrice.toFixed(2)}.`
            : '';
          return res.status(400).json({
            success: false,
            message: `${fixedRateNote}${leastPriceNote} Price cannot be lower than AED ${minAllowedPrice.toFixed(2)}.`
          });
        }

        if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
          await t.rollback();
          return res.status(400).json({
            success: false,
            message: 'Invalid item price'
          });
        }

        normalizedItems.push({ ...item, unitPrice: parseFloat(unitPrice.toFixed(2)) });
      }

      if (req.user.role === 'employee' || isEmployeeOwnedInvoice) {
        const invalidType = items.find(item => item.saleType !== 'Gas');
        if (invalidType) {
          await t.rollback();
          return res.status(403).json({
            success: false,
            message: 'Employee-created invoices can contain Gas items only'
          });
        }

        for (const item of normalizedItems) {
          const product = productMap.get(item.productId);
          if (!product || product.productType !== 'Gas') {
            await t.rollback();
            return res.status(400).json({
              success: false,
              message: 'Gas invoices must use Gas products only'
            });
          }
        }

        const referenceEmployeeId = isEmployeeOwnedInvoice ? invoice.employeeId : req.user.id;
        const availability = await buildEmployeeGasAvailability(referenceEmployeeId, { excludeInvoiceId: invoice.id, transaction: t });
        const remaining = new Map(availability);
        for (const item of normalizedItems) {
          const qty = parseInt(item.quantity || 0, 10) || 0;
          const available = remaining.get(item.productId) || 0;
          if (qty > available) {
            await t.rollback();
            return res.status(400).json({
              success: false,
              message: `Insufficient assigned gas stock. Available: ${available}`
            });
          }
          remaining.set(item.productId, Math.max(0, available - qty));
        }
      }

      // Calculate new totals with automatic 5% VAT for UAE
      const VAT_RATE = 0.05;
      let subtotal = 0;
      let totalDiscount = 0;

      normalizedItems.forEach(item => {
        subtotal += item.quantity * item.unitPrice;
        totalDiscount += item.discount || 0;
      });

      // Delivery charges
      const delivery = parseFloat(deliveryCharges) || parseFloat(invoice.deliveryCharges) || 0;

      // Calculate VAT automatically (5% of subtotal + delivery charges after discount)
      const taxableAmount = subtotal - totalDiscount + delivery;
      const totalTax = taxableAmount * VAT_RATE;
      const newTotal = taxableAmount + totalTax;

      // Reverse inventory and cylinder status for previous active items
      if (oldStatus === 'active') {
        for (const oldItem of existingItems) {
          if (oldItem.cylinderId) {
            const cylinder = await Cylinder.findByPk(oldItem.cylinderId, { transaction: t });
            if (cylinder && cylinder.status === 'rented') {
              await cylinder.update({ status: 'filled' }, { transaction: t });
            }
          }
          if (!isEmployeeOwnedInvoice) {
            await applySaleInventoryEffect({
              item: oldItem,
              direction: -1,
              transaction: t,
              sourceModule: 'sales_invoice',
              sourceAction: 'update_reversal',
              sourceId: invoice.id,
              sourceRef: invoice.invoiceNumber,
              actorUserId: req.user?.id
            });
          }
        }
      }

      // Delete old invoice items
      await SalesInvoiceItem.destroy({
        where: { invoiceId: invoice.id },
        transaction: t
      });

      // Create new invoice items
      for (const item of normalizedItems) {
        const totalPrice = (item.quantity * item.unitPrice) - (item.discount || 0) + (item.tax || 0);
        
        // Convert empty strings to null for foreign key fields
        const cylinderId = item.cylinderId && item.cylinderId.trim() !== '' ? item.cylinderId : null;
        const productId = item.productId && item.productId.trim() !== '' ? item.productId : null;
        const inventoryItemId = item.inventoryItemId && item.inventoryItemId.trim() !== '' ? item.inventoryItemId : null;
        
        await SalesInvoiceItem.create({
          invoiceId: invoice.id,
          cylinderId: cylinderId,
          productId: productId,
          saleType: item.saleType || null,
          inventoryItemId: inventoryItemId,
          productName: item.productName,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          discount: item.discount || 0,
          tax: item.tax || 0,
          totalPrice,
          notes: item.notes
        }, { transaction: t });

        // Update cylinder status if invoice is active
        if (newStatus === 'active' && cylinderId) {
          const cylinder = await Cylinder.findByPk(cylinderId, { transaction: t });
          if (cylinder) {
            await cylinder.update({ status: 'rented' }, { transaction: t });
          }
        }

        // Apply inventory changes for new active items
        if (newStatus === 'active' && item.saleType && !isEmployeeOwnedInvoice) {
          await applySaleInventoryEffect({
            item,
            direction: 1,
            transaction: t,
            sourceModule: 'sales_invoice',
            sourceAction: 'update_apply',
            sourceId: invoice.id,
            sourceRef: invoice.invoiceNumber,
            actorUserId: req.user?.id
          });
        }
      }

      // Determine new payment amounts (zero-safe; do not treat 0 as missing)
      const effectivePaymentMethod = paymentMethod || invoice.paymentMethod || null;
      const parsedPaidAmount = parseFloat(paidAmount);
      const hasRequestedPaidAmount = paidAmount !== undefined && paidAmount !== null && paidAmount !== '' && Number.isFinite(parsedPaidAmount);
      const invoicePaidAmount = Number.isFinite(parseFloat(invoice.paidAmount)) ? parseFloat(invoice.paidAmount) : 0;
      const requestedPaymentStatus = typeof paymentStatus === 'string' && paymentStatus.trim() ? paymentStatus.trim() : null;

      const newPaidAmount = effectivePaymentMethod === 'cash'
        ? newTotal
        : (hasRequestedPaidAmount ? parsedPaidAmount : (paymentMethod ? 0 : invoicePaidAmount));
      const newBalanceAmount = Math.max(0, newTotal - newPaidAmount);
      const newPaymentStatus = effectivePaymentMethod === 'cash'
        ? 'paid'
        : (requestedPaymentStatus || (paymentMethod ? 'pending' : (invoice.paymentStatus || 'pending')));
      const nextCustomerId = customerId || invoice.customerId;

      // Keep customer currentBalance in sync with outstanding credit amount changes.
      const oldOutstanding = oldStatus === 'active' && oldPaymentStatus === 'pending' ? oldBalanceAmount : 0;
      const newOutstanding = newStatus === 'active' && newPaymentStatus === 'pending' ? newBalanceAmount : 0;
      if (oldCustomerId === nextCustomerId) {
        const diff = newOutstanding - oldOutstanding;
        if (Math.abs(diff) > 0.0001) {
          const customer = await Customer.findByPk(nextCustomerId, { transaction: t });
          if (customer) {
            await customer.update({
              currentBalance: parseFloat(customer.currentBalance || 0) + diff
            }, { transaction: t });
          }
        }
      } else {
        if (oldOutstanding > 0) {
          const oldCustomer = await Customer.findByPk(oldCustomerId, { transaction: t });
          if (oldCustomer) {
            await oldCustomer.update({
              currentBalance: parseFloat(oldCustomer.currentBalance || 0) - oldOutstanding
            }, { transaction: t });
          }
        }
        if (newOutstanding > 0) {
          const newCustomer = await Customer.findByPk(nextCustomerId, { transaction: t });
          if (newCustomer) {
            await newCustomer.update({
              currentBalance: parseFloat(newCustomer.currentBalance || 0) + newOutstanding
            }, { transaction: t });
          }
        }
      }

      // Update invoice with new calculations
      await invoice.update({
        customerId: nextCustomerId,
        invoiceDate: resolvedInvoiceDate || invoice.invoiceDate,
        dueDate: resolvedDueDate || invoice.dueDate,
        subtotal,
        tax: totalTax,
        discount: totalDiscount,
        deliveryCharges: delivery,
        total: newTotal,
        paidAmount: newPaidAmount,
        balanceAmount: newBalanceAmount,
        status: newStatus,
        paymentMethod: effectivePaymentMethod,
        paymentStatus: newPaymentStatus,
        employeeSignature: employeeSignature || invoice.employeeSignature,
        receivedBySignature: receivedBySignature || invoice.receivedBySignature,
        receivedByName: receivedByName || invoice.receivedByName,
        authorizedBySignature,
        authorizedByName,
        authorizedById,
        notes: notes || invoice.notes
      }, { transaction: t });
    } else {
      // Simple update without item changes
      // If changing from draft to active, update stock
      if (oldStatus === 'draft' && newStatus === 'active') {
        const items = await SalesInvoiceItem.findAll({
          where: { invoiceId: invoice.id },
          transaction: t
        });

        for (const item of items) {
          if (item.cylinderId) {
            const cylinder = await Cylinder.findByPk(item.cylinderId, { transaction: t });
            if (cylinder) {
              await cylinder.update({ status: 'rented' }, { transaction: t });
            }
          }
        }

        // Update customer balance
        const customer = await Customer.findByPk(invoice.customerId, { transaction: t });
        if (customer) {
          await customer.update({
            currentBalance: parseFloat(customer.currentBalance) + parseFloat(invoice.total)
          }, { transaction: t });
        }

        for (const item of items) {
          if (!isEmployeeOwnedInvoice) {
            await applySaleInventoryEffect({
              item,
              direction: 1,
              transaction: t,
              sourceModule: 'sales_invoice',
              sourceAction: 'activate',
              sourceId: invoice.id,
              sourceRef: invoice.invoiceNumber,
              actorUserId: req.user?.id
            });
          }
        }
      } else if (oldStatus === 'active' && newStatus !== 'active') {
        const items = await SalesInvoiceItem.findAll({
          where: { invoiceId: invoice.id },
          transaction: t
        });
        for (const item of items) {
          if (!isEmployeeOwnedInvoice) {
            await applySaleInventoryEffect({
              item,
              direction: -1,
              transaction: t,
              sourceModule: 'sales_invoice',
              sourceAction: 'deactivate',
              sourceId: invoice.id,
              sourceRef: invoice.invoiceNumber,
              actorUserId: req.user?.id
            });
          }
        }
      }

      const effectivePaymentMethod = paymentMethod || invoice.paymentMethod || null;
      const parsedPaidAmount = parseFloat(paidAmount);
      const hasRequestedPaidAmount = paidAmount !== undefined && paidAmount !== null && paidAmount !== '' && Number.isFinite(parsedPaidAmount);
      const invoicePaidAmount = Number.isFinite(parseFloat(invoice.paidAmount)) ? parseFloat(invoice.paidAmount) : 0;
      const requestedPaymentStatus = typeof paymentStatus === 'string' && paymentStatus.trim() ? paymentStatus.trim() : null;
      const invoiceTotal = parseFloat(invoice.total) || 0;
      const newPaidAmount = effectivePaymentMethod === 'cash'
        ? invoiceTotal
        : (hasRequestedPaidAmount ? parsedPaidAmount : (paymentMethod ? 0 : invoicePaidAmount));
      const newBalanceAmount = Math.max(0, invoiceTotal - newPaidAmount);
      const newPaymentStatus = effectivePaymentMethod === 'cash'
        ? 'paid'
        : (requestedPaymentStatus || (paymentMethod ? 'pending' : (invoice.paymentStatus || 'pending')));
      const nextCustomerId = customerId || invoice.customerId;

      const oldOutstanding = oldStatus === 'active' && oldPaymentStatus === 'pending' ? oldBalanceAmount : 0;
      const newOutstanding = newStatus === 'active' && newPaymentStatus === 'pending' ? newBalanceAmount : 0;
      if (oldCustomerId === nextCustomerId) {
        const diff = newOutstanding - oldOutstanding;
        if (Math.abs(diff) > 0.0001) {
          const customer = await Customer.findByPk(nextCustomerId, { transaction: t });
          if (customer) {
            await customer.update({
              currentBalance: parseFloat(customer.currentBalance || 0) + diff
            }, { transaction: t });
          }
        }
      } else {
        if (oldOutstanding > 0) {
          const oldCustomer = await Customer.findByPk(oldCustomerId, { transaction: t });
          if (oldCustomer) {
            await oldCustomer.update({
              currentBalance: parseFloat(oldCustomer.currentBalance || 0) - oldOutstanding
            }, { transaction: t });
          }
        }
        if (newOutstanding > 0) {
          const newCustomer = await Customer.findByPk(nextCustomerId, { transaction: t });
          if (newCustomer) {
            await newCustomer.update({
              currentBalance: parseFloat(newCustomer.currentBalance || 0) + newOutstanding
            }, { transaction: t });
          }
        }
      }

      await invoice.update({
        customerId: nextCustomerId,
        invoiceDate: resolvedInvoiceDate || invoice.invoiceDate,
        dueDate: resolvedDueDate || invoice.dueDate,
        paymentMethod: effectivePaymentMethod,
        paymentStatus: newPaymentStatus,
        paidAmount: newPaidAmount,
        balanceAmount: newBalanceAmount,
        status: newStatus,
        employeeSignature: employeeSignature || invoice.employeeSignature,
        receivedBySignature: receivedBySignature || invoice.receivedBySignature,
        receivedByName: receivedByName || invoice.receivedByName,
        authorizedBySignature,
        authorizedByName,
        authorizedById,
        notes: notes || invoice.notes
      }, { transaction: t });
    }

    await t.commit();

    const shouldRebuildDailyStock = oldStatus === 'active' || newStatus === 'active';
    if (shouldRebuildDailyStock) {
      await rebuildDailyStockForInvoice({
        oldDateKey: oldInvoiceDateKey,
        newDateKey: newInvoiceDateKey,
        action: 'update',
        invoiceNumber: invoice.invoiceNumber
      });
    }

    // Fetch updated invoice with all relations
    const updatedInvoice = await SalesInvoice.findByPk(invoice.id, {
      include: [
        { model: Customer, as: 'customer' },
        { model: User, as: 'employee', attributes: ['id', 'fullName', 'email', 'signature'] },
        { model: SalesInvoiceItem, as: 'items', include: [{ model: Cylinder, as: 'cylinder' }] }
      ]
    });

    res.status(200).json({
      success: true,
      data: updatedInvoice
    });
  } catch (error) {
    await t.rollback();
    console.error('Error updating invoice:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Delete sales invoice (with stock reversal)
// @route   DELETE /api/sales-invoices/:id
// @access  Private (Super Admin only can hard delete)
exports.deleteInvoice = async (req, res) => {
  if (req.user.role !== 'super_admin') {
    return res.status(403).json({
      success: false,
      message: 'Only Super Admin can delete invoices'
    });
  }

  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const t = await sequelize.transaction();
    try {
      const invoice = await SalesInvoice.findByPk(req.params.id, { transaction: t });

      if (!invoice) {
        await t.rollback();
        return res.status(404).json({
          success: false,
          message: 'Invoice not found'
        });
      }

      // Idempotent handling for repeated delete clicks/requests.
      if (invoice.status === 'deleted') {
        await t.rollback();
        return res.status(200).json({
          success: true,
          message: 'Invoice already deleted'
        });
      }
      const invoiceCreator = await User.findByPk(invoice.employeeId, {
        attributes: ['id', 'role', 'fullName'],
        transaction: t
      });
      const isEmployeeOwnedInvoice = invoiceCreator?.role === 'employee';

      // Reverse stock if invoice was active
      const shouldRebuildDailyStock = invoice.status === 'active';
      const affectedDateKey = invoice.invoiceDate ? toUaeDateKey(new Date(invoice.invoiceDate)) : null;

      if (invoice.status === 'active') {
        const items = await SalesInvoiceItem.findAll({
          where: { invoiceId: invoice.id },
          transaction: t
        });

        for (const item of items) {
          if (item.cylinderId) {
            const cylinder = await Cylinder.findByPk(item.cylinderId, { transaction: t });
            if (cylinder) {
              await cylinder.update({ status: 'available' }, { transaction: t });
            }
          }
          if (!isEmployeeOwnedInvoice) {
            await applySaleInventoryEffect({
              item,
              direction: -1,
              transaction: t,
              sourceModule: 'sales_invoice',
              sourceAction: 'delete',
              sourceId: invoice.id,
              sourceRef: invoice.invoiceNumber,
              actorUserId: req.user?.id
            });
          }
        }

        // Reverse customer balance
        const customer = await Customer.findByPk(invoice.customerId, { transaction: t });
        if (customer) {
          await customer.update({
            currentBalance: parseFloat(customer.currentBalance) - parseFloat(invoice.total)
          }, { transaction: t });
        }
      }

      // Mark as deleted
      await invoice.update({
        status: 'deleted',
        deletedAt: new Date(),
        deletedBy: req.user.id
      }, { transaction: t });

      await t.commit();

      if (shouldRebuildDailyStock && affectedDateKey) {
        await rebuildDailyStockForInvoice({
          oldDateKey: affectedDateKey,
          action: 'delete',
          invoiceNumber: invoice.invoiceNumber
        });
      }

      return res.status(200).json({
        success: true,
        message: 'Invoice deleted successfully and stock reversed'
      });
    } catch (error) {
      try {
        await t.rollback();
      } catch (rollbackError) {
        console.error('Rollback error while deleting invoice:', rollbackError);
      }

      const retryable = isRetryableDeleteError(error);
      if (retryable && attempt < maxAttempts) {
        await sleep(120 * attempt);
        continue;
      }

      console.error('Error deleting invoice:', error);
      if (retryable) {
        return res.status(503).json({
          success: false,
          message: 'Database is busy. Please retry in a moment.',
          error: error.message
        });
      }

      return res.status(500).json({
        success: false,
        message: 'Server error',
        error: error.message
      });
    }
  }
};

// @desc    Get sales statistics
// @route   GET /api/sales-invoices/stats
// @access  Private
exports.getSalesStats = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const where = { status: { [Op.in]: ['active', 'paid', 'partial'] } };

    if (startDate && endDate) {
      const range = buildUaeDateRange(startDate, endDate);
      if (range) {
        where.invoiceDate = {
          [Op.between]: [range.start, range.end]
        };
      }
    }

    const totalSales = await SalesInvoice.sum('total', { where });
    const totalInvoices = await SalesInvoice.count({ where });
    const paidInvoices = await SalesInvoice.count({ where: { ...where, paymentStatus: 'paid' } });
    const unpaidAmount = await SalesInvoice.sum('balanceAmount', { where });

    res.status(200).json({
      success: true,
      data: {
        totalSales: totalSales || 0,
        totalInvoices,
        paidInvoices,
        unpaidAmount: unpaidAmount || 0,
        averageSale: totalInvoices > 0 ? (totalSales / totalInvoices) : 0
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};
