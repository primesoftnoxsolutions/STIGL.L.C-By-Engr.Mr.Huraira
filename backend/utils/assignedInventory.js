const { Op } = require('sequelize');
const {
  StockTransfer,
  StockTransferItem,
  SalesInvoice,
  SalesInvoiceItem,
  Product,
  sequelize
} = require('../models');

const mapItemTypeToCategory = (itemType) => {
  if (itemType === 'Gas') return 'Full Cylinder';
  if (itemType === 'Empty Cylinder') return 'Empty Cylinder';
  if (itemType === 'Tool') return 'Tool';
  return itemType;
};

const buildAssignedInventoryForUser = async (userId) => {
  if (!userId) {
    return { items: [], totals: {} };
  }

  const inboundItems = await StockTransferItem.findAll({
    include: [
      {
        model: StockTransfer,
        as: 'transfer',
        attributes: ['id', 'transferType', 'status', 'createdAt', 'updatedAt', 'createdBy', 'employeeId'],
        where: { employeeId: userId }
      },
      {
        model: Product,
        as: 'product',
        attributes: ['id', 'productCode', 'productName', 'productType', 'costPrice', 'leastSellingPrice']
      }
    ],
    order: [['createdAt', 'ASC']]
  });

  const outboundItems = await StockTransferItem.findAll({
    include: [
      {
        model: StockTransfer,
        as: 'transfer',
        attributes: ['id', 'transferType', 'status', 'createdAt', 'updatedAt', 'createdBy', 'employeeId'],
        where: {
          createdBy: userId,
          transferType: 'assign',
          employeeId: { [Op.ne]: userId },
          status: { [Op.in]: ['assigned', 'received'] }
        }
      },
      {
        model: Product,
        as: 'product',
        attributes: ['id', 'productCode', 'productName', 'productType', 'costPrice', 'leastSellingPrice']
      }
    ],
    order: [['createdAt', 'ASC']]
  });

  const entries = new Map();

  const bumpEntry = (item, deltaQty, updatedAt) => {
    const key = `${item.itemType}:${item.productId}`;
    const existing = entries.get(key) || {
      id: `assigned-${userId}-${item.itemType}-${item.productId}`,
      productId: item.productId,
      itemType: item.itemType,
      product: item.product || null,
      stockQuantity: 0,
      lastUpdated: null
    };
    existing.stockQuantity += deltaQty;
    const nextUpdated = updatedAt || item.updatedAt;
    if (!existing.lastUpdated || (nextUpdated && nextUpdated > existing.lastUpdated)) {
      existing.lastUpdated = nextUpdated;
    }
    entries.set(key, existing);
  };

  inboundItems.forEach((item) => {
    const transfer = item.transfer;
    if (!transfer) return;
    if (transfer.transferType === 'assign' && transfer.status === 'received') {
      bumpEntry(item, item.quantity || 0, transfer.updatedAt || transfer.createdAt);
    }
    if (transfer.transferType === 'return' && ['pending', 'received'].includes(transfer.status)) {
      bumpEntry(item, -(item.quantity || 0), transfer.updatedAt || transfer.createdAt);
    }
  });

  outboundItems.forEach((item) => {
    const transfer = item.transfer;
    if (!transfer) return;
    bumpEntry(item, -(item.quantity || 0), transfer.updatedAt || transfer.createdAt);
  });

  const soldRows = await SalesInvoiceItem.findAll({
    attributes: [
      'productId',
      [sequelize.fn('SUM', sequelize.col('SalesInvoiceItem.quantity')), 'totalQty']
    ],
    where: { saleType: 'Gas' },
    include: [
      {
        model: SalesInvoice,
        as: 'invoice',
        attributes: [],
        where: {
          employeeId: userId,
          status: { [Op.notIn]: ['cancelled', 'deleted'] }
        }
      }
    ],
    group: ['productId']
  });

  soldRows.forEach((row) => {
    const productId = row.productId;
    const qty = parseInt(row.get('totalQty'), 10) || 0;
    const key = `Gas:${productId}`;
    const existing = entries.get(key);
    if (!existing) return;
    existing.stockQuantity -= qty;
    if (existing.stockQuantity < 0) {
      existing.stockQuantity = 0;
    }
  });

  const items = Array.from(entries.values()).map((entry) => ({
    id: entry.id,
    productId: entry.productId,
    itemType: entry.itemType,
    inventoryCategory: mapItemTypeToCategory(entry.itemType),
    stockQuantity: Math.max(0, entry.stockQuantity || 0),
    product: entry.product,
    lastPurchaseDate: entry.lastUpdated
  }));

  const totals = {
    'Full Cylinder': { totalStock: 0, itemCount: 0 },
    'Empty Cylinder': { totalStock: 0, itemCount: 0 },
    Tool: { totalStock: 0, itemCount: 0 }
  };

  items.forEach((item) => {
    const category = item.inventoryCategory;
    if (!totals[category]) {
      totals[category] = { totalStock: 0, itemCount: 0 };
    }
    totals[category].totalStock += item.stockQuantity || 0;
    totals[category].itemCount += 1;
  });

  return { items, totals };
};

const getAssignedStockQuantity = async (userId, itemType, productId) => {
  const { items } = await buildAssignedInventoryForUser(userId);
  const match = items.find((item) => item.itemType === itemType && item.productId === productId);
  return match ? match.stockQuantity || 0 : 0;
};

module.exports = {
  mapItemTypeToCategory,
  buildAssignedInventoryForUser,
  getAssignedStockQuantity
};
