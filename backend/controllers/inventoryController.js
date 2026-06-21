const { InventoryItem, Product, StockMutation, sequelize } = require('../models');
const { logInventoryMutation, logProductMutation } = require('../utils/stockLogger');
const { Op } = require('sequelize');
const { parseUaeDateInput } = require('../utils/uaeTime');
const { buildAssignedInventoryForUser } = require('../utils/assignedInventory');
const { isEmployeeRole, isManagerRole } = require('../utils/roles');

// @desc    Get all inventory items
// @route   GET /api/inventory
// @access  Private
exports.getAllInventory = async (req, res) => {
  try {
    const { category, search } = req.query;
    const where = {};

    if (isEmployeeRole(req.user.role) || isManagerRole(req.user.role)) {
      const { items, totals } = await buildAssignedInventoryForUser(req.user.id);
      const filtered = items.filter((item) => {
        const matchesCategory = !category || category === 'all' || item.inventoryCategory === category;
        const matchesSearch = !search || (
          item.product?.productName?.toLowerCase().includes(String(search).toLowerCase()) ||
          item.product?.productCode?.toLowerCase().includes(String(search).toLowerCase())
        );
        return matchesCategory && matchesSearch;
      });

      return res.status(200).json({
        success: true,
        count: filtered.length,
        totals,
        data: filtered
      });
    }

    // Filter by category
    if (category && category !== 'all') {
      where.inventoryCategory = category;
    }

    const inventory = await InventoryItem.findAll({
      where,
      include: [
        {
          model: Product,
          as: 'product',
          attributes: ['id', 'productCode', 'productName', 'productType', 'costPrice', 'leastSellingPrice'],
          where: search ? {
            [Op.or]: [
              { productName: { [Op.like]: `%${search}%` } },
              { productCode: { [Op.like]: `%${search}%` } }
            ]
          } : undefined
        }
      ],
      order: [['updatedAt', 'DESC']]
    });

    // Calculate totals for each category
    const totals = {
      'Full Cylinder': 0,
      'Empty Cylinder': 0,
      'Tool': 0
    };

    inventory.forEach(item => {
      totals[item.inventoryCategory] += item.stockQuantity;
    });

    res.status(200).json({
      success: true,
      count: inventory.length,
      totals,
      data: inventory
    });
  } catch (error) {
    console.error('Error fetching inventory:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Get inventory by category
// @route   GET /api/inventory/category/:category
// @access  Private
exports.getInventoryByCategory = async (req, res) => {
  try {
    const { category } = req.params;
    const { search } = req.query;

    if (isEmployeeRole(req.user.role) || isManagerRole(req.user.role)) {
      const { items } = await buildAssignedInventoryForUser(req.user.id);
      const filtered = items.filter((item) => {
        const matchesCategory = item.inventoryCategory === category;
        const matchesSearch = !search || (
          item.product?.productName?.toLowerCase().includes(String(search).toLowerCase()) ||
          item.product?.productCode?.toLowerCase().includes(String(search).toLowerCase())
        );
        return matchesCategory && matchesSearch;
      });

      const totalStock = filtered.reduce((sum, item) => sum + (item.stockQuantity || 0), 0);

      return res.status(200).json({
        success: true,
        count: filtered.length,
        totalStock,
        category,
        data: filtered
      });
    }

    // Validate category
    const validCategories = ['Full Cylinder', 'Empty Cylinder', 'Tool'];
    if (!validCategories.includes(category)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid category. Must be: Full Cylinder, Empty Cylinder, or Tool'
      });
    }

    const whereProduct = search ? {
      [Op.or]: [
        { productName: { [Op.like]: `%${search}%` } },
        { productCode: { [Op.like]: `%${search}%` } }
      ]
    } : undefined;

    const inventory = await InventoryItem.findAll({
      where: { inventoryCategory: category },
      include: [
        {
          model: Product,
          as: 'product',
          attributes: ['id', 'productCode', 'productName', 'productType', 'costPrice', 'leastSellingPrice'],
          where: whereProduct
        }
      ],
      order: [['updatedAt', 'DESC']]
    });

    // Calculate total stock for this category
    const totalStock = inventory.reduce((sum, item) => sum + item.stockQuantity, 0);

    res.status(200).json({
      success: true,
      count: inventory.length,
      totalStock,
      category,
      data: inventory
    });
  } catch (error) {
    console.error('Error fetching inventory by category:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Get inventory summary/counts
// @route   GET /api/inventory/summary
// @access  Private
exports.getInventorySummary = async (req, res) => {
  try {
    if (isEmployeeRole(req.user.role) || isManagerRole(req.user.role)) {
      const { totals } = await buildAssignedInventoryForUser(req.user.id);
      return res.status(200).json({
        success: true,
        data: totals
      });
    }

    const summary = await InventoryItem.findAll({
      attributes: [
        'inventoryCategory',
        [sequelize.fn('SUM', sequelize.col('stockQuantity')), 'totalStock'],
        [sequelize.fn('COUNT', sequelize.col('id')), 'itemCount']
      ],
      group: ['inventoryCategory']
    });

    // Convert to object format
    const summaryObj = {
      'Full Cylinder': { totalStock: 0, itemCount: 0 },
      'Empty Cylinder': { totalStock: 0, itemCount: 0 },
      'Tool': { totalStock: 0, itemCount: 0 }
    };

    summary.forEach(item => {
      summaryObj[item.inventoryCategory] = {
        totalStock: parseInt(item.getDataValue('totalStock')) || 0,
        itemCount: parseInt(item.getDataValue('itemCount')) || 0
      };
    });

    res.status(200).json({
      success: true,
      data: summaryObj
    });
  } catch (error) {
    console.error('Error fetching inventory summary:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Get stock mutation logs
// @route   GET /api/inventory/mutations
// @access  Private
exports.getStockMutations = async (req, res) => {
  try {
    const {
      limit,
      offset,
      targetType,
      targetId,
      productId,
      inventoryCategory,
      sourceModule,
      sourceAction,
      actorUserId,
      sourceId,
      sourceRef,
      since,
      until
    } = req.query || {};

    const where = {};
    if (targetType) where.targetType = targetType;
    if (targetId) where.targetId = targetId;
    if (productId) where.productId = productId;
    if (inventoryCategory) where.inventoryCategory = inventoryCategory;
    if (sourceModule) where.sourceModule = sourceModule;
    if (sourceAction) where.sourceAction = sourceAction;
    if (actorUserId) where.actorUserId = actorUserId;
    if (sourceId) where.sourceId = sourceId;
    if (sourceRef) where.sourceRef = sourceRef;

    const createdAt = {};
    const sinceDate = since ? parseUaeDateInput(since) : null;
    const untilDate = until ? parseUaeDateInput(until) : null;
    if (sinceDate && !Number.isNaN(sinceDate.getTime())) {
      createdAt[Op.gte] = sinceDate;
    }
    if (untilDate && !Number.isNaN(untilDate.getTime())) {
      createdAt[Op.lte] = untilDate;
    }
    if (Object.keys(createdAt).length > 0) {
      where.createdAt = createdAt;
    }

    const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 200, 1), 1000);
    const parsedOffset = Math.max(parseInt(offset, 10) || 0, 0);

    const result = await StockMutation.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
      limit: parsedLimit,
      offset: parsedOffset
    });

    res.status(200).json({
      success: true,
      count: result.rows.length,
      total: result.count,
      limit: parsedLimit,
      offset: parsedOffset,
      data: result.rows
    });
  } catch (error) {
    console.error('Error fetching stock mutations:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Deduct stock (called when sale is made)
// @route   POST /api/inventory/:id/deduct
// @access  Private
exports.deductStock = async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { quantity } = req.body;
    const inventoryItem = await InventoryItem.findByPk(req.params.id, { transaction });

    if (!inventoryItem) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: 'Inventory item not found'
      });
    }

    if (!quantity || quantity < 1) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Quantity must be greater than 0'
      });
    }

    if (inventoryItem.stockQuantity < quantity) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: `Insufficient stock. Available: ${inventoryItem.stockQuantity}, Requested: ${quantity}`
      });
    }

    // Deduct stock but NEVER delete the item
    const beforeQty = inventoryItem.stockQuantity;
    const afterQty = inventoryItem.stockQuantity - quantity;
    await inventoryItem.update({
      stockQuantity: afterQty,
      totalSold: inventoryItem.totalSold + quantity,
      lastSaleDate: new Date()
    }, { transaction });

    await logInventoryMutation({
      inventoryItem,
      quantityBefore: beforeQty,
      quantityAfter: afterQty,
      sourceModule: 'inventory',
      sourceAction: 'deduct',
      sourceId: inventoryItem.id,
      actorUserId: req.user?.id,
      notes: `Manual deduct ${quantity}`
    }, transaction);

    // Also update product stock
    const product = await Product.findByPk(inventoryItem.productId, { transaction });
    if (product) {
      const productBefore = product.stockQuantity || 0;
      const productAfter = Math.max(0, productBefore - quantity);
      await product.update({
        stockQuantity: productAfter
      }, { transaction });

      await logProductMutation({
        product,
        quantityBefore: productBefore,
        quantityAfter: productAfter,
        sourceModule: 'inventory',
        sourceAction: 'deduct',
        sourceId: inventoryItem.id,
        actorUserId: req.user?.id,
        notes: `Manual deduct ${quantity}`
      }, transaction);
    }

    await transaction.commit();

    // Fetch updated item
    const updatedItem = await InventoryItem.findByPk(inventoryItem.id, {
      include: [{ model: Product, as: 'product' }]
    });

    res.status(200).json({
      success: true,
      message: `Stock deducted. New quantity: ${updatedItem.stockQuantity}`,
      data: updatedItem
    });
  } catch (error) {
    await transaction.rollback();
    console.error('Error deducting stock:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Get available empty cylinders for gas purchase
// @route   GET /api/inventory/available-empty-cylinders
// @access  Private
exports.getAvailableEmptyCylinders = async (req, res) => {
  try {
    if (isEmployeeRole(req.user.role) || isManagerRole(req.user.role)) {
      const { items } = await buildAssignedInventoryForUser(req.user.id);
      const emptyCylinders = items
        .filter(item => item.inventoryCategory === 'Empty Cylinder' && item.stockQuantity > 0)
        .map(item => ({
          id: item.id,
          productId: item.productId,
          inventoryCategory: item.inventoryCategory,
          stockQuantity: item.stockQuantity,
          product: item.product
        }));

      return res.status(200).json({
        success: true,
        count: emptyCylinders.length,
        data: emptyCylinders
      });
    }

    // Get all empty cylinder inventory items with stock > 0
    const emptyCylinders = await InventoryItem.findAll({
      where: {
        inventoryCategory: 'Empty Cylinder',
        stockQuantity: {
          [require('sequelize').Op.gt]: 0
        }
      },
      include: [
        {
          model: Product,
          as: 'product',
          where: {
            productType: 'Cylinder' // Only cylinder products
          },
          attributes: ['id', 'productCode', 'productName', 'productType', 'costPrice']
        }
      ],
      order: [[{ model: Product, as: 'product' }, 'productName', 'ASC']]
    });

    res.status(200).json({
      success: true,
      count: emptyCylinders.length,
      data: emptyCylinders
    });
  } catch (error) {
    console.error('Error fetching available empty cylinders:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

module.exports = exports;
