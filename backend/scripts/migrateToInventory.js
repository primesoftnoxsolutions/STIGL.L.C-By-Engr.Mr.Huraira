/**
 * Migration Script: Populate Inventory from Confirmed Purchases
 * 
 * This script migrates confirmed purchase items to the inventory_items table.
 */

const { sequelize, PurchaseHeader, PurchaseItem, InventoryItem, Product } = require('../models');

async function migrateToInventory() {
  console.log('🔄 Starting inventory migration from confirmed purchases...\n');

  try {
    const transaction = await sequelize.transaction();

    try {
      // Get all confirmed purchase headers with items
      const confirmedPurchases = await PurchaseHeader.findAll({
        where: { status: 'confirmed' },
        include: [
          {
            model: PurchaseItem,
            as: 'items',
            include: [{ model: Product, as: 'product' }]
          }
        ]
      });

      if (confirmedPurchases.length === 0) {
        console.log('✅ No confirmed purchases to migrate.');
        await transaction.commit();
        return;
      }

      console.log(`📦 Found ${confirmedPurchases.length} confirmed purchase(s) to process.\n`);

      let itemsProcessed = 0;
      let inventoryItemsCreated = 0;
      let inventoryItemsUpdated = 0;

      for (const purchase of confirmedPurchases) {
        for (const item of purchase.items) {
          // Determine inventory category
          let inventoryCategory;
          if (item.purchaseType === 'Gas') {
            inventoryCategory = 'Full Cylinder';
          } else if (item.purchaseType === 'Cylinder') {
            inventoryCategory = item.cylinderCondition === 'Full' ? 'Full Cylinder' : 'Empty Cylinder';
          } else {
            inventoryCategory = 'Tool';
          }

          // Find existing inventory item
          let inventoryItem = await InventoryItem.findOne({
            where: {
              productId: item.productId,
              inventoryCategory
            },
            transaction
          });

          if (inventoryItem) {
            // Update existing
            await inventoryItem.update({
              stockQuantity: inventoryItem.stockQuantity + item.quantity,
              totalPurchased: inventoryItem.totalPurchased + item.quantity,
              lastPurchaseDate: purchase.purchaseDate || purchase.createdAt
            }, { transaction });
            inventoryItemsUpdated++;
          } else {
            // Create new
            await InventoryItem.create({
              productId: item.productId,
              inventoryCategory,
              stockQuantity: item.quantity,
              totalPurchased: item.quantity,
              totalSold: 0,
              lastPurchaseDate: purchase.purchaseDate || purchase.createdAt
            }, { transaction });
            inventoryItemsCreated++;
          }

          itemsProcessed++;
          console.log(`✓ Processed: ${item.product?.productName} → ${inventoryCategory} (Qty: ${item.quantity})`);
        }
      }

      await transaction.commit();

      console.log(`\n✅ Migration completed successfully!`);
      console.log(`📈 Summary:`);
      console.log(`   - Purchase items processed: ${itemsProcessed}`);
      console.log(`   - New inventory items created: ${inventoryItemsCreated}`);
      console.log(`   - Existing inventory items updated: ${inventoryItemsUpdated}`);

    } catch (error) {
      await transaction.rollback();
      throw error;
    }

  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

// Run migration
if (require.main === module) {
  migrateToInventory()
    .then(() => {
      console.log('\n🎉 Inventory migration completed.');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Migration failed:', error);
      process.exit(1);
    });
}

module.exports = migrateToInventory;
