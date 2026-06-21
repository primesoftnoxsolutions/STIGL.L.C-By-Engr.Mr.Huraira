const { Purchase, Supplier, Product, User, InventoryItem, sequelize } = require('../models');
const { logInventoryMutation, logProductMutation } = require('../utils/stockLogger');
const { Op } = require('sequelize');

// @desc    Get all purchases
// @route   GET /api/purchases
// @access  Private
exports.getAllPurchases = async (req, res) => {
  try {
    const { status, purchaseType, search } = req.query;
    const where = {};

    if (status) where.status = status;
    if (purchaseType) where.purchaseType = purchaseType;
    
    if (search) {
      where[Op.or] = [
        { purchaseNumber: { [Op.like]: `%${search}%` } },
        { supplierInvoiceNumber: { [Op.like]: `%${search}%` } }
      ];
    }

    const purchases = await Purchase.findAll({
      where,
      include: [
        {
          model: Supplier,
          as: 'supplier',
          attributes: ['id', 'supplierName', 'trNumber', 'phone', 'email']
        },
        {
          model: Product,
          as: 'product',
          attributes: ['id', 'productCode', 'productName', 'productType', 'costPrice']
        },
        {
          model: Product,
          as: 'relatedProduct',
          attributes: ['id', 'productCode', 'productName', 'productType', 'costPrice'],
          required: false
        },
        {
          model: User,
          as: 'employee',
          attributes: ['id', 'fullName', 'email']
        }
      ],
      order: [['createdAt', 'DESC']]
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
    const purchase = await Purchase.findByPk(req.params.id, {
      include: [
        {
          model: Supplier,
          as: 'supplier'
        },
        {
          model: Product,
          as: 'product'
        },
        {
          model: Product,
          as: 'relatedProduct',
          required: false
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

// @desc    Create purchase (supports multiple items)
// @route   POST /api/purchases
// @access  Private
exports.createPurchase = async (req, res) => {
  try {
    const {
      supplierId,
      supplierInvoiceNumber,
      items,
      notes
    } = req.body;

    // Validate required fields
    if (!supplierId || !supplierInvoiceNumber || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide supplier, invoice number, and at least one item'
      });
    }

    // Verify supplier exists
    const supplier = await Supplier.findByPk(supplierId);
    if (!supplier) {
      return res.status(404).json({
        success: false,
        message: 'Supplier not found'
      });
    }

    // Use the supplier invoice number as the purchase number
    const purchaseNumber = supplierInvoiceNumber;

    const createdPurchases = [];
    let totalPurchaseAmount = 0;

    // Process each item
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
        return res.status(400).json({
          success: false,
          message: `Item ${index + 1}: Missing required fields (purchaseType, productId, or quantity)`
        });
      }

      // Validate purchase type
      if (!['Gas', 'Cylinder', 'Tool'].includes(purchaseType)) {
        return res.status(400).json({
          success: false,
          message: `Item ${index + 1}: Invalid purchase type`
        });
      }

      // Validate Cylinder purchase requires cylinderCondition
      if (purchaseType === 'Cylinder' && !cylinderCondition) {
        return res.status(400).json({
          success: false,
          message: `Item ${index + 1}: Cylinder condition (Empty/Full) is required for Cylinder purchases`
        });
      }

      // Validate Gas purchase requires relatedProductId (cylinder)
      if (purchaseType === 'Gas' && !relatedProductId) {
        return res.status(400).json({
          success: false,
          message: `Item ${index + 1}: Related cylinder is required for Gas purchases`
        });
      }

      // CORE BUSINESS RULE: Gas cannot be purchased without empty cylinders
      // Use InventoryItem (canonical) instead of historical purchases
      if (purchaseType === 'Gas') {
        const relatedCylinder = await Product.findByPk(relatedProductId);
        if (!relatedCylinder) {
          return res.status(404).json({
            success: false,
            message: `Item ${index + 1}: Related cylinder not found`
          });
        }

        const emptyInventory = await InventoryItem.findOne({
          where: {
            productId: relatedProductId,
            inventoryCategory: 'Empty Cylinder'
          }
        });

        const availableEmptyCylinders = emptyInventory ? emptyInventory.stockQuantity : 0;

        if (availableEmptyCylinders < parseInt(quantity)) {
          return res.status(400).json({
            success: false,
            message: `Gas purchase is not allowed because insufficient empty cylinders are available. Required: ${quantity}, Available: ${availableEmptyCylinders}. Please add empty cylinders first.`
          });
        }
      }

      // Validate Full Cylinder purchase requires both empty cylinder and gas
      if (purchaseType === 'Cylinder' && cylinderCondition === 'Full' && !relatedProductId) {
        return res.status(400).json({
          success: false,
          message: `Item ${index + 1}: Related gas is required for Full Cylinder purchases`
        });
      }

      // Fetch product to get cost price
      const product = await Product.findByPk(productId);
      if (!product) {
        return res.status(404).json({
          success: false,
          message: `Item ${index + 1}: Product not found`
        });
      }

      // Calculate item amount
      const costPrice = parseFloat(product.costPrice);
      const itemAmount = costPrice * parseInt(quantity);
      totalPurchaseAmount += itemAmount;

      // Create purchase record for this item
      const purchase = await Purchase.create({
        purchaseNumber: purchaseNumber,
        supplierId,
        supplierInvoiceNumber,
        purchaseType,
        cylinderCondition: purchaseType === 'Cylinder' ? cylinderCondition : null,
        productId,
        relatedProductId: relatedProductId || null,
        quantity: parseInt(quantity),
        costPrice,
        totalAmount: itemAmount,
        employeeId: req.user.id,
        status: 'pending',
        notes: index === 0 ? notes : null // Only attach notes to first item
      });

      // Fetch full purchase with relations
      const fullPurchase = await Purchase.findByPk(purchase.id, {
        include: [
          { model: Supplier, as: 'supplier' },
          { model: Product, as: 'product' },
          { model: Product, as: 'relatedProduct', required: false },
          { model: User, as: 'employee' }
        ]
      });

      createdPurchases.push(fullPurchase);
    }

    // Calculate VAT and grand total
    const subtotal = totalPurchaseAmount;
    const vat = subtotal * 0.05; // 5% VAT
    const grandTotal = subtotal + vat;

    res.status(201).json({
      success: true,
      message: `Purchase created successfully with ${items.length} item(s)`,
      data: createdPurchases,
      summary: {
        basePurchaseNumber: purchaseNumber,
        itemCount: items.length,
        subtotal: subtotal.toFixed(2),
        vat: vat.toFixed(2),
        grandTotal: grandTotal.toFixed(2)
      }
    });
  } catch (error) {
    console.error('Error creating purchase:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Confirm purchase (move from pending to confirmed, update inventory)
// @route   PUT /api/purchases/:id/confirm
// @access  Private
exports.confirmPurchase = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const purchase = await Purchase.findByPk(req.params.id, {
      include: [
        { model: Product, as: 'product' },
        { model: Product, as: 'relatedProduct', required: false }
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

    // Update purchase status (idempotent guard)
    const [updatedCount] = await Purchase.update(
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

    // Handle inventory updates based on purchase type
    if (purchase.purchaseType === 'Gas') {
      // GAS: consume Empty Cylinder inventory and increase Full Cylinder inventory
      const cylinderProductId = purchase.relatedProductId;

      if (!cylinderProductId) {
        await transaction.rollback();
        return res.status(400).json({ success: false, message: 'Gas purchase missing related cylinder' });
      }

      const emptyInventory = await InventoryItem.findOne({
        where: { productId: cylinderProductId, inventoryCategory: 'Empty Cylinder' },
        transaction
      });

      if (!emptyInventory || emptyInventory.stockQuantity < purchase.quantity) {
        await transaction.rollback();
        return res.status(400).json({ success: false, message: 'Insufficient empty cylinders in inventory' });
      }

      const emptyBefore = emptyInventory.stockQuantity || 0;
      const emptyAfter = emptyBefore - purchase.quantity;
      await emptyInventory.update({ stockQuantity: emptyAfter }, { transaction });
      await logInventoryMutation({
        inventoryItem: emptyInventory,
        quantityBefore: emptyBefore,
        quantityAfter: emptyAfter,
        sourceModule: 'purchase',
        sourceAction: 'confirm',
        sourceId: purchase.id,
        sourceRef: purchase.purchaseNumber,
        actorUserId: req.user?.id,
        notes: 'Gas purchase consumed empty cylinder'
      }, transaction);

      const fullInventory = await InventoryItem.findOne({
        where: { productId: cylinderProductId, inventoryCategory: 'Full Cylinder' },
        transaction
      });

      if (fullInventory) {
        const fullBefore = fullInventory.stockQuantity || 0;
        const fullAfter = fullBefore + purchase.quantity;
        await fullInventory.update({
          stockQuantity: fullAfter,
          totalPurchased: fullInventory.totalPurchased + purchase.quantity,
          lastPurchaseDate: new Date()
        }, { transaction });
        await logInventoryMutation({
          inventoryItem: fullInventory,
          quantityBefore: fullBefore,
          quantityAfter: fullAfter,
          sourceModule: 'purchase',
          sourceAction: 'confirm',
          sourceId: purchase.id,
          sourceRef: purchase.purchaseNumber,
          actorUserId: req.user?.id,
          notes: 'Gas purchase created full cylinder'
        }, transaction);
      } else {
        const created = await InventoryItem.create({
          productId: cylinderProductId,
          inventoryCategory: 'Full Cylinder',
          stockQuantity: purchase.quantity,
          totalPurchased: purchase.quantity,
          totalSold: 0,
          lastPurchaseDate: new Date()
        }, { transaction });
        await logInventoryMutation({
          inventoryItem: created,
          quantityBefore: 0,
          quantityAfter: purchase.quantity,
          sourceModule: 'purchase',
          sourceAction: 'confirm',
          sourceId: purchase.id,
          sourceRef: purchase.purchaseNumber,
          actorUserId: req.user?.id,
          notes: 'Gas purchase created full cylinder inventory'
        }, transaction);
      }

    } else if (purchase.purchaseType === 'Cylinder') {
      // CYLINDER purchase: create/update inventory based on condition
      const inventoryCategory = purchase.cylinderCondition === 'Full' ? 'Full Cylinder' : 'Empty Cylinder';

      let inventoryItem = await InventoryItem.findOne({ where: { productId: purchase.productId, inventoryCategory }, transaction });

      if (inventoryItem) {
        const beforeQty = inventoryItem.stockQuantity || 0;
        const afterQty = beforeQty + purchase.quantity;
        await inventoryItem.update({
          stockQuantity: afterQty,
          totalPurchased: inventoryItem.totalPurchased + purchase.quantity,
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
          notes: `Cylinder purchase (${inventoryCategory})`
        }, transaction);
      } else {
        const created = await InventoryItem.create({
          productId: purchase.productId,
          inventoryCategory,
          stockQuantity: purchase.quantity,
          totalPurchased: purchase.quantity,
          totalSold: 0,
          lastPurchaseDate: new Date()
        }, { transaction });
        await logInventoryMutation({
          inventoryItem: created,
          quantityBefore: 0,
          quantityAfter: purchase.quantity,
          sourceModule: 'purchase',
          sourceAction: 'confirm',
          sourceId: purchase.id,
          sourceRef: purchase.purchaseNumber,
          actorUserId: req.user?.id,
          notes: `Cylinder purchase (${inventoryCategory}) created`
        }, transaction);
      }

      // Update product stock for cylinder
      const product = purchase.product;
      if (product) {
        const productBefore = product.stockQuantity || 0;
        const productAfter = productBefore + purchase.quantity;
        await product.update({ stockQuantity: productAfter }, { transaction });
        await logProductMutation({
          product,
          quantityBefore: productBefore,
          quantityAfter: productAfter,
          sourceModule: 'purchase',
          sourceAction: 'confirm',
          sourceId: purchase.id,
          sourceRef: purchase.purchaseNumber,
          actorUserId: req.user?.id
        }, transaction);
      }

    } else {
      // TOOL purchases
      let inventoryItem = await InventoryItem.findOne({ where: { productId: purchase.productId, inventoryCategory: 'Tool' }, transaction });

      if (inventoryItem) {
        const beforeQty = inventoryItem.stockQuantity || 0;
        const afterQty = beforeQty + purchase.quantity;
        await inventoryItem.update({
          stockQuantity: afterQty,
          totalPurchased: inventoryItem.totalPurchased + purchase.quantity,
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
          notes: 'Tool purchase'
        }, transaction);
      } else {
        const created = await InventoryItem.create({
          productId: purchase.productId,
          inventoryCategory: 'Tool',
          stockQuantity: purchase.quantity,
          totalPurchased: purchase.quantity,
          totalSold: 0,
          lastPurchaseDate: new Date()
        }, { transaction });
        await logInventoryMutation({
          inventoryItem: created,
          quantityBefore: 0,
          quantityAfter: purchase.quantity,
          sourceModule: 'purchase',
          sourceAction: 'confirm',
          sourceId: purchase.id,
          sourceRef: purchase.purchaseNumber,
          actorUserId: req.user?.id,
          notes: 'Tool purchase created'
        }, transaction);
      }

      const product = purchase.product;
      if (product) {
        const productBefore = product.stockQuantity || 0;
        const productAfter = productBefore + purchase.quantity;
        await product.update({ stockQuantity: productAfter }, { transaction });
        await logProductMutation({
          product,
          quantityBefore: productBefore,
          quantityAfter: productAfter,
          sourceModule: 'purchase',
          sourceAction: 'confirm',
          sourceId: purchase.id,
          sourceRef: purchase.purchaseNumber,
          actorUserId: req.user?.id
        }, transaction);
      }
    }

    await transaction.commit();

    // Fetch updated purchase
    const updatedPurchase = await Purchase.findByPk(purchase.id, {
      include: [
        { model: Supplier, as: 'supplier' },
        { model: Product, as: 'product' },
        { model: Product, as: 'relatedProduct', required: false },
        { model: User, as: 'employee' }
      ]
    });

    res.status(200).json({ success: true, message: 'Purchase confirmed and inventory updated', data: updatedPurchase });
  } catch (error) {
    await transaction.rollback();
    console.error('Error confirming purchase:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// @desc    Cancel purchase
// @route   PUT /api/purchases/:id/cancel
// @access  Private (Super Admin)
exports.cancelPurchase = async (req, res) => {
  try {
    const purchase = await Purchase.findByPk(req.params.id);

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
  try {
    const purchase = await Purchase.findByPk(req.params.id);

    if (!purchase) {
      return res.status(404).json({
        success: false,
        message: 'Purchase not found'
      });
    }

    if (purchase.status === 'confirmed') {
      return res.status(400).json({
        success: false,
        message: 'Confirmed purchases cannot be deleted. Please cancel first.'
      });
    }

    await purchase.destroy();

    res.status(200).json({
      success: true,
      message: 'Purchase deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting purchase:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};
