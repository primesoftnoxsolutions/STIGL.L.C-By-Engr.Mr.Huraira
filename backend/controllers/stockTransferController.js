const { StockTransfer, StockTransferItem, InventoryItem, Product, User, Notification, sequelize } = require('../models');
const { Op } = require('sequelize');
const { logInventoryMutation, logProductMutation } = require('../utils/stockLogger');
const { toUaeDateKey, buildUaeDateRange, getUaeNowParts, buildUaeDateKey, addDaysToDateKey } = require('../utils/uaeTime');
const { queueDailyStockRebuildFromDate } = require('./reportController');
const { getAssignedStockQuantity } = require('../utils/assignedInventory');
const { isSuperAdminRole, isManagerRole, isEmployeeRole } = require('../utils/roles');

const ALLOWED_ITEM_TYPES = ['Empty Cylinder', 'Gas', 'Tool'];
let stockTransferStatusEnumReady = false;

const getDateKeyFromValue = (value) => {
  if (!value) return null;
  const resolved = value instanceof Date ? value : new Date(value);
  return Number.isNaN(resolved.getTime()) ? null : toUaeDateKey(resolved);
};

const rebuildDailyStockForTransferDate = async (dateValue, reason) => {
  const dateKey = getDateKeyFromValue(dateValue);
  if (!dateKey) return;

  try {
    await queueDailyStockRebuildFromDate(dateKey, { reason });
  } catch (error) {
    console.error(`[DAILY STOCK] Rebuild failed after ${reason}:`, error.message);
  }
};

const normalizeItemType = (value) => {
  if (!value) return '';
  const trimmed = String(value).trim();
  const lower = trimmed.toLowerCase();
  if (lower === 'empty cylinder') return 'Empty Cylinder';
  if (lower === 'gas') return 'Gas';
  if (lower === 'tool' || lower === 'tools') return 'Tool';
  return trimmed;
};

const normalizeComparableProductName = (value) => {
  if (!value) return '';
  const parts = String(value).trim().split(/\s+/);
  if (parts.length > 1 && /^(cylinder|gas|tool)$/i.test(parts[0])) {
    parts.shift();
  }
  return parts.join(' ')
    .replace(/[^a-z0-9\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
};

const stripLeadingProductType = (value) => {
  if (!value) return '';
  const parts = String(value).trim().split(/\s+/);
  if (parts.length > 1 && /^(cylinder|gas|tool)$/i.test(parts[0])) {
    parts.shift();
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim();
};

const toCylinderStyleLabel = (value) => {
  const baseLabel = stripLeadingProductType(value);
  return baseLabel ? `Cylinder ${baseLabel}` : (value || 'Cylinder');
};

const getInventoryItem = async (productId, inventoryCategory, transaction) => {
  return InventoryItem.findOne({
    where: { productId, inventoryCategory },
    transaction
  });
};

const findMatchingGasInventoryItem = async (product, transaction) => {
  const targetName = normalizeComparableProductName(product?.productName || product?.productCode);
  if (!targetName) {
    return null;
  }

  const inventoryItems = await InventoryItem.findAll({
    where: { inventoryCategory: 'Full Cylinder' },
    include: [{ model: Product, as: 'product', attributes: ['id', 'productName', 'productCode'] }],
    transaction
  });

  return inventoryItems.find((inventoryItem) => (
    normalizeComparableProductName(
      inventoryItem.product?.productName || inventoryItem.product?.productCode
    ) === targetName
  )) || null;
};

const adjustGasInventoryStock = async ({ product, quantityChange, transaction, meta = {} }) => {
  const fullCylinderInventory = await findMatchingGasInventoryItem(product, transaction);

  if (!fullCylinderInventory) {
    throw new Error(`Full cylinder inventory not found for gas product ${product?.productName || product?.id || ''}`.trim());
  }

  const fullBeforeQty = fullCylinderInventory.stockQuantity || 0;
  const fullAfterQty = fullBeforeQty + quantityChange;

  if (fullAfterQty < 0) {
    throw new Error(`Insufficient gas stock. Available: ${fullBeforeQty}`);
  }

  let emptyCylinderInventory = await getInventoryItem(fullCylinderInventory.productId, 'Empty Cylinder', transaction);
  if (!emptyCylinderInventory && quantityChange < 0) {
    emptyCylinderInventory = await InventoryItem.create({
      productId: fullCylinderInventory.productId,
      inventoryCategory: 'Empty Cylinder',
      stockQuantity: 0,
      totalPurchased: 0,
      totalSold: 0
    }, { transaction });
  }

  if (!emptyCylinderInventory) {
    throw new Error(`Empty cylinder inventory not found for gas product ${product?.productName || product?.id || ''}`.trim());
  }

  const emptyBeforeQty = emptyCylinderInventory.stockQuantity || 0;
  const emptyAfterQty = emptyBeforeQty - quantityChange;
  if (emptyAfterQty < 0) {
    throw new Error(`Insufficient empty cylinder stock. Available: ${emptyBeforeQty}`);
  }

  await fullCylinderInventory.update({ stockQuantity: fullAfterQty }, { transaction });
  await emptyCylinderInventory.update({ stockQuantity: emptyAfterQty }, { transaction });

  await logInventoryMutation({
    inventoryItem: fullCylinderInventory,
    quantityBefore: fullBeforeQty,
    quantityAfter: fullAfterQty,
    sourceModule: meta.sourceModule || 'stock_transfer',
    sourceAction: meta.sourceAction || 'adjust',
    sourceId: meta.sourceId,
    sourceRef: meta.sourceRef,
    actorUserId: meta.actorUserId,
    notes: meta.fullInventoryNotes || meta.notes,
    transaction
  });

  await logInventoryMutation({
    inventoryItem: emptyCylinderInventory,
    quantityBefore: emptyBeforeQty,
    quantityAfter: emptyAfterQty,
    sourceModule: meta.sourceModule || 'stock_transfer',
    sourceAction: meta.sourceAction || 'adjust',
    sourceId: meta.sourceId,
    sourceRef: meta.sourceRef,
    actorUserId: meta.actorUserId,
    notes: meta.emptyInventoryNotes || meta.notes,
    transaction
  });

  const productBefore = product.stockQuantity || 0;
  if (productBefore !== fullAfterQty) {
    await product.update({ stockQuantity: fullAfterQty }, { transaction });
    await logProductMutation({
      product,
      quantityBefore: productBefore,
      quantityAfter: fullAfterQty,
      sourceModule: meta.sourceModule || 'stock_transfer',
      sourceAction: meta.sourceAction || 'adjust',
      sourceId: meta.sourceId,
      sourceRef: meta.sourceRef,
      actorUserId: meta.actorUserId,
      notes: meta.productNotes || meta.notes,
      transaction
    });
  }

  return { fullCylinderInventory, emptyCylinderInventory };
};

const ensureRejectedTransferStatus = async () => {
  if (stockTransferStatusEnumReady) return;
  if (sequelize.getDialect && sequelize.getDialect() !== 'postgres') {
    stockTransferStatusEnumReady = true;
    return;
  }

  const [rows] = await sequelize.query(`
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'enum_stock_transfers_status'
      AND e.enumlabel = 'rejected'
    LIMIT 1
  `);

  if (!Array.isArray(rows) || rows.length === 0) {
    await sequelize.query(`ALTER TYPE "enum_stock_transfers_status" ADD VALUE 'rejected';`);
  }

  stockTransferStatusEnumReady = true;
};

const lockTransferById = async (transferId, transaction) => (
  StockTransfer.findByPk(transferId, {
    transaction,
    lock: transaction.LOCK.UPDATE
  })
);

const getTransferItemsWithProducts = async (transferId, transaction) => (
  StockTransferItem.findAll({
    where: { stockTransferId: transferId },
    include: [{ model: Product, as: 'product' }],
    transaction
  })
);

const adjustProductStock = async (product, quantityChange, transaction, meta = {}) => {
  const beforeQty = product.stockQuantity || 0;
  const nextQty = Math.max(0, beforeQty + quantityChange);
  await product.update({ stockQuantity: nextQty }, { transaction });
  await logProductMutation({
    product,
    quantityBefore: beforeQty,
    quantityAfter: nextQty,
    sourceModule: meta.sourceModule || 'stock_transfer',
    sourceAction: meta.sourceAction || 'adjust',
    sourceId: meta.sourceId,
    sourceRef: meta.sourceRef,
    actorUserId: meta.actorUserId,
    notes: meta.notes,
    transaction
  });
};

const restoreAssignedItemStock = async ({ item, transfer, actorUserId, transaction }) => {
  const itemType = normalizeItemType(item.itemType);
  const quantity = parseInt(item.quantity, 10) || 0;

  if (quantity <= 0) {
    return;
  }

  const product = await Product.findByPk(item.productId, { transaction });
  if (!product) {
    throw new Error('Product not found for assigned item');
  }

  if (itemType === 'Gas') {
    await adjustGasInventoryStock({
      product,
      quantityChange: quantity,
      transaction,
      meta: {
        sourceModule: 'stock_transfer',
        sourceAction: 'assign_reject',
        sourceId: transfer.id,
        sourceRef: transfer.transferNumber,
        actorUserId,
        notes: 'Assigned gas rejected',
        fullInventoryNotes: 'Assigned gas rejection restored full cylinder',
        emptyInventoryNotes: 'Assigned gas rejection removed empty cylinder'
      }
    });
    return;
  }

  const inventoryCategory = itemType === 'Empty Cylinder' ? 'Empty Cylinder' : 'Tool';
  let inventoryItem = await getInventoryItem(item.productId, inventoryCategory, transaction);
  if (!inventoryItem) {
    inventoryItem = await InventoryItem.create({
      productId: item.productId,
      inventoryCategory,
      stockQuantity: 0
    }, { transaction });
  }

  const beforeQty = inventoryItem.stockQuantity || 0;
  const afterQty = beforeQty + quantity;
  await inventoryItem.update({ stockQuantity: afterQty }, { transaction });

  await logInventoryMutation({
    inventoryItem,
    quantityBefore: beforeQty,
    quantityAfter: afterQty,
    sourceModule: 'stock_transfer',
    sourceAction: 'assign_reject',
    sourceId: transfer.id,
    sourceRef: transfer.transferNumber,
    actorUserId,
    transaction
  });

  await adjustProductStock(product, quantity, transaction, {
    sourceModule: 'stock_transfer',
    sourceAction: 'assign_reject',
    sourceId: transfer.id,
    sourceRef: transfer.transferNumber,
    actorUserId,
    notes: `Assigned ${inventoryCategory.toLowerCase()} rejected`
  });
};

const summarizeItems = (items) => {
  const parts = items.map((item) => {
    const rawName = item.product?.productName || item.productName || item.itemType;
    const name = normalizeItemType(item.itemType) === 'Gas'
      ? toCylinderStyleLabel(rawName)
      : rawName;
    return `${name} x${item.quantity}`;
  });
  return parts.join(', ');
};

const createNotification = async ({ userId, type, title, message, meta }, transaction) => {
  await Notification.create({
    userId,
    type,
    title,
    message,
    meta: meta || null
  }, { transaction });
};

// @desc    Get assigned stock transfers for logged-in employee or manager
// @route   GET /api/stock-transfers/assigned
// @access  Private (Employee, Manager)
exports.getAssignedTransfers = async (req, res) => {
  try {
    if (!isEmployeeRole(req.user.role) && !isManagerRole(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Only employees or managers can access assigned transfers' });
    }

    const transfers = await StockTransfer.findAll({
      where: {
        transferType: 'assign',
        employeeId: req.user.id,
        status: 'assigned'
      },
      include: [
        { model: StockTransferItem, as: 'items', include: [{ model: Product, as: 'product' }] },
        { model: User, as: 'creator', attributes: ['id', 'fullName', 'email'] }
      ],
      order: [['createdAt', 'DESC']]
    });

    res.status(200).json({ success: true, data: transfers });
  } catch (error) {
    console.error('Get assigned transfers error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// @desc    Employee accepts assigned stock
// @route   POST /api/stock-transfers/assigned/:id/accept
// @access  Private (Employee)
exports.acceptAssignedTransfer = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    if (!isEmployeeRole(req.user.role) && !isManagerRole(req.user.role)) {
      await transaction.rollback();
      return res.status(403).json({ success: false, message: 'Only employees or managers can accept assigned stock' });
    }

    const transfer = await lockTransferById(req.params.id, transaction);

    if (!transfer) {
      await transaction.rollback();
      return res.status(404).json({ success: false, message: 'Transfer not found' });
    }

    if (transfer.transferType !== 'assign' || transfer.employeeId !== req.user.id) {
      await transaction.rollback();
      return res.status(403).json({ success: false, message: 'Not authorized to accept this transfer' });
    }

    const shouldNotifyAdmins = transfer.status === 'assigned';

    if (shouldNotifyAdmins) {
      await transfer.update({ status: 'received' }, { transaction });
    } else if (transfer.status !== 'received') {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'Transfer cannot be accepted in its current status' });
    }

    const itemsWithProduct = await getTransferItemsWithProducts(transfer.id, transaction);

    if (shouldNotifyAdmins) {
      const superAdmins = await User.findAll({
        where: { role: 'super_admin', isActive: true },
        attributes: ['id', 'fullName'],
        transaction
      });

      for (const admin of superAdmins) {
        await createNotification({
          userId: admin.id,
          type: 'stock_assigned',
          title: 'Stock Accepted',
          message: `Accepted by ${req.user.fullName || 'Employee'}`,
          meta: {
            transferNumber: transfer.transferNumber,
            employeeName: req.user.fullName || 'Employee',
            itemsSummary: summarizeItems(itemsWithProduct)
          }
        }, transaction);
      }
    }

    await transaction.commit();

    const updatedTransfer = await StockTransfer.findByPk(transfer.id, {
      include: [
        { model: StockTransferItem, as: 'items', include: [{ model: Product, as: 'product' }] },
        { model: User, as: 'creator', attributes: ['id', 'fullName', 'email'] },
        { model: User, as: 'employee', attributes: ['id', 'fullName', 'email'] }
      ]
    });

    res.status(200).json({ success: true, data: updatedTransfer });
  } catch (error) {
    await transaction.rollback();
    console.error('Accept assigned transfer error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// @desc    Employee rejects assigned stock
// @route   POST /api/stock-transfers/assigned/:id/reject
// @access  Private (Employee)
exports.rejectAssignedTransfer = async (req, res) => {
  let transaction;
  try {
    await ensureRejectedTransferStatus();
    transaction = await sequelize.transaction();

    if (!isEmployeeRole(req.user.role) && !isManagerRole(req.user.role)) {
      await transaction.rollback();
      return res.status(403).json({ success: false, message: 'Only employees or managers can reject assigned stock' });
    }

    const transfer = await lockTransferById(req.params.id, transaction);

    if (!transfer) {
      await transaction.rollback();
      return res.status(404).json({ success: false, message: 'Transfer not found' });
    }

    if (transfer.transferType !== 'assign' || transfer.employeeId !== req.user.id) {
      await transaction.rollback();
      return res.status(403).json({ success: false, message: 'Not authorized to reject this transfer' });
    }

    if (transfer.status !== 'assigned') {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'Only pending assigned stock can be rejected' });
    }

    const transferItems = await StockTransferItem.findAll({
      where: { stockTransferId: transfer.id },
      transaction
    });

    for (const item of transferItems) {
      await restoreAssignedItemStock({
        item,
        transfer,
        actorUserId: req.user?.id,
        transaction
      });
    }

    await transfer.update({ status: 'rejected' }, { transaction });

    const itemsWithProduct = await getTransferItemsWithProducts(transfer.id, transaction);
    const superAdmins = await User.findAll({
      where: { role: 'super_admin', isActive: true },
      attributes: ['id', 'fullName'],
      transaction
    });

    for (const admin of superAdmins) {
      await createNotification({
        userId: admin.id,
        type: 'stock_assigned',
        title: 'Stock Rejected',
        message: `Rejected by ${req.user.fullName || 'Employee'}`,
        meta: {
          transferNumber: transfer.transferNumber,
          employeeName: req.user.fullName || 'Employee',
          itemsSummary: summarizeItems(itemsWithProduct)
        }
      }, transaction);
    }

    await transaction.commit();
    await rebuildDailyStockForTransferDate(
      transfer.createdAt,
      `stock transfer reject ${transfer.transferNumber || transfer.id || ''}`.trim()
    );

    const updatedTransfer = await StockTransfer.findByPk(transfer.id, {
      include: [
        { model: StockTransferItem, as: 'items', include: [{ model: Product, as: 'product' }] },
        { model: User, as: 'creator', attributes: ['id', 'fullName', 'email'] },
        { model: User, as: 'employee', attributes: ['id', 'fullName', 'email'] }
      ]
    });

    res.status(200).json({ success: true, data: updatedTransfer });
  } catch (error) {
    if (transaction) {
      await transaction.rollback();
    }
    console.error('Reject assigned transfer error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// @desc    Assign stock to employee or manager (Super Admin) / employee only from assigned stock (Manager)
// @route   POST /api/stock-transfers/assign
// @access  Private (Super Admin, Manager)
exports.createAssignTransfer = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const assignerIsSuperAdmin = isSuperAdminRole(req.user.role);
    const assignerIsManager = isManagerRole(req.user.role);

    if (!assignerIsSuperAdmin && !assignerIsManager) {
      await transaction.rollback();
      return res.status(403).json({ success: false, message: 'Not authorized to assign stock' });
    }

    const { employeeId, items = [], notes } = req.body;

    if (!employeeId) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'Recipient is required' });
    }

    const recipient = await User.findByPk(employeeId, { transaction });
    if (!recipient) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'Recipient not found' });
    }

    if (assignerIsManager) {
      if (recipient.role !== 'employee') {
        await transaction.rollback();
        return res.status(400).json({ success: false, message: 'Managers can only assign stock to employees' });
      }
    } else if (!['employee', 'manager'].includes(recipient.role)) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'Stock can only be assigned to employees or managers' });
    }

    if (!Array.isArray(items) || items.length === 0) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'At least one item is required' });
    }

    const transferCount = await StockTransfer.count({ transaction });
    const transferNumber = `ST-${String(transferCount + 1).padStart(6, '0')}`;

    const transfer = await StockTransfer.create({
      transferNumber,
      transferType: 'assign',
      status: 'assigned',
      employeeId,
      createdBy: req.user.id,
      notes: notes || null
    }, { transaction });

    const createdItems = [];
    for (const item of items) {
      const itemType = normalizeItemType(item.itemType);
      const quantity = parseInt(item.quantity, 10);
      const productId = item.productId;

      if (!ALLOWED_ITEM_TYPES.includes(itemType)) {
        await transaction.rollback();
        return res.status(400).json({ success: false, message: `Invalid item type: ${item.itemType}` });
      }
      if (!productId) {
        await transaction.rollback();
        return res.status(400).json({ success: false, message: 'Product is required for each item' });
      }
      if (!quantity || quantity <= 0) {
        await transaction.rollback();
        return res.status(400).json({ success: false, message: 'Quantity must be greater than 0' });
      }

      const product = await Product.findByPk(productId, { transaction });
      if (!product) {
        await transaction.rollback();
        return res.status(400).json({ success: false, message: 'Product not found' });
      }

      if (assignerIsManager) {
        const availableAssigned = await getAssignedStockQuantity(req.user.id, itemType, productId);
        if (availableAssigned < quantity) {
          await transaction.rollback();
          return res.status(400).json({
            success: false,
            message: `Insufficient assigned stock for ${product.productName || 'item'}. Available: ${availableAssigned}`
          });
        }
      } else if (itemType === 'Gas') {
        if (product.productType !== 'Gas') {
          await transaction.rollback();
          return res.status(400).json({ success: false, message: 'Selected product is not Gas' });
        }
        try {
          await adjustGasInventoryStock({
            product,
            quantityChange: -quantity,
            transaction,
            meta: {
              sourceModule: 'stock_transfer',
              sourceAction: 'assign',
              sourceId: transfer.id,
              sourceRef: transfer.transferNumber,
              actorUserId: req.user?.id,
              notes: 'Assign gas',
              fullInventoryNotes: 'Gas assignment deducted full cylinder',
              emptyInventoryNotes: 'Gas assignment added empty cylinder'
            }
          });
        } catch (gasError) {
          await transaction.rollback();
          return res.status(400).json({ success: false, message: gasError.message || 'Insufficient gas stock' });
        }
      } else {
        const inventoryCategory = itemType === 'Empty Cylinder' ? 'Empty Cylinder' : 'Tool';
        const inventoryItem = await getInventoryItem(productId, inventoryCategory, transaction);
        if (!inventoryItem) {
          await transaction.rollback();
          return res.status(400).json({ success: false, message: `Inventory item not found for ${inventoryCategory}` });
        }
        if (inventoryItem.stockQuantity < quantity) {
          await transaction.rollback();
          return res.status(400).json({ success: false, message: `Insufficient stock. Available: ${inventoryItem.stockQuantity}` });
        }
        const beforeQty = inventoryItem.stockQuantity || 0;
        const afterQty = beforeQty - quantity;
        await inventoryItem.update({
          stockQuantity: afterQty
        }, { transaction });

        await logInventoryMutation({
          inventoryItem,
          quantityBefore: beforeQty,
          quantityAfter: afterQty,
          sourceModule: 'stock_transfer',
          sourceAction: 'assign',
          sourceId: transfer.id,
          sourceRef: transfer.transferNumber,
          actorUserId: req.user?.id,
          transaction
        });

        await adjustProductStock(product, -quantity, transaction, {
          sourceModule: 'stock_transfer',
          sourceAction: 'assign',
          sourceId: transfer.id,
          sourceRef: transfer.transferNumber,
          actorUserId: req.user?.id
        });
      }

      const createdItem = await StockTransferItem.create({
        stockTransferId: transfer.id,
        productId,
        itemType,
        quantity
      }, { transaction });
      createdItems.push(createdItem);
    }

    const itemsWithProduct = await StockTransferItem.findAll({
      where: { stockTransferId: transfer.id },
      include: [{ model: Product, as: 'product' }],
      transaction
    });

    await createNotification({
      userId: employeeId,
      type: 'stock_assigned',
      title: 'Stock Assigned',
      message: `Assigned by ${req.user.fullName || 'Admin'}`,
      meta: {
        transferNumber,
        employeeName: recipient.fullName,
        itemsSummary: summarizeItems(itemsWithProduct)
      }
    }, transaction);

    await createNotification({
      userId: req.user.id,
      type: 'stock_assigned',
      title: 'Stock Assigned',
      message: `Assigned to ${recipient.fullName}`,
      meta: {
        transferNumber,
        employeeName: recipient.fullName,
        itemsSummary: summarizeItems(itemsWithProduct)
      }
    }, transaction);

    await transaction.commit();
    await rebuildDailyStockForTransferDate(
      transfer.createdAt,
      `stock transfer assign ${transfer.transferNumber || transfer.id || ''}`.trim()
    );

    const savedTransfer = await StockTransfer.findByPk(transfer.id, {
      include: [
        { model: StockTransferItem, as: 'items', include: [{ model: Product, as: 'product' }] },
        { model: User, as: 'employee', attributes: ['id', 'fullName', 'email'] }
      ]
    });

    res.status(201).json({ success: true, data: savedTransfer });
  } catch (error) {
    await transaction.rollback();
    console.error('Assign stock error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// @desc    Submit return stock request (Employee)
// @route   POST /api/stock-transfers/returns
// @access  Private
exports.createReturnTransfer = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    if (req.user.role !== 'employee') {
      await transaction.rollback();
      return res.status(403).json({ success: false, message: 'Only employees can submit returns' });
    }
    const { employeeId, items = [], notes } = req.body;
    const resolvedEmployeeId = employeeId || req.user.id;

    if (!resolvedEmployeeId) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'Employee is required' });
    }

    if (!Array.isArray(items) || items.length === 0) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'At least one item is required' });
    }

    const transferCount = await StockTransfer.count({ transaction });
    const transferNumber = `ST-${String(transferCount + 1).padStart(6, '0')}`;

    const transfer = await StockTransfer.create({
      transferNumber,
      transferType: 'return',
      status: 'pending',
      employeeId: resolvedEmployeeId,
      createdBy: req.user.id,
      notes: notes || null
    }, { transaction });

    const createdItems = [];
    for (const item of items) {
      const itemType = normalizeItemType(item.itemType);
      const quantity = parseInt(item.quantity, 10);
      const productId = item.productId;

      if (!ALLOWED_ITEM_TYPES.includes(itemType)) {
        await transaction.rollback();
        return res.status(400).json({ success: false, message: `Invalid item type: ${item.itemType}` });
      }
      if (!productId) {
        await transaction.rollback();
        return res.status(400).json({ success: false, message: 'Product is required for each item' });
      }
      if (!quantity || quantity <= 0) {
        await transaction.rollback();
        return res.status(400).json({ success: false, message: 'Quantity must be greater than 0' });
      }

      const createdItem = await StockTransferItem.create({
        stockTransferId: transfer.id,
        productId,
        itemType,
        quantity
      }, { transaction });
      createdItems.push(createdItem);
    }

    const itemsWithProduct = await StockTransferItem.findAll({
      where: { stockTransferId: transfer.id },
      include: [{ model: Product, as: 'product' }],
      transaction
    });

    const superAdmins = await User.findAll({
      where: { role: 'super_admin', isActive: true },
      attributes: ['id', 'fullName'],
      transaction
    });

    for (const admin of superAdmins) {
      await createNotification({
        userId: admin.id,
        type: 'stock_returned',
        title: 'Stock Return Submitted',
        message: `Return submitted by ${req.user.fullName || 'Employee'}`,
        meta: {
          transferNumber,
          employeeName: req.user.fullName || 'Employee',
          itemsSummary: summarizeItems(itemsWithProduct)
        }
      }, transaction);
    }

    await transaction.commit();

    const savedTransfer = await StockTransfer.findByPk(transfer.id, {
      include: [
        { model: StockTransferItem, as: 'items', include: [{ model: Product, as: 'product' }] },
        { model: User, as: 'employee', attributes: ['id', 'fullName', 'email'] }
      ]
    });

    res.status(201).json({ success: true, data: savedTransfer });
  } catch (error) {
    await transaction.rollback();
    console.error('Return stock request error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// @desc    Get assigned/returned transfer history (month-wise default)
// @route   GET /api/stock-transfers/history
// @access  Private (Super Admin, Employee)
exports.getTransferHistory = async (req, res) => {
  try {
    if (!isSuperAdminRole(req.user.role) && !isEmployeeRole(req.user.role) && !isManagerRole(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Not authorized to view transfer history' });
    }

    const { fromDate, toDate } = req.query;

    const nowParts = getUaeNowParts();
    const monthStartKey = buildUaeDateKey(nowParts.year, nowParts.monthIndex, 1);
    const nextMonthStartKey = nowParts.monthIndex === 11
      ? buildUaeDateKey(nowParts.year + 1, 0, 1)
      : buildUaeDateKey(nowParts.year, nowParts.monthIndex + 1, 1);
    const monthEndKey = addDaysToDateKey(nextMonthStartKey, -1);

    const resolvedFrom = fromDate || monthStartKey;
    const resolvedTo = toDate || monthEndKey || toUaeDateKey();
    const dateRange = buildUaeDateRange(resolvedFrom, resolvedTo);

    if (!dateRange) {
      return res.status(400).json({ success: false, message: 'Invalid date filter. Use YYYY-MM-DD.' });
    }

    const where = {
      createdAt: {
        [Op.between]: [dateRange.start, dateRange.end]
      }
    };

    if (isEmployeeRole(req.user.role)) {
      where.employeeId = req.user.id;
    } else if (isManagerRole(req.user.role)) {
      where[Op.or] = [
        { employeeId: req.user.id },
        { createdBy: req.user.id }
      ];
    }

    const transfers = await StockTransfer.findAll({
      where,
      include: [
        {
          model: StockTransferItem,
          as: 'items',
          include: [{ model: Product, as: 'product', attributes: ['id', 'productName', 'productCode'] }]
        },
        { model: User, as: 'employee', attributes: ['id', 'fullName', 'email'] },
        { model: User, as: 'creator', attributes: ['id', 'fullName', 'email'] }
      ],
      order: [['createdAt', 'DESC']]
    });

    return res.status(200).json({
      success: true,
      data: transfers,
      filters: {
        fromDate: resolvedFrom,
        toDate: resolvedTo
      }
    });
  } catch (error) {
    console.error('Get transfer history error:', error);
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// @desc    Get pending return stock requests
// @route   GET /api/stock-transfers/returns
// @access  Private (Super Admin)
exports.getPendingReturns = async (req, res) => {
  try {
    const returns = await StockTransfer.findAll({
      where: { transferType: 'return', status: 'pending' },
      include: [
        { model: StockTransferItem, as: 'items', include: [{ model: Product, as: 'product' }] },
        { model: User, as: 'employee', attributes: ['id', 'fullName', 'email'] }
      ],
      order: [['createdAt', 'DESC']]
    });

    res.status(200).json({ success: true, data: returns });
  } catch (error) {
    console.error('Get pending returns error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// @desc    Accept return stock
// @route   POST /api/stock-transfers/returns/:id/accept
// @access  Private (Super Admin)
exports.acceptReturn = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const transfer = await lockTransferById(req.params.id, transaction);

    if (!transfer) {
      await transaction.rollback();
      return res.status(404).json({ success: false, message: 'Return record not found' });
    }

    if (transfer.transferType !== 'return' || transfer.status !== 'pending') {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'Return record is not pending' });
    }

    const transferItems = await StockTransferItem.findAll({
      where: { stockTransferId: transfer.id },
      transaction
    });
    const employee = transfer.employeeId
      ? await User.findByPk(transfer.employeeId, {
        attributes: ['id', 'fullName', 'email'],
        transaction
      })
      : null;

    for (const item of transferItems) {
      const itemType = normalizeItemType(item.itemType);
      const quantity = parseInt(item.quantity, 10) || 0;

      const product = await Product.findByPk(item.productId, { transaction });
      if (!product) {
        await transaction.rollback();
        return res.status(400).json({ success: false, message: 'Product not found for return item' });
      }

      if (itemType === 'Gas') {
        await adjustGasInventoryStock({
          product,
          quantityChange: quantity,
          transaction,
          meta: {
            sourceModule: 'stock_transfer',
            sourceAction: 'return_accept',
            sourceId: transfer.id,
            sourceRef: transfer.transferNumber,
            actorUserId: req.user?.id,
            notes: 'Return gas accepted',
            fullInventoryNotes: 'Accepted gas return restored full cylinder',
            emptyInventoryNotes: 'Accepted gas return removed empty cylinder'
          }
        });
      } else {
        const inventoryCategory = itemType === 'Empty Cylinder' ? 'Empty Cylinder' : 'Tool';
        let inventoryItem = await getInventoryItem(item.productId, inventoryCategory, transaction);
        if (!inventoryItem) {
          inventoryItem = await InventoryItem.create({
            productId: item.productId,
            inventoryCategory,
            stockQuantity: 0
          }, { transaction });
        }
        const beforeQty = inventoryItem.stockQuantity || 0;
        const afterQty = beforeQty + quantity;
        await inventoryItem.update({
          stockQuantity: afterQty
        }, { transaction });

        await logInventoryMutation({
          inventoryItem,
          quantityBefore: beforeQty,
          quantityAfter: afterQty,
          sourceModule: 'stock_transfer',
          sourceAction: 'return_accept',
          sourceId: transfer.id,
          sourceRef: transfer.transferNumber,
          actorUserId: req.user?.id,
          transaction
        });

        await adjustProductStock(product, quantity, transaction, {
          sourceModule: 'stock_transfer',
          sourceAction: 'return_accept',
          sourceId: transfer.id,
          sourceRef: transfer.transferNumber,
          actorUserId: req.user?.id
        });
      }
    }

    await transfer.update({ status: 'received' }, { transaction });

    const itemsWithProduct = await getTransferItemsWithProducts(transfer.id, transaction);

    await createNotification({
      userId: transfer.employeeId,
      type: 'stock_returned',
      title: 'Stock Return Accepted',
      message: `Return accepted by ${req.user.fullName || 'Admin'}`,
      meta: {
        transferNumber: transfer.transferNumber,
        employeeName: employee?.fullName,
        itemsSummary: summarizeItems(itemsWithProduct)
      }
    }, transaction);
    await transaction.commit();
    await rebuildDailyStockForTransferDate(
      new Date(),
      `stock return accept ${transfer.transferNumber || transfer.id || ''}`.trim()
    );

    const updatedTransfer = await StockTransfer.findByPk(transfer.id, {
      include: [
        { model: StockTransferItem, as: 'items', include: [{ model: Product, as: 'product' }] },
        { model: User, as: 'employee', attributes: ['id', 'fullName', 'email'] }
      ]
    });

    res.status(200).json({ success: true, data: updatedTransfer });
  } catch (error) {
    await transaction.rollback();
    console.error('Accept return error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};
