const { Op } = require('sequelize');
const { CustomerItemRate, Customer, Product, sequelize } = require('../models');
const {
  normalizeCustomerItemRateType,
  getExpectedProductTypeForCustomerRate,
  ensureCustomerItemRateSchema
} = require('../utils/customerItemRate');

// @desc    Get customer item rates
// @route   GET /api/customer-item-rates?customerId=...
// @access  Private
exports.getCustomerItemRates = async (req, res) => {
  try {
    await ensureCustomerItemRateSchema(sequelize, CustomerItemRate);
    const { customerId, itemType } = req.query;

    if (!customerId) {
      return res.status(400).json({
        success: false,
        message: 'Customer is required'
      });
    }

    const normalizedType = itemType ? normalizeCustomerItemRateType(itemType) : null;
    if (itemType && !normalizedType) {
      return res.status(400).json({
        success: false,
        message: 'Invalid item type'
      });
    }

    const rates = await CustomerItemRate.findAll({
      where: {
        customerId,
        ...(normalizedType ? { itemType: normalizedType } : {})
      },
      include: [{ model: Product, as: 'product' }],
      order: [['updatedAt', 'DESC']]
    });

    return res.status(200).json({
      success: true,
      count: rates.length,
      data: rates
    });
  } catch (error) {
    console.error('Failed to fetch customer item rates:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Create/update customer item rates (bulk upsert)
// @route   POST /api/customer-item-rates
// @access  Private
exports.saveCustomerItemRates = async (req, res) => {
  try {
    await ensureCustomerItemRateSchema(sequelize, CustomerItemRate);
    const { customerId, items } = req.body;

    if (!customerId) {
      return res.status(400).json({
        success: false,
        message: 'Customer is required'
      });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one item rate is required'
      });
    }

    const customer = await Customer.findByPk(customerId);
    if (!customer) {
      return res.status(400).json({
        success: false,
        message: 'Invalid customer'
      });
    }

    const normalizedItems = [];
    const uniqueKeys = new Set();

    for (const item of items) {
      const normalizedType = normalizeCustomerItemRateType(item.itemType);
      const itemId = item.itemId;
      const rate = parseFloat(item.rate);

      if (!normalizedType || !itemId || !Number.isFinite(rate) || rate <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Item type, item, and rate are required and must be valid'
        });
      }

      const key = `${normalizedType}::${itemId}`;
      if (uniqueKeys.has(key)) {
        return res.status(400).json({
          success: false,
          message: 'Duplicate item rates are not allowed'
        });
      }

      uniqueKeys.add(key);
      normalizedItems.push({ itemType: normalizedType, itemId, rate });
    }

    const productIds = normalizedItems.map((item) => item.itemId);
    const products = await Product.findAll({ where: { id: productIds } });
    const productMap = new Map(products.map((product) => [product.id, product]));

    for (const item of normalizedItems) {
      const product = productMap.get(item.itemId);
      if (!product) {
        return res.status(400).json({
          success: false,
          message: 'Invalid item selected'
        });
      }
      const expectedProductType = getExpectedProductTypeForCustomerRate(item.itemType);
      if (expectedProductType && product.productType && product.productType !== expectedProductType) {
        return res.status(400).json({
          success: false,
          message: 'Item type does not match selected item'
        });
      }
    }

    await sequelize.transaction(async (transaction) => {
      for (const item of normalizedItems) {
        const existing = await CustomerItemRate.findOne({
          where: {
            customerId,
            itemId: item.itemId,
            itemType: item.itemType === 'Full Cylinder'
              ? { [Op.in]: ['Full Cylinder', 'Cylinder'] }
              : item.itemType
          },
          transaction
        });

        if (existing) {
          await existing.update(
            {
              itemType: item.itemType,
              rate: item.rate
            },
            { transaction }
          );
        } else {
          await CustomerItemRate.create(
            {
              customerId,
              itemType: item.itemType,
              itemId: item.itemId,
              rate: item.rate
            },
            { transaction }
          );
        }
      }
    });

    const updatedRates = await CustomerItemRate.findAll({
      where: { customerId },
      include: [{ model: Product, as: 'product' }],
      order: [['updatedAt', 'DESC']]
    });

    return res.status(200).json({
      success: true,
      count: updatedRates.length,
      data: updatedRates,
      message: 'Customer item rates saved successfully'
    });
  } catch (error) {
    console.error('Failed to save customer item rates:', error);
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({
        success: false,
        message: 'Duplicate item rate detected'
      });
    }
    if (error.name === 'SequelizeValidationError') {
      return res.status(400).json({
        success: false,
        message: error.errors?.[0]?.message || 'Validation error'
      });
    }
    return res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};
