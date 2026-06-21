/**
 * Fix Inventory Data Script
 * 
 * This script:
 * 1. Clears all existing inventory_items
 * 2. Re-processes all confirmed purchases with correct logic:
 *    - Gas purchases: Decrease empty cylinders, increase full cylinders (using CYLINDER ID)
 *    - Cylinder purchases: Add to empty or full cylinder inventory
 *    - Tool purchases: Add to tools inventory
 */

const { sequelize, PurchaseHeader, PurchaseItem, InventoryItem, Product } = require('../models');

async function fixInventoryData() {
  console.log('🔄 Starting inventory data fix...\n');

  const transaction = await sequelize.transaction();

  try {
    // Step 1: Clear all existing inventory items
    console.log('🗑️  Clearing existing inventory data...');
    await InventoryItem.destroy({ where: {}, transaction });
    console.log('✓ Inventory cleared.\n');

    // Step 2: Get all confirmed purchases
    const confirmedPurchases = await PurchaseHeader.findAll({
      where: { status: 'confirmed' },
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
      order: [['createdAt', 'ASC']]
    });

    if (confirmedPurchases.length === 0) {
      console.log('✅ No confirmed purchases to process.');
      await transaction.commit();
      return;
    }

    console.log(`📦 Processing ${confirmedPurchases.length} confirmed purchase(s)...\n`);

    // Track inventory changes
    const inventoryMap = new Map(); // key: `${productId}-${category}`, value: { quantity, totalPurchased, totalSold, lastDate }

    for (const purchase of confirmedPurchases) {
      console.log(`\n📋 Processing Purchase: ${purchase.purchaseNumber}`);
      
      for (const item of purchase.items) {
        const purchaseDate = purchase.purchaseDate || purchase.createdAt;

        if (item.purchaseType === 'Gas') {
          // ============================================
          // GAS PURCHASE LOGIC
          // - Use CYLINDER product ID (relatedProductId) for inventory
          // - Decrease empty cylinder stock
          // - Increase full cylinder stock
          // ============================================
          
          const cylinderProductId = item.relatedProductId;
          
          if (!cylinderProductId) {
            console.log(`  ⚠️ Skipping gas item - no related cylinder`);
            continue;
          }

          const cylinderProduct = item.relatedProduct;
          console.log(`  💨 Gas: ${item.product?.productName} → Cylinder: ${cylinderProduct?.productName}`);

          // Decrease Empty Cylinder (consumed for gas filling - NOT sold)
          const emptyKey = `${cylinderProductId}-Empty Cylinder`;
          if (!inventoryMap.has(emptyKey)) {
            inventoryMap.set(emptyKey, { 
              productId: cylinderProductId, 
              category: 'Empty Cylinder',
              stockQuantity: 0, 
              totalPurchased: 0, 
              totalSold: 0, // Don't count gas filling as "sold"
              lastPurchaseDate: null,
              lastSaleDate: null
            });
          }
          const emptyInventory = inventoryMap.get(emptyKey);
          emptyInventory.stockQuantity -= item.quantity; // Decrease stock (consumed)
          // NOTE: NOT incrementing totalSold - cylinders are consumed for gas, not sold
          console.log(`     ⬇️ Empty Cylinder "${cylinderProduct?.productName}": -${item.quantity} (consumed for gas filling)`);

          // Increase Full Cylinder (using CYLINDER product ID, not gas ID)
          const fullKey = `${cylinderProductId}-Full Cylinder`;
          if (!inventoryMap.has(fullKey)) {
            inventoryMap.set(fullKey, { 
              productId: cylinderProductId, 
              category: 'Full Cylinder',
              stockQuantity: 0, 
              totalPurchased: 0, 
              totalSold: 0,
              lastPurchaseDate: null,
              lastSaleDate: null
            });
          }
          const fullInventory = inventoryMap.get(fullKey);
          fullInventory.stockQuantity += item.quantity; // Increase
          fullInventory.totalPurchased += item.quantity;
          fullInventory.lastPurchaseDate = purchaseDate;
          console.log(`     ⬆️ Full Cylinder "${cylinderProduct?.productName}": +${item.quantity} (filled with gas)`);

        } else if (item.purchaseType === 'Cylinder') {
          // ============================================
          // CYLINDER PURCHASE LOGIC
          // ============================================
          
          const category = item.cylinderCondition === 'Full' ? 'Full Cylinder' : 'Empty Cylinder';
          const key = `${item.productId}-${category}`;
          
          if (!inventoryMap.has(key)) {
            inventoryMap.set(key, { 
              productId: item.productId, 
              category,
              stockQuantity: 0, 
              totalPurchased: 0, 
              totalSold: 0,
              lastPurchaseDate: null,
              lastSaleDate: null
            });
          }
          
          const inventory = inventoryMap.get(key);
          inventory.stockQuantity += item.quantity;
          inventory.totalPurchased += item.quantity;
          inventory.lastPurchaseDate = purchaseDate;
          
          console.log(`  🔵 ${category} "${item.product?.productName}": +${item.quantity}`);

        } else if (item.purchaseType === 'Tool') {
          // ============================================
          // TOOL PURCHASE LOGIC
          // ============================================
          
          const key = `${item.productId}-Tool`;
          
          if (!inventoryMap.has(key)) {
            inventoryMap.set(key, { 
              productId: item.productId, 
              category: 'Tool',
              stockQuantity: 0, 
              totalPurchased: 0, 
              totalSold: 0,
              lastPurchaseDate: null,
              lastSaleDate: null
            });
          }
          
          const inventory = inventoryMap.get(key);
          inventory.stockQuantity += item.quantity;
          inventory.totalPurchased += item.quantity;
          inventory.lastPurchaseDate = purchaseDate;
          
          console.log(`  🔧 Tool "${item.product?.productName}": +${item.quantity}`);
        }
      }
    }

    // Step 3: Create inventory items from the map
    console.log('\n\n📝 Creating inventory records...\n');
    
    let created = 0;
    for (const [key, data] of inventoryMap.entries()) {
      // Only create if there's meaningful data (purchased or has stock)
      if (data.totalPurchased > 0 || data.stockQuantity !== 0) {
        await InventoryItem.create({
          productId: data.productId,
          inventoryCategory: data.category,
          stockQuantity: Math.max(0, data.stockQuantity), // Ensure non-negative
          totalPurchased: data.totalPurchased,
          totalSold: data.totalSold,
          lastPurchaseDate: data.lastPurchaseDate,
          lastSaleDate: data.lastSaleDate
        }, { transaction });
        
        const product = await Product.findByPk(data.productId);
        console.log(`✓ Created: ${product?.productName} → ${data.category} (Stock: ${Math.max(0, data.stockQuantity)}, Purchased: ${data.totalPurchased}, Sold: ${data.totalSold})`);
        created++;
      }
    }

    await transaction.commit();

    console.log(`\n✅ Inventory fix completed!`);
    console.log(`📈 Summary:`);
    console.log(`   - Purchases processed: ${confirmedPurchases.length}`);
    console.log(`   - Inventory items created: ${created}`);

  } catch (error) {
    await transaction.rollback();
    console.error('❌ Error fixing inventory:', error);
    throw error;
  }
}

// Run
if (require.main === module) {
  fixInventoryData()
    .then(() => {
      console.log('\n🎉 Done!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Failed:', error);
      process.exit(1);
    });
}

module.exports = fixInventoryData;
