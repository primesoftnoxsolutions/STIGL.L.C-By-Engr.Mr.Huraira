const { PurchaseHeader, PurchaseItem, Supplier, Product, User, Purchase, InventoryItem, sequelize } = require('../models');
const { logInventoryMutation, logProductMutation } = require('../utils/stockLogger');
const { Op } = require('sequelize');
const { toUaeDateKey } = require('../utils/uaeTime');
const { queueDailyStockRebuildFromDate } = require('./reportController');

const isRetryableDbError = (error) => {
  const message = String(error?.message || '').toLowerCase();
  const parentMessage = String(error?.parent?.message || '').toLowerCase();
  const code = String(error?.parent?.code || error?.original?.code || '').toUpperCase();
  return (
    message.includes('sqlite_busy') ||
    message.includes('database is locked') ||
    parentMessage.includes('sqlite_busy') ||
    parentMessage.includes('database is locked') ||
    message.includes('deadlock detected') ||
    parentMessage.includes('deadlock detected') ||
    message.includes('could not obtain lock') ||
    parentMessage.includes('could not obtain lock') ||
    message.includes('lock timeout') ||
    parentMessage.includes('lock timeout') ||
    code === '40P01' || // deadlock_detected (Postgres)
    code === '55P03' || // lock_not_available (Postgres)
    code === '57014' || // query_canceled / timeout (Postgres)
    error?.name === 'SequelizeTimeoutError'
  );
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const toInt = (value) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const toFloat = (value) => {
  const parsed = Number.parseFloat(value);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const rebuildDailyStockForPurchase = async (purchaseHeader, sourceAction) => {
  const affectedDate = purchaseHeader?.purchaseDate || purchaseHeader?.updatedAt || purchaseHeader?.createdAt;
  const affectedDateKey = affectedDate ? toUaeDateKey(new Date(affectedDate)) : null;
  if (!affectedDateKey) return;

  try {
    await queueDailyStockRebuildFromDate(affectedDateKey, {
      reason: `purchase ${sourceAction} ${purchaseHeader?.purchaseNumber || purchaseHeader?.id || ''}`.trim()
    });
  } catch (error) {
    console.error(
      `[DAILY STOCK] Rebuild failed after purchase ${sourceAction} ${purchaseHeader?.purchaseNumber || purchaseHeader?.id || ''}:`,
      error.message
    );
  }
};

const computeInventoryCategory = (item) => {
  if (item.purchaseType === 'Cylinder') {
    return item.cylinderCondition === 'Full' ? 'Full Cylinder' : 'Empty Cylinder';
  }
  if (item.purchaseType === 'Tool') return 'Tool';
  return null;
};

const updateInventoryRecord = async ({
  inventoryItem,
  quantityDelta,
  updateTotalPurchased = true,
  transaction
}) => {
  const beforeQty = toInt(inventoryItem.stockQuantity);
  const afterQty = beforeQty + quantityDelta;
  if (afterQty < 0) {
    return { error: `Insufficient stock. Available: ${beforeQty}, Required adjustment: ${Math.abs(quantityDelta)}` };
  }

  const payload = { stockQuantity: afterQty };
  if (updateTotalPurchased) {
    const beforePurchased = toInt(inventoryItem.totalPurchased);
    payload.totalPurchased = Math.max(0, beforePurchased + quantityDelta);
    if (quantityDelta > 0) {
      payload.lastPurchaseDate = new Date();
    }
  }

  await inventoryItem.update(payload, { transaction });
  return { beforeQty, afterQty };
};

const applyPurchaseInventoryDelta = async ({
  item,
  quantityDelta,
  purchaseHeader,
  actorUserId,
  sourceAction = 'confirm',
  transaction
}) => {
  const delta = toInt(quantityDelta);
  if (!delta) return;

  const purchaseId = purchaseHeader?.id || null;
  const purchaseNumber = purchaseHeader?.purchaseNumber || null;

  if (item.purchaseType === 'Gas') {
    const cylinderProductId = item.relatedProductId;
    if (!cylinderProductId) {
      throw new Error('Gas purchase requires a related cylinder');
    }

    const absDelta = Math.abs(delta);
    let emptyInventory = await InventoryItem.findOne({
      where: {
        productId: cylinderProductId,
        inventoryCategory: 'Empty Cylinder'
      },
      transaction
    });

    let fullInventory = await InventoryItem.findOne({
      where: {
        productId: cylinderProductId,
        inventoryCategory: 'Full Cylinder'
      },
      transaction
    });

    if (delta > 0) {
      if (!emptyInventory) {
        throw new Error('No empty cylinders found in inventory for this cylinder type');
      }
      if (toInt(emptyInventory.stockQuantity) < absDelta) {
        throw new Error(`Insufficient empty cylinders. Available: ${toInt(emptyInventory.stockQuantity)}, Required: ${absDelta}`);
      }

      const emptyResult = await updateInventoryRecord({
        inventoryItem: emptyInventory,
        quantityDelta: -absDelta,
        updateTotalPurchased: false,
        transaction
      });
      await logInventoryMutation({
        inventoryItem: emptyInventory,
        quantityBefore: emptyResult.beforeQty,
        quantityAfter: emptyResult.afterQty,
        sourceModule: 'purchase',
        sourceAction,
        sourceId: purchaseId,
        sourceRef: purchaseNumber,
        actorUserId,
        notes: 'Gas purchase consumed empty cylinder',
        transaction
      });

      if (!fullInventory) {
        fullInventory = await InventoryItem.create({
          productId: cylinderProductId,
          inventoryCategory: 'Full Cylinder',
          stockQuantity: 0,
          totalPurchased: 0,
          totalSold: 0,
          lastPurchaseDate: new Date()
        }, { transaction });
      }
      const fullResult = await updateInventoryRecord({
        inventoryItem: fullInventory,
        quantityDelta: absDelta,
        updateTotalPurchased: true,
        transaction
      });
      await logInventoryMutation({
        inventoryItem: fullInventory,
        quantityBefore: fullResult.beforeQty,
        quantityAfter: fullResult.afterQty,
        sourceModule: 'purchase',
        sourceAction,
        sourceId: purchaseId,
        sourceRef: purchaseNumber,
        actorUserId,
        notes: 'Gas purchase created full cylinder',
        transaction
      });
      return;
    }

    if (!fullInventory || toInt(fullInventory.stockQuantity) < absDelta) {
      throw new Error(`Cannot reduce gas purchase quantity by ${absDelta}. Insufficient full cylinder stock for rollback.`);
    }

    const fullResult = await updateInventoryRecord({
      inventoryItem: fullInventory,
      quantityDelta: -absDelta,
      updateTotalPurchased: true,
      transaction
    });
    await logInventoryMutation({
      inventoryItem: fullInventory,
      quantityBefore: fullResult.beforeQty,
      quantityAfter: fullResult.afterQty,
      sourceModule: 'purchase',
      sourceAction,
      sourceId: purchaseId,
      sourceRef: purchaseNumber,
      actorUserId,
      notes: 'Gas purchase quantity reduced (full cylinder rollback)',
      transaction
    });

    if (!emptyInventory) {
      emptyInventory = await InventoryItem.create({
        productId: cylinderProductId,
        inventoryCategory: 'Empty Cylinder',
        stockQuantity: 0,
        totalPurchased: 0,
        totalSold: 0
      }, { transaction });
    }
    const emptyResult = await updateInventoryRecord({
      inventoryItem: emptyInventory,
      quantityDelta: absDelta,
      updateTotalPurchased: false,
      transaction
    });
    await logInventoryMutation({
      inventoryItem: emptyInventory,
      quantityBefore: emptyResult.beforeQty,
      quantityAfter: emptyResult.afterQty,
      sourceModule: 'purchase',
      sourceAction,
      sourceId: purchaseId,
      sourceRef: purchaseNumber,
      actorUserId,
      notes: 'Gas purchase quantity reduced (empty cylinder restored)',
      transaction
    });
    return;
  }

  const inventoryCategory = computeInventoryCategory(item);
  if (!inventoryCategory) {
    throw new Error(`Unsupported purchase type: ${item.purchaseType}`);
  }

  let inventoryItem = await InventoryItem.findOne({
    where: {
      productId: item.productId,
      inventoryCategory
    },
    transaction
  });

  if (!inventoryItem) {
    if (delta < 0) {
      throw new Error(`Cannot reduce quantity. Inventory not found for ${inventoryCategory}`);
    }
    inventoryItem = await InventoryItem.create({
      productId: item.productId,
      inventoryCategory,
      stockQuantity: 0,
      totalPurchased: 0,
      totalSold: 0,
      lastPurchaseDate: new Date()
    }, { transaction });
  }

  const inventoryResult = await updateInventoryRecord({
    inventoryItem,
    quantityDelta: delta,
    updateTotalPurchased: true,
    transaction
  });
  if (inventoryResult.error) {
    throw new Error(inventoryResult.error);
  }

  await logInventoryMutation({
    inventoryItem,
    quantityBefore: inventoryResult.beforeQty,
    quantityAfter: inventoryResult.afterQty,
    sourceModule: 'purchase',
    sourceAction,
    sourceId: purchaseId,
    sourceRef: purchaseNumber,
    actorUserId,
    notes: `${item.purchaseType} purchase quantity adjusted`,
    transaction
  });

  const product = item.product || await Product.findByPk(item.productId, { transaction });
  if (!product) {
    throw new Error(`Product not found for purchase item (${item.productId || 'unknown'})`);
  }
  const productBefore = toInt(product.stockQuantity);
  const productAfter = productBefore + delta;
  if (productAfter < 0) {
    throw new Error(`Cannot reduce product stock below zero for ${product.productName || product.id}`);
  }
  await product.update({ stockQuantity: productAfter }, { transaction });
  await logProductMutation({
    product,
    quantityBefore: productBefore,
    quantityAfter: productAfter,
    sourceModule: 'purchase',
    sourceAction,
    sourceId: purchaseId,
    sourceRef: purchaseNumber,
    actorUserId,
    transaction
  });
};

// @desc    Get all purchases (grouped)
// @route   GET /api/purchases
// @access  Private
exports.getAllPurchases = async (req, res) => {
  try {
    const { status, search } = req.query;
    const where = {};

    if (status) where.status = status;
    if (req.user.role === 'employee') {
      where.employeeId = req.user.id;
    }
    
    if (search) {
      where[Op.or] = [
        { purchaseNumber: { [Op.like]: `%${search}%` } },
        { supplierInvoiceNumber: { [Op.like]: `%${search}%` } }
      ];
    }

    const purchases = await PurchaseHeader.findAll({
      where,
      include: [
        {
          model: Supplier,
          as: 'supplier',
          attributes: ['id', 'supplierName', 'trNumber', 'phone', 'email']
        },
        {
          model: PurchaseItem,
          as: 'items',
          include: [
            {
              model: Product,
              as: 'product',
              attributes: ['id', 'productCode', 'productName', 'productType', 'costPrice']
            },
            {
              model: Product,
              as: 'relatedProduct',
              attributes: ['id', 'productCode', 'productName', 'productType'],
              required: false
            }
          ]
        },
        {
          model: User,
          as: 'employee',
          attributes: ['id', 'fullName', 'email']
        }
      ],
      order: [
        ['createdAt', 'DESC'],
        [{ model: PurchaseItem, as: 'items' }, 'createdAt', 'ASC']
      ]
    });

    res.status(200).json({
      success: true,
      count: purchases.length,
      data: purchases
    });
  } catch (error) {
    console.error('Error fetching purchases:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Get single purchase
// @route   GET /api/purchases/:id
// @access  Private
exports.getPurchase = async (req, res) => {
  try {
    const purchase = await PurchaseHeader.findByPk(req.params.id, {
      include: [
        {
          model: Supplier,
          as: 'supplier'
        },
        {
          model: PurchaseItem,
          as: 'items',
          include: [
            {
              model: Product,
              as: 'product'
            },
            {
              model: Product,
              as: 'relatedProduct',
              required: false
            }
          ]
        },
        {
          model: User,
          as: 'employee'
        }
      ]
    });

    if (!purchase) {
      return res.status(404).json({
        success: false,
        message: 'Purchase not found'
      });
    }
    if (req.user.role === 'employee' && purchase.employeeId !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access this purchase'
      });
    }

    res.status(200).json({
      success: true,
      data: purchase
    });
  } catch (error) {
    console.error('Error fetching purchase:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Create purchase (grouped with multiple items)
// @route   POST /api/purchases
// @access  Private
exports.createPurchase = async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const {
      supplierId,
      supplierInvoiceNumber,
      items,
      notes
    } = req.body;

    // Validate required fields
    if (!supplierId || !supplierInvoiceNumber || !items || !Array.isArray(items) || items.length === 0) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Please provide supplier, invoice number, and at least one item'
      });
    }

    if (req.user.role === 'manager') {
      await transaction.rollback();
      return res.status(403).json({
        success: false,
        message: 'Managers are not authorized to create purchases'
      });
    }

    if (req.user.role === 'employee') {
      const hasNonGas = items.some(item => item.purchaseType !== 'Gas');
      if (hasNonGas) {
        await transaction.rollback();
        return res.status(403).json({
          success: false,
          message: 'Employees can create Gas purchases only'
        });
      }
    }

    // Verify supplier exists
    const supplier = await Supplier.findByPk(supplierId);
    if (!supplier) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: 'Supplier not found'
      });
    }

    // Generate purchase number
    const count = await PurchaseHeader.count();
    const purchaseNumber = `PUR${String(count + 1).padStart(5, '0')}`;

    let subtotal = 0;

    // Batch load all products and related products to avoid N+1 queries
    const allProductIds = new Set();
    for (const item of items) {
      allProductIds.add(item.productId);
      if (item.relatedProductId) allProductIds.add(item.relatedProductId);
    }
    const productsMap = new Map();
    if (allProductIds.size > 0) {
      const allProducts = await Product.findAll({ where: { id: Array.from(allProductIds) } });
      allProducts.forEach(p => productsMap.set(p.id, p));
    }

    // Validate and process each item
    for (const [index, item] of items.entries()) {
      const {
        purchaseType,
        cylinderCondition,
        productId,
        relatedProductId,
        quantity
      } = item;

      // Validate item fields
      if (!purchaseType || !productId || !quantity) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: `Item ${index + 1}: Missing required fields (purchaseType, productId, or quantity)`
        });
      }

      // Validate purchase type
      if (!['Gas', 'Cylinder', 'Tool'].includes(purchaseType)) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: `Item ${index + 1}: Invalid purchase type`
        });
      }

      // Validate Cylinder purchase requires cylinderCondition
      if (purchaseType === 'Cylinder' && !cylinderCondition) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: `Item ${index + 1}: Cylinder condition (Empty/Full) is required for Cylinder purchases`
        });
      }

      // Validate Gas purchase requires relatedProductId (cylinder)
      if (purchaseType === 'Gas' && !relatedProductId) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: `Item ${index + 1}: Related cylinder is required for Gas purchases`
        });
      }

      // CORE BUSINESS RULE: Gas cannot be purchased without empty cylinders
      // Use InventoryItem (canonical) instead of historical purchases to determine available empty cylinders
      if (purchaseType === 'Gas') {
        const relatedCylinder = productsMap.get(relatedProductId);
        if (!relatedCylinder) {
          await transaction.rollback();
          return res.status(404).json({
            success: false,
            message: `Item ${index + 1}: Related cylinder not found`
          });
        }

        const emptyInventory = await InventoryItem.findOne({
          where: {
            productId: relatedProductId,
            inventoryCategory: 'Empty Cylinder'
          },
          transaction
        });

        const availableEmptyCylinders = emptyInventory ? emptyInventory.stockQuantity : 0;

        if (availableEmptyCylinders < parseInt(quantity)) {
          await transaction.rollback();
          return res.status(400).json({
            success: false,
            message: `Gas purchase is not allowed because insufficient empty cylinders are available. Required: ${quantity}, Available: ${availableEmptyCylinders}. Please add empty cylinders first.`
          });
        }
      }

      // Validate Full Cylinder purchase
      if (purchaseType === 'Cylinder' && cylinderCondition === 'Full' && !relatedProductId) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: `Item ${index + 1}: Related gas is required for Full Cylinder purchases`
        });
      }

      // Fetch product to get cost price (from cached map)
      const product = productsMap.get(productId);
      if (!product) {
        await transaction.rollback();
        return res.status(404).json({
          success: false,
          message: `Item ${index + 1}: Product not found`
        });
      }

      // Calculate item amount
      const costPrice = item.costPrice != null && String(item.costPrice).trim() !== ''
        ? toFloat(item.costPrice)
        : toFloat(product.costPrice);
      const itemAmount = costPrice * parseInt(quantity);
      subtotal += itemAmount;
    }

    // Calculate VAT and grand total
    const vat = subtotal * 0.05; // 5% VAT
    const grandTotal = subtotal + vat;

    // Create purchase header
    const purchaseHeader = await PurchaseHeader.create({
      purchaseNumber,
      supplierId,
      supplierInvoiceNumber,
      purchaseDate: new Date(),
      employeeId: req.user.id,
      status: 'confirmed',
      subtotal,
      vat,
      grandTotal,
      notes
    }, { transaction });

    // Create purchase items
    const createdItems = [];
    for (const item of items) {
      const product = productsMap.get(item.productId) || await Product.findByPk(item.productId, { transaction });
      if (!product) {
        await transaction.rollback();
        return res.status(404).json({
          success: false,
          message: `Product not found (${item.productId})`
        });
      }
      const costPrice = item.costPrice != null && String(item.costPrice).trim() !== ''
        ? toFloat(item.costPrice)
        : toFloat(product.costPrice);
      const totalAmount = costPrice * parseInt(item.quantity);

      const purchaseItem = await PurchaseItem.create({
        purchaseHeaderId: purchaseHeader.id,
        purchaseType: item.purchaseType,
        cylinderCondition: item.purchaseType === 'Cylinder' ? item.cylinderCondition : null,
        productId: item.productId,
        relatedProductId: item.relatedProductId || null,
        quantity: parseInt(item.quantity),
        costPrice,
        totalAmount
      }, { transaction });

      createdItems.push(purchaseItem);
    }

    // Auto-confirm workflow: apply inventory updates immediately on submit.
    for (const createdItem of createdItems) {
      await applyPurchaseInventoryDelta({
        item: createdItem,
        quantityDelta: toInt(createdItem.quantity),
        purchaseHeader,
        actorUserId: req.user.id,
        sourceAction: 'create_auto_confirm',
        transaction
      });
    }

    // Commit transaction
    await transaction.commit();
    await rebuildDailyStockForPurchase(purchaseHeader, 'create');

    // Fetch full purchase with relations
    const fullPurchase = await PurchaseHeader.findByPk(purchaseHeader.id, {
      include: [
        { model: Supplier, as: 'supplier' },
        {
          model: PurchaseItem,
          as: 'items',
          include: [
            { model: Product, as: 'product' },
            { model: Product, as: 'relatedProduct', required: false }
          ]
        },
        { model: User, as: 'employee' }
      ]
    });

    res.status(201).json({
      success: true,
      message: `Purchase created and confirmed successfully with ${items.length} item(s)`,
      data: fullPurchase
    });

  } catch (error) {
    await transaction.rollback();
    console.error('Error creating purchase:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Update purchase (quantity edit with inventory delta adjustment)
// @route   PUT /api/purchases/:id
// @access  Private (Super Admin)
exports.updatePurchase = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    if (req.user?.role !== 'super_admin') {
      await transaction.rollback();
      return res.status(403).json({
        success: false,
        message: 'Only Super Admin can edit purchases'
      });
    }

    const { supplierInvoiceNumber, notes, items } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Please provide at least one purchase item to update'
      });
    }

    const purchase = await PurchaseHeader.findByPk(req.params.id, {
      include: [
        {
          model: PurchaseItem,
          as: 'items',
          include: [
            { model: Product, as: 'product' },
            { model: Product, as: 'relatedProduct', required: false }
          ]
        }
      ],
      transaction
    });

    if (!purchase) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: 'Purchase not found'
      });
    }

    if (!Array.isArray(purchase.items) || purchase.items.length === 0) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Purchase has no items to update'
      });
    }

    if (purchase.status !== 'confirmed') {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Only confirmed purchases can be edited'
      });
    }

    const existingItemsById = new Map(purchase.items.map((item) => [item.id, item]));
    let subtotal = 0;

    for (const incomingItem of items) {
      const existingItem = existingItemsById.get(incomingItem.id);
      if (!existingItem) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: `Invalid purchase item id: ${incomingItem.id || 'unknown'}`
        });
      }

      const newQuantity = toInt(incomingItem.quantity);
      if (newQuantity < 1) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: 'Quantity must be at least 1 for all items'
        });
      }

      const oldQuantity = toInt(existingItem.quantity);
      const delta = newQuantity - oldQuantity;
      if (delta !== 0) {
        await applyPurchaseInventoryDelta({
          item: existingItem,
          quantityDelta: delta,
          purchaseHeader: purchase,
          actorUserId: req.user.id,
          sourceAction: 'edit',
          transaction
        });
      }

      const unitCost = toFloat(existingItem.costPrice || existingItem.product?.costPrice);
      const totalAmount = unitCost * newQuantity;
      await existingItem.update({
        quantity: newQuantity,
        totalAmount
      }, { transaction });
      subtotal += totalAmount;

      existingItemsById.delete(existingItem.id);
    }

    if (existingItemsById.size > 0) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'All existing purchase items must be included while editing'
      });
    }

    const vat = subtotal * 0.05;
    const grandTotal = subtotal + vat;

    await purchase.update({
      supplierInvoiceNumber: supplierInvoiceNumber || purchase.supplierInvoiceNumber,
      notes: typeof notes === 'string' ? notes : purchase.notes,
      subtotal,
      vat,
      grandTotal
    }, { transaction });

    await transaction.commit();
    await rebuildDailyStockForPurchase(purchase, 'update');

    const fullPurchase = await PurchaseHeader.findByPk(purchase.id, {
      include: [
        { model: Supplier, as: 'supplier' },
        {
          model: PurchaseItem,
          as: 'items',
          include: [
            { model: Product, as: 'product' },
            { model: Product, as: 'relatedProduct', required: false }
          ]
        },
        { model: User, as: 'employee' }
      ]
    });

    return res.status(200).json({
      success: true,
      message: 'Purchase updated successfully',
      data: fullPurchase
    });
  } catch (error) {
    await transaction.rollback();
    console.error('Error updating purchase:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to update purchase',
      error: error.message
    });
  }
};

// @desc    Confirm purchase (move from pending to confirmed, update inventory)
// @route   POST /api/purchases/:id/confirm
// @access  Private
exports.confirmPurchase = async (req, res) => {
  try {
    if (!req.user || !req.user.role) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized to confirm purchases'
      });
    }

    if (req.user.role === 'employee') {
      return res.status(403).json({
        success: false,
        message: 'Employees are not authorized to confirm purchases'
      });
    }

    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      let transaction = null;
      try {
      transaction = await sequelize.transaction();
      const purchase = await PurchaseHeader.findByPk(req.params.id, {
      include: [
        {
          model: PurchaseItem,
          as: 'items',
          include: [
            { model: Product, as: 'product' },
            { model: Product, as: 'relatedProduct', required: false }
          ]
        }
      ],
      transaction
    });

      if (!purchase) {
        await transaction.rollback();
        return res.status(404).json({
          success: false,
          message: 'Purchase not found'
        });
      }

      if (purchase.status !== 'pending') {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: 'Only pending purchases can be confirmed'
        });
      }

      if (!Array.isArray(purchase.items) || purchase.items.length === 0) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: 'Purchase has no items to confirm'
        });
      }

    // Update purchase status (idempotent guard)
    const [updatedCount] = await PurchaseHeader.update(
      { status: 'confirmed' },
      { where: { id: purchase.id, status: 'pending' }, transaction }
    );
    if (!updatedCount) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Purchase already confirmed'
      });
    }

    // Handle inventory updates for each item
    for (const item of purchase.items) {
      const product = item.product || await Product.findByPk(item.productId, { transaction });
      if (!product) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: `Product not found for purchase item (${item.productId || 'unknown'})`
        });
      }

      const relatedProductId = item.relatedProductId || null;
      if (relatedProductId) {
        const relatedProduct = item.relatedProduct || await Product.findByPk(relatedProductId, { transaction });
        if (!relatedProduct) {
          await transaction.rollback();
          return res.status(400).json({
            success: false,
            message: `Related product not found for purchase item (${relatedProductId})`
          });
        }
      }
      
      if (item.purchaseType === 'Gas') {
        // ============================================
        // GAS PURCHASE LOGIC
        // Gas is purchased inside a cylinder
        // - DECREASE Empty Cylinder stock (cylinder is being filled)
        // - INCREASE Full Cylinder stock (cylinder now has gas)
        // - Use CYLINDER product ID for inventory (not gas product ID)
        // ============================================
        
        const cylinderProductId = item.relatedProductId; // The cylinder selected for gas
        
        if (!cylinderProductId) {
          await transaction.rollback();
          return res.status(400).json({
            success: false,
            message: 'Gas purchase requires a related cylinder'
          });
        }

        // 1. DECREASE Empty Cylinder inventory (consumed for gas filling - NOT sold)
        let emptyCylinderInventory = await InventoryItem.findOne({
          where: {
            productId: cylinderProductId,
            inventoryCategory: 'Empty Cylinder'
          },
          transaction
        });

        if (emptyCylinderInventory) {
          // Check if enough empty cylinders available
          if (emptyCylinderInventory.stockQuantity < item.quantity) {
            await transaction.rollback();
            return res.status(400).json({
              success: false,
              message: `Insufficient empty cylinders. Available: ${emptyCylinderInventory.stockQuantity}, Required: ${item.quantity}`
            });
          }
          
          // Decrease empty cylinder stock (consumed, NOT sold)
          // NOTE: NOT incrementing totalSold - cylinders are consumed for gas filling, not sold to customers
          const beforeQty = emptyCylinderInventory.stockQuantity || 0;
          const afterQty = beforeQty - item.quantity;
          await emptyCylinderInventory.update({
            stockQuantity: afterQty
          }, { transaction });

          await logInventoryMutation({
            inventoryItem: emptyCylinderInventory,
            quantityBefore: beforeQty,
            quantityAfter: afterQty,
            sourceModule: 'purchase',
            sourceAction: 'confirm',
            sourceId: purchase.id,
            sourceRef: purchase.purchaseNumber,
            actorUserId: req.user?.id,
            notes: 'Gas purchase consumed empty cylinder',
            transaction
          });
        } else {
          await transaction.rollback();
          return res.status(400).json({
            success: false,
            message: 'No empty cylinders found in inventory for this cylinder type'
          });
        }

        // 2. INCREASE Full Cylinder inventory (using CYLINDER product, not gas)
        let fullCylinderInventory = await InventoryItem.findOne({
          where: {
            productId: cylinderProductId, // Use cylinder ID, not gas ID
            inventoryCategory: 'Full Cylinder'
          },
          transaction
        });

        if (fullCylinderInventory) {
          // Update existing - merge quantity
          const beforeQty = fullCylinderInventory.stockQuantity || 0;
          const afterQty = beforeQty + item.quantity;
          await fullCylinderInventory.update({
            stockQuantity: afterQty,
            totalPurchased: fullCylinderInventory.totalPurchased + item.quantity,
            lastPurchaseDate: new Date()
          }, { transaction });

          await logInventoryMutation({
            inventoryItem: fullCylinderInventory,
            quantityBefore: beforeQty,
            quantityAfter: afterQty,
            sourceModule: 'purchase',
            sourceAction: 'confirm',
            sourceId: purchase.id,
            sourceRef: purchase.purchaseNumber,
            actorUserId: req.user?.id,
            notes: 'Gas purchase created full cylinder',
            transaction
          });
        } else {
          // Create new Full Cylinder inventory item
          const created = await InventoryItem.create({
            productId: cylinderProductId, // Use cylinder ID
            inventoryCategory: 'Full Cylinder',
            stockQuantity: item.quantity,
            totalPurchased: item.quantity,
            totalSold: 0,
            lastPurchaseDate: new Date()
          }, { transaction });

          await logInventoryMutation({
            inventoryItem: created,
            quantityBefore: 0,
            quantityAfter: item.quantity,
            sourceModule: 'purchase',
            sourceAction: 'confirm',
            sourceId: purchase.id,
            sourceRef: purchase.purchaseNumber,
            actorUserId: req.user?.id,
            notes: 'Gas purchase created full cylinder inventory',
            transaction
          });
        }

      } else if (item.purchaseType === 'Cylinder') {
        // ============================================
        // CYLINDER PURCHASE LOGIC
        // Empty or Full cylinder purchased directly
        // ============================================
        
        const inventoryCategory = item.cylinderCondition === 'Full' ? 'Full Cylinder' : 'Empty Cylinder';

        let inventoryItem = await InventoryItem.findOne({
          where: {
            productId: item.productId,
            inventoryCategory
          },
          transaction
        });

        if (inventoryItem) {
          // Update existing - merge quantity
          const beforeQty = inventoryItem.stockQuantity || 0;
          const afterQty = beforeQty + item.quantity;
          await inventoryItem.update({
            stockQuantity: afterQty,
            totalPurchased: inventoryItem.totalPurchased + item.quantity,
            lastPurchaseDate: new Date()
          }, { transaction });

          await logInventoryMutation({
            inventoryItem,
            quantityBefore: beforeQty,
            quantityAfter: afterQty,
            sourceModule: 'purchase',
            sourceAction: 'confirm',
            sourceId: purchase.id,
            sourceRef: purchase.purchaseNumber,
            actorUserId: req.user?.id,
            notes: `Cylinder purchase (${inventoryCategory})`,
            transaction
          });
        } else {
          // Create new inventory item
          const created = await InventoryItem.create({
            productId: item.productId,
            inventoryCategory,
            stockQuantity: item.quantity,
            totalPurchased: item.quantity,
            totalSold: 0,
            lastPurchaseDate: new Date()
          }, { transaction });

          await logInventoryMutation({
            inventoryItem: created,
            quantityBefore: 0,
            quantityAfter: item.quantity,
            sourceModule: 'purchase',
            sourceAction: 'confirm',
            sourceId: purchase.id,
            sourceRef: purchase.purchaseNumber,
            actorUserId: req.user?.id,
            notes: `Cylinder purchase (${inventoryCategory}) created`,
            transaction
          });
        }

        // Update product stock
        const productBefore = product.stockQuantity || 0;
        const productAfter = productBefore + item.quantity;
        await product.update({ stockQuantity: productAfter }, { transaction });
        await logProductMutation({
          product,
          quantityBefore: productBefore,
          quantityAfter: productAfter,
          sourceModule: 'purchase',
          sourceAction: 'confirm',
          sourceId: purchase.id,
          sourceRef: purchase.purchaseNumber,
          actorUserId: req.user?.id,
          transaction
        });

      } else {
        // ============================================
        // TOOL PURCHASE LOGIC
        // ============================================
        
        let inventoryItem = await InventoryItem.findOne({
          where: {
            productId: item.productId,
            inventoryCategory: 'Tool'
          },
          transaction
        });

        if (inventoryItem) {
          // Update existing - merge quantity
          const beforeQty = inventoryItem.stockQuantity || 0;
          const afterQty = beforeQty + item.quantity;
          await inventoryItem.update({
            stockQuantity: afterQty,
            totalPurchased: inventoryItem.totalPurchased + item.quantity,
            lastPurchaseDate: new Date()
          }, { transaction });

          await logInventoryMutation({
            inventoryItem,
            quantityBefore: beforeQty,
            quantityAfter: afterQty,
            sourceModule: 'purchase',
            sourceAction: 'confirm',
            sourceId: purchase.id,
            sourceRef: purchase.purchaseNumber,
            actorUserId: req.user?.id,
            notes: 'Tool purchase',
            transaction
          });
        } else {
          // Create new inventory item
          const created = await InventoryItem.create({
            productId: item.productId,
            inventoryCategory: 'Tool',
            stockQuantity: item.quantity,
            totalPurchased: item.quantity,
            totalSold: 0,
            lastPurchaseDate: new Date()
          }, { transaction });

          await logInventoryMutation({
            inventoryItem: created,
            quantityBefore: 0,
            quantityAfter: item.quantity,
            sourceModule: 'purchase',
            sourceAction: 'confirm',
            sourceId: purchase.id,
            sourceRef: purchase.purchaseNumber,
            actorUserId: req.user?.id,
            notes: 'Tool purchase created',
            transaction
          });
        }

        // Update product stock
        const productBefore = product.stockQuantity || 0;
        const productAfter = productBefore + item.quantity;
        await product.update({ stockQuantity: productAfter }, { transaction });
        await logProductMutation({
          product,
          quantityBefore: productBefore,
          quantityAfter: productAfter,
          sourceModule: 'purchase',
          sourceAction: 'confirm',
          sourceId: purchase.id,
          sourceRef: purchase.purchaseNumber,
          actorUserId: req.user?.id,
          transaction
        });
      }
      }

      await transaction.commit();
      await rebuildDailyStockForPurchase(purchase, 'confirm');

      // Keep confirm idempotent for clients even if the post-commit read fails.
      let updatedPurchase = null;
      try {
        updatedPurchase = await PurchaseHeader.findByPk(purchase.id, {
          include: [
            { model: Supplier, as: 'supplier' },
            {
              model: PurchaseItem,
              as: 'items',
              include: [
                { model: Product, as: 'product' },
                { model: Product, as: 'relatedProduct', required: false }
              ]
            },
            { model: User, as: 'employee' }
          ]
        });
      } catch (fetchError) {
        console.error('Purchase confirmed but failed to load updated purchase:', fetchError);
      }

      return res.status(200).json({
        success: true,
        message: 'Purchase confirmed and inventory updated',
        data: updatedPurchase || {
          id: purchase.id,
          purchaseNumber: purchase.purchaseNumber,
          status: 'confirmed'
        }
      });
      } catch (error) {
        try {
          if (transaction && !transaction.finished) {
            await transaction.rollback();
          }
        } catch (rollbackError) {
          console.error('Rollback error while confirming purchase:', rollbackError.message);
        }

        // If commit succeeded but a later step failed, avoid returning a false 500.
        try {
          const settledPurchase = await PurchaseHeader.findByPk(req.params.id, {
            attributes: ['id', 'purchaseNumber', 'status']
          });
          if (settledPurchase?.status === 'confirmed') {
            return res.status(200).json({
              success: true,
              message: 'Purchase confirmed and inventory updated',
              data: settledPurchase
            });
          }
        } catch (statusReadError) {
          console.error('Failed to verify purchase status after confirm error:', statusReadError.message);
        }

        const retryable = isRetryableDbError(error);
        if (retryable && attempt < maxAttempts) {
          await sleep(120 * attempt);
          continue;
        }

        console.error('Error confirming purchase:', error);
        if (retryable) {
          return res.status(503).json({
            success: false,
            message: 'Database is busy. Please retry in a moment.',
            error: error.message
          });
        }

        return res.status(500).json({
          success: false,
          message: error.message || 'Server error',
          error: error.message
        });
      }
    }
    return res.status(500).json({
      success: false,
      message: 'Failed to confirm purchase after retries'
    });
  } catch (error) {
    console.error('Unhandled error in confirmPurchase:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Server error',
      error: error.message
    });
  }
};

// @desc    Cancel purchase
// @route   POST /api/purchases/:id/cancel
// @access  Private (Super Admin)
exports.cancelPurchase = async (req, res) => {
  try {
    const purchase = await PurchaseHeader.findByPk(req.params.id);

    if (!purchase) {
      return res.status(404).json({
        success: false,
        message: 'Purchase not found'
      });
    }

    if (purchase.status === 'confirmed') {
      return res.status(400).json({
        success: false,
        message: 'Confirmed purchases cannot be cancelled'
      });
    }

    await purchase.update({ status: 'cancelled' });

    res.status(200).json({
      success: true,
      message: 'Purchase cancelled successfully'
    });
  } catch (error) {
    console.error('Error cancelling purchase:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Delete purchase (hard delete)
// @route   DELETE /api/purchases/:id
// @access  Private (Super Admin)
exports.deletePurchase = async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const purchase = await PurchaseHeader.findByPk(req.params.id);

    if (!purchase) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: 'Purchase not found'
      });
    }

    if (purchase.status === 'confirmed') {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Confirmed purchases cannot be deleted. Please cancel first.'
      });
    }

    // Delete all items first (cascade)
    await PurchaseItem.destroy({
      where: { purchaseHeaderId: purchase.id },
      transaction
    });

    // Delete header
    await purchase.destroy({ transaction });

    await transaction.commit();

    res.status(200).json({
      success: true,
      message: 'Purchase deleted successfully'
    });
  } catch (error) {
    await transaction.rollback();
    console.error('Error deleting purchase:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

module.exports = exports;
