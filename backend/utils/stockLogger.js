const { StockMutation } = require('../models');

const safeInt = (value) => {
  const num = parseInt(value, 10);
  return Number.isNaN(num) ? 0 : num;
};

const logStockMutation = async (payload, transaction) => {
  if (!StockMutation) return;
  const record = {
    targetType: payload.targetType,
    targetId: payload.targetId,
    productId: payload.productId || null,
    inventoryCategory: payload.inventoryCategory || null,
    quantityBefore: safeInt(payload.quantityBefore),
    quantityAfter: safeInt(payload.quantityAfter),
    delta: safeInt(payload.delta),
    sourceModule: payload.sourceModule || 'unknown',
    sourceAction: payload.sourceAction || 'unknown',
    sourceId: payload.sourceId || null,
    sourceRef: payload.sourceRef || null,
    actorUserId: payload.actorUserId || null,
    notes: payload.notes || null
  };

  if (record.delta === 0 && record.quantityBefore === record.quantityAfter) {
    return;
  }

  try {
    await StockMutation.create(record, transaction ? { transaction } : undefined);
  } catch (error) {
    console.error('Failed to log stock mutation:', error.message);
  }
};

const logInventoryMutation = async ({
  inventoryItem,
  quantityBefore,
  quantityAfter,
  sourceModule,
  sourceAction,
  sourceId,
  sourceRef,
  actorUserId,
  notes,
  transaction
}) => {
  if (!inventoryItem) return;
  await logStockMutation({
    targetType: 'inventory_item',
    targetId: inventoryItem.id,
    productId: inventoryItem.productId,
    inventoryCategory: inventoryItem.inventoryCategory,
    quantityBefore,
    quantityAfter,
    delta: safeInt(quantityAfter) - safeInt(quantityBefore),
    sourceModule,
    sourceAction,
    sourceId,
    sourceRef,
    actorUserId,
    notes
  }, transaction);
};

const logProductMutation = async ({
  product,
  quantityBefore,
  quantityAfter,
  sourceModule,
  sourceAction,
  sourceId,
  sourceRef,
  actorUserId,
  notes,
  transaction
}) => {
  if (!product) return;
  await logStockMutation({
    targetType: 'product',
    targetId: product.id,
    productId: product.id,
    inventoryCategory: product.productType || null,
    quantityBefore,
    quantityAfter,
    delta: safeInt(quantityAfter) - safeInt(quantityBefore),
    sourceModule,
    sourceAction,
    sourceId,
    sourceRef,
    actorUserId,
    notes
  }, transaction);
};

module.exports = {
  logInventoryMutation,
  logProductMutation
};
