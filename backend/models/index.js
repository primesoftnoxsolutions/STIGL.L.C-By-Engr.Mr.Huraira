const sequelize = require('../config/database');
const User = require('./User');
const Cylinder = require('./Cylinder');
const Customer = require('./Customer');
const SalesInvoice = require('./SalesInvoice');
const SalesInvoiceItem = require('./SalesInvoiceItem');
const Rental = require('./Rental');
const Quotation = require('./Quotation');
const QuotationItem = require('./QuotationItem');
const Payment = require('./Payment');
const CompanySettings = require('./CompanySettings');
const Product = require('./Product');
const Supplier = require('./Supplier');
const Purchase = require('./Purchase');
const PurchaseHeader = require('./PurchaseHeader');
const PurchaseItem = require('./PurchaseItem');
const InventoryItem = require('./InventoryItem');
const Deposit = require('./Deposit');
const DepositItem = require('./DepositItem');
const DepositReturn = require('./DepositReturn');
const DepositReturnItem = require('./DepositReturnItem');
const DailyStock = require('./DailyStock');
const RentalItem = require('./RentalItem');
const ReceivingInvoice = require('./ReceivingInvoice');
const ReceivingInvoiceItem = require('./ReceivingInvoiceItem');
const InactiveCustomerRead = require('./InactiveCustomerRead');
const StockTransfer = require('./StockTransfer');
const StockTransferItem = require('./StockTransferItem');
const Notification = require('./Notification');
const CustomerItemRate = require('./CustomerItemRate');
const StockMutation = require('./StockMutation');
const MonthlyDashboardSnapshot = require('./MonthlyDashboardSnapshot');
const MaintenanceRun = require('./MaintenanceRun');
const SystemActivityLog = require('./SystemActivityLog');
const MaintenanceNotificationDismissal = require('./MaintenanceNotificationDismissal');
const Expense = require('./Expense');

// Define relationships

// User - Cylinder (Employee assigned to cylinders)
User.hasMany(Cylinder, { foreignKey: 'assignedToId', as: 'assignedCylinders' });
Cylinder.belongsTo(User, { foreignKey: 'assignedToId', as: 'assignedEmployee' });

// Customer - SalesInvoice
Customer.hasMany(SalesInvoice, { foreignKey: 'customerId', as: 'invoices' });
SalesInvoice.belongsTo(Customer, { foreignKey: 'customerId', as: 'customer' });

// User - SalesInvoice (Employee created invoice)
User.hasMany(SalesInvoice, { foreignKey: 'employeeId', as: 'createdInvoices' });
SalesInvoice.belongsTo(User, { foreignKey: 'employeeId', as: 'employee' });

// SalesInvoice - SalesInvoiceItem
SalesInvoice.hasMany(SalesInvoiceItem, { foreignKey: 'invoiceId', as: 'items' });
SalesInvoiceItem.belongsTo(SalesInvoice, { foreignKey: 'invoiceId', as: 'invoice' });

// Cylinder - SalesInvoiceItem
Cylinder.hasMany(SalesInvoiceItem, { foreignKey: 'cylinderId', as: 'invoiceItems' });
SalesInvoiceItem.belongsTo(Cylinder, { foreignKey: 'cylinderId', as: 'cylinder' });

// Customer - Rental
Customer.hasMany(Rental, { foreignKey: 'customerId', as: 'rentals' });
Rental.belongsTo(Customer, { foreignKey: 'customerId', as: 'customer' });

// Cylinder - Rental
Cylinder.hasMany(Rental, { foreignKey: 'cylinderId', as: 'rentals' });
Rental.belongsTo(Cylinder, { foreignKey: 'cylinderId', as: 'cylinder' });

// User - Rental
User.hasMany(Rental, { foreignKey: 'employeeId', as: 'managedRentals' });
Rental.belongsTo(User, { foreignKey: 'employeeId', as: 'employee' });

// Customer - Quotation
Customer.hasMany(Quotation, { foreignKey: 'customerId', as: 'quotations' });
Quotation.belongsTo(Customer, { foreignKey: 'customerId', as: 'customer' });

// User - Quotation
User.hasMany(Quotation, { foreignKey: 'employeeId', as: 'createdQuotations' });
Quotation.belongsTo(User, { foreignKey: 'employeeId', as: 'employee' });

// Quotation - QuotationItem
Quotation.hasMany(QuotationItem, { foreignKey: 'quotationId', as: 'items' });
QuotationItem.belongsTo(Quotation, { foreignKey: 'quotationId', as: 'quotation' });

// Customer - Payment
Customer.hasMany(Payment, { foreignKey: 'customerId', as: 'payments' });
Payment.belongsTo(Customer, { foreignKey: 'customerId', as: 'customer' });

// SalesInvoice - Payment
SalesInvoice.hasMany(Payment, { foreignKey: 'invoiceId', as: 'payments' });
Payment.belongsTo(SalesInvoice, { foreignKey: 'invoiceId', as: 'invoice' });

// Rental - Payment
Rental.hasMany(Payment, { foreignKey: 'rentalId', as: 'payments' });
Payment.belongsTo(Rental, { foreignKey: 'rentalId', as: 'rental' });

// Rental - RentalItem
Rental.hasMany(RentalItem, { foreignKey: 'rentalId', as: 'items' });
RentalItem.belongsTo(Rental, { foreignKey: 'rentalId', as: 'rental' });

// Product - RentalItem
Product.hasMany(RentalItem, { foreignKey: 'productId', as: 'rentalItems' });
RentalItem.belongsTo(Product, { foreignKey: 'productId', as: 'product' });

// User - Payment
User.hasMany(Payment, { foreignKey: 'employeeId', as: 'receivedPayments' });
Payment.belongsTo(User, { foreignKey: 'employeeId', as: 'employee' });

// Supplier - Purchase
Supplier.hasMany(Purchase, { foreignKey: 'supplierId', as: 'purchases' });
Purchase.belongsTo(Supplier, { foreignKey: 'supplierId', as: 'supplier' });

// User - Purchase (Employee created purchase)
User.hasMany(Purchase, { foreignKey: 'employeeId', as: 'createdPurchases' });
Purchase.belongsTo(User, { foreignKey: 'employeeId', as: 'employee' });

// Product - Purchase (Main product)
Product.hasMany(Purchase, { foreignKey: 'productId', as: 'purchases' });
Purchase.belongsTo(Product, { foreignKey: 'productId', as: 'product' });

// Product - Purchase (Related product)
Product.hasMany(Purchase, { foreignKey: 'relatedProductId', as: 'relatedPurchases' });
Purchase.belongsTo(Product, { foreignKey: 'relatedProductId', as: 'relatedProduct' });

// NEW: PurchaseHeader relationships
Supplier.hasMany(PurchaseHeader, { foreignKey: 'supplierId', as: 'purchaseHeaders' });
PurchaseHeader.belongsTo(Supplier, { foreignKey: 'supplierId', as: 'supplier' });

User.hasMany(PurchaseHeader, { foreignKey: 'employeeId', as: 'createdPurchaseHeaders' });
PurchaseHeader.belongsTo(User, { foreignKey: 'employeeId', as: 'employee' });

// NEW: PurchaseHeader - PurchaseItem
PurchaseHeader.hasMany(PurchaseItem, { foreignKey: 'purchaseHeaderId', as: 'items' });
PurchaseItem.belongsTo(PurchaseHeader, { foreignKey: 'purchaseHeaderId', as: 'purchaseHeader' });

// NEW: Product - PurchaseItem (Main product)
Product.hasMany(PurchaseItem, { foreignKey: 'productId', as: 'purchaseItems' });
PurchaseItem.belongsTo(Product, { foreignKey: 'productId', as: 'product' });

// NEW: Product - PurchaseItem (Related product)
Product.hasMany(PurchaseItem, { foreignKey: 'relatedProductId', as: 'relatedPurchaseItems' });
PurchaseItem.belongsTo(Product, { foreignKey: 'relatedProductId', as: 'relatedProduct' });

// NEW: Product - InventoryItem
Product.hasMany(InventoryItem, { foreignKey: 'productId', as: 'inventoryItems' });
InventoryItem.belongsTo(Product, { foreignKey: 'productId', as: 'product' });

// Deposit relationships
Customer.hasMany(Deposit, { foreignKey: 'customerId', as: 'deposits' });
Deposit.belongsTo(Customer, { foreignKey: 'customerId', as: 'customer' });

User.hasMany(Deposit, { foreignKey: 'employeeId', as: 'deposits' });
Deposit.belongsTo(User, { foreignKey: 'employeeId', as: 'employee' });

Deposit.hasMany(DepositItem, { foreignKey: 'depositId', as: 'items' });
DepositItem.belongsTo(Deposit, { foreignKey: 'depositId', as: 'deposit' });

Product.hasMany(DepositItem, { foreignKey: 'productId', as: 'depositItems' });
DepositItem.belongsTo(Product, { foreignKey: 'productId', as: 'product' });

// Deposit returns
Customer.hasMany(DepositReturn, { foreignKey: 'customerId', as: 'depositReturns' });
DepositReturn.belongsTo(Customer, { foreignKey: 'customerId', as: 'customer' });

User.hasMany(DepositReturn, { foreignKey: 'employeeId', as: 'depositReturns' });
DepositReturn.belongsTo(User, { foreignKey: 'employeeId', as: 'employee' });

DepositReturn.hasMany(DepositReturnItem, { foreignKey: 'depositReturnId', as: 'items' });
DepositReturnItem.belongsTo(DepositReturn, { foreignKey: 'depositReturnId', as: 'depositReturn' });

Deposit.hasMany(DepositReturnItem, { foreignKey: 'depositId', as: 'returnItems' });
DepositReturnItem.belongsTo(Deposit, { foreignKey: 'depositId', as: 'deposit' });

DepositItem.hasMany(DepositReturnItem, { foreignKey: 'depositItemId', as: 'returnItems' });
DepositReturnItem.belongsTo(DepositItem, { foreignKey: 'depositItemId', as: 'depositItem' });

Product.hasMany(DepositReturnItem, { foreignKey: 'productId', as: 'depositReturnItems' });
DepositReturnItem.belongsTo(Product, { foreignKey: 'productId', as: 'product' });

// ReceivingInvoice relationships
Customer.hasMany(ReceivingInvoice, { foreignKey: 'customerId', as: 'receivingInvoices' });
ReceivingInvoice.belongsTo(Customer, { foreignKey: 'customerId', as: 'customer' });

User.hasMany(ReceivingInvoice, { foreignKey: 'employeeId', as: 'createdReceivingInvoices' });
ReceivingInvoice.belongsTo(User, { foreignKey: 'employeeId', as: 'employee' });

ReceivingInvoice.hasMany(ReceivingInvoiceItem, { foreignKey: 'receivingInvoiceId', as: 'items' });
ReceivingInvoiceItem.belongsTo(ReceivingInvoice, { foreignKey: 'receivingInvoiceId', as: 'receivingInvoice' });

SalesInvoice.hasMany(ReceivingInvoiceItem, { foreignKey: 'salesInvoiceId', as: 'receivingItems' });
ReceivingInvoiceItem.belongsTo(SalesInvoice, { foreignKey: 'salesInvoiceId', as: 'salesInvoice' });

Payment.hasMany(ReceivingInvoiceItem, { foreignKey: 'paymentId', as: 'receivingItems' });
ReceivingInvoiceItem.belongsTo(Payment, { foreignKey: 'paymentId', as: 'payment' });

// Inactive customer notifications (per user)
User.hasOne(InactiveCustomerRead, { foreignKey: 'userId', as: 'inactiveCustomerRead' });
InactiveCustomerRead.belongsTo(User, { foreignKey: 'userId', as: 'user' });

// Notifications
User.hasMany(Notification, { foreignKey: 'userId', as: 'notifications' });
Notification.belongsTo(User, { foreignKey: 'userId', as: 'user' });

// Maintenance notifications
User.hasMany(MaintenanceNotificationDismissal, { foreignKey: 'userId', as: 'maintenanceDismissals' });
MaintenanceNotificationDismissal.belongsTo(User, { foreignKey: 'userId', as: 'user' });
MaintenanceRun.hasMany(MaintenanceNotificationDismissal, { foreignKey: 'maintenanceRunId', as: 'dismissals' });
MaintenanceNotificationDismissal.belongsTo(MaintenanceRun, { foreignKey: 'maintenanceRunId', as: 'maintenanceRun' });
User.hasMany(SystemActivityLog, { foreignKey: 'actorUserId', as: 'activityLogs' });
SystemActivityLog.belongsTo(User, { foreignKey: 'actorUserId', as: 'actor' });

// Customer item rates
Customer.hasMany(CustomerItemRate, { foreignKey: 'customerId', as: 'itemRates' });
CustomerItemRate.belongsTo(Customer, { foreignKey: 'customerId', as: 'customer' });

Product.hasMany(CustomerItemRate, { foreignKey: 'itemId', as: 'customerItemRates' });
CustomerItemRate.belongsTo(Product, { foreignKey: 'itemId', as: 'product' });

// Stock transfer relationships
User.hasMany(StockTransfer, { foreignKey: 'employeeId', as: 'stockTransfers' });
StockTransfer.belongsTo(User, { foreignKey: 'employeeId', as: 'employee' });

User.hasMany(StockTransfer, { foreignKey: 'createdBy', as: 'createdStockTransfers' });
StockTransfer.belongsTo(User, { foreignKey: 'createdBy', as: 'creator' });

StockTransfer.hasMany(StockTransferItem, { foreignKey: 'stockTransferId', as: 'items' });
StockTransferItem.belongsTo(StockTransfer, { foreignKey: 'stockTransferId', as: 'transfer' });

Product.hasMany(StockTransferItem, { foreignKey: 'productId', as: 'stockTransferItems' });
StockTransferItem.belongsTo(Product, { foreignKey: 'productId', as: 'product' });

// Daily stock relationships
Product.hasMany(DailyStock, { foreignKey: 'productId', as: 'dailyStocks' });
DailyStock.belongsTo(Product, { foreignKey: 'productId', as: 'product' });

// Expense relationships
User.hasMany(Expense, { foreignKey: 'employeeId', as: 'expenses' });
Expense.belongsTo(User, { foreignKey: 'employeeId', as: 'employee' });

module.exports = {
  sequelize,
  User,
  Cylinder,
  Customer,
  SalesInvoice,
  SalesInvoiceItem,
  Rental,
  Quotation,
  QuotationItem,
  Payment,
  CompanySettings,
  Product,
  Supplier,
  Purchase,
  PurchaseHeader,
  PurchaseItem,
  InventoryItem,
  Deposit,
  DepositItem,
  DepositReturn,
  DepositReturnItem,
  DailyStock,
  RentalItem,
  ReceivingInvoice,
  ReceivingInvoiceItem,
  InactiveCustomerRead,
  StockTransfer,
  StockTransferItem,
  Notification,
  CustomerItemRate,
  StockMutation,
  MonthlyDashboardSnapshot,
  MaintenanceRun,
  SystemActivityLog,
  MaintenanceNotificationDismissal,
  Expense
};
