const { DataTypes } = require('sequelize');

const CUSTOMER_ITEM_RATE_TYPES = ['Gas', 'Full Cylinder', 'Empty Cylinder', 'Tool'];

let customerItemRateSchemaReady = false;

const normalizeCustomerItemRateType = (value, options = {}) => {
  const { preserveLegacyCylinder = false } = options;
  if (!value) return null;

  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'gas') return 'Gas';
  if (normalized === 'tool') return 'Tool';
  if (
    normalized === 'full cylinder' ||
    normalized === 'full-cylinder' ||
    normalized === 'full_cylinder'
  ) {
    return 'Full Cylinder';
  }
  if (
    normalized === 'empty cylinder' ||
    normalized === 'empty-cylinder' ||
    normalized === 'empty_cylinder'
  ) {
    return 'Empty Cylinder';
  }
  if (normalized === 'cylinder') {
    return preserveLegacyCylinder ? 'Cylinder' : 'Full Cylinder';
  }
  return null;
};

const getExpectedProductTypeForCustomerRate = (itemType) => {
  const normalizedType = normalizeCustomerItemRateType(itemType);
  if (!normalizedType) return null;
  if (normalizedType === 'Full Cylinder' || normalizedType === 'Empty Cylinder') {
    return 'Cylinder';
  }
  return normalizedType;
};

const buildCustomerRateLookupKey = (itemType, itemId) => {
  const normalizedType = normalizeCustomerItemRateType(itemType);
  if (!normalizedType || !itemId) return null;
  return `${normalizedType}::${itemId}`;
};

const ensureCustomerItemRateSchema = async (sequelize, CustomerItemRate) => {
  if (customerItemRateSchemaReady || !sequelize) return;

  const queryInterface = sequelize.getQueryInterface();
  const description = await queryInterface.describeTable('customer_item_rates');
  if (!description?.itemType) {
    customerItemRateSchemaReady = true;
    return;
  }

  await queryInterface.changeColumn('customer_item_rates', 'itemType', {
    type: DataTypes.STRING(30),
    allowNull: false
  });

  if (CustomerItemRate?.update) {
    await CustomerItemRate.update(
      { itemType: 'Full Cylinder' },
      { where: { itemType: 'Cylinder' } }
    );
  }

  customerItemRateSchemaReady = true;
};

module.exports = {
  CUSTOMER_ITEM_RATE_TYPES,
  normalizeCustomerItemRateType,
  getExpectedProductTypeForCustomerRate,
  buildCustomerRateLookupKey,
  ensureCustomerItemRateSchema
};
