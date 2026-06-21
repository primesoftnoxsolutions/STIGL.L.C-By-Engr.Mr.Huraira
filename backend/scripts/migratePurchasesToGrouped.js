/**
 * Migration Script: Convert Old Purchase Structure to Grouped Purchase Structure
 * 
 * This script migrates data from the old 'purchases' table to the new
 * 'purchase_headers' and 'purchase_items' tables.
 * 
 * Old Structure: Each item was a separate purchase record
 * New Structure: One purchase header with multiple items
 */

const { sequelize, Purchase, PurchaseHeader, PurchaseItem, Supplier, Product, User } = require('../models');

async function migratePurchases() {
  console.log('🔄 Starting purchase migration...\n');

  try {
    // Start transaction
    const transaction = await sequelize.transaction();

    try {
      // Get all existing purchases
      const oldPurchases = await Purchase.findAll({
        include: [
          { model: Supplier, as: 'supplier' },
          { model: Product, as: 'product' },
          { model: Product, as: 'relatedProduct', required: false },
          { model: User, as: 'employee' }
        ],
        order: [['createdAt', 'ASC']]
      });

      if (oldPurchases.length === 0) {
        console.log('✅ No purchases to migrate.');
        await transaction.commit();
        return;
      }

      console.log(`📦 Found ${oldPurchases.length} purchase records to migrate.\n`);

      // Group purchases by base purchase number (remove -1, -2, etc.)
      const purchaseGroups = {};
      
      oldPurchases.forEach(purchase => {
        // Extract base purchase number (e.g., PUR00001 from PUR00001-1)
        const basePurchaseNumber = purchase.purchaseNumber.split('-')[0];
        
        if (!purchaseGroups[basePurchaseNumber]) {
          purchaseGroups[basePurchaseNumber] = {
            header: purchase, // Use first item's data for header
            items: []
          };
        }
        
        purchaseGroups[basePurchaseNumber].items.push(purchase);
      });

      console.log(`📊 Grouped into ${Object.keys(purchaseGroups).length} purchase transactions.\n`);

      // Create new purchase headers and items
      let migratedCount = 0;

      for (const [basePurchaseNumber, group] of Object.entries(purchaseGroups)) {
        const headerData = group.header;

        // Calculate totals for the group
        let subtotal = 0;
        group.items.forEach(item => {
          subtotal += parseFloat(item.totalAmount);
        });
        const vat = subtotal * 0.05; // 5% VAT
        const grandTotal = subtotal + vat;

        // Create purchase header
        const purchaseHeader = await PurchaseHeader.create({
          purchaseNumber: basePurchaseNumber,
          supplierId: headerData.supplierId,
          supplierInvoiceNumber: headerData.supplierInvoiceNumber,
          purchaseDate: headerData.purchaseDate || headerData.createdAt,
          employeeId: headerData.employeeId,
          status: headerData.status,
          subtotal,
          vat,
          grandTotal,
          notes: headerData.notes,
          createdAt: headerData.createdAt,
          updatedAt: headerData.updatedAt
        }, { transaction });

        // Create purchase items
        for (const item of group.items) {
          await PurchaseItem.create({
            purchaseHeaderId: purchaseHeader.id,
            purchaseType: item.purchaseType,
            cylinderCondition: item.cylinderCondition,
            productId: item.productId,
            relatedProductId: item.relatedProductId,
            quantity: item.quantity,
            costPrice: item.costPrice,
            totalAmount: item.totalAmount,
            createdAt: item.createdAt,
            updatedAt: item.updatedAt
          }, { transaction });
        }

        migratedCount++;
        console.log(`✓ Migrated ${basePurchaseNumber}: ${group.items.length} item(s) | Total: AED ${grandTotal.toFixed(2)}`);
      }

      // Commit transaction
      await transaction.commit();

      console.log(`\n✅ Migration completed successfully!`);
      console.log(`📈 Summary:`);
      console.log(`   - Old purchase records: ${oldPurchases.length}`);
      console.log(`   - New purchase headers: ${migratedCount}`);
      console.log(`   - Total items migrated: ${oldPurchases.length}`);
      console.log(`\n💡 Note: Old purchase records are still in the 'purchases' table.`);
      console.log(`   The system will now use the new 'purchase_headers' and 'purchase_items' tables.`);

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
  migratePurchases()
    .then(() => {
      console.log('\n🎉 Migration process completed.');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Migration process failed:', error);
      process.exit(1);
    });
}

module.exports = migratePurchases;
