const { Op, fn, col, literal } = require('sequelize');
const sequelize = require('../config/database');
const { SalesInvoice, SalesInvoiceItem, Customer, Product, User, Payment, Collection } = require('../models');
const {
  toUaeDateKey,
  addDaysToDateKey,
  getUaeDayRange,
  buildUaeDateRange
} = require('../utils/uaeTime');

const DIALECT = (sequelize.getDialect && sequelize.getDialect()) || 'sqlite';
const isPostgres = DIALECT === 'postgres' || DIALECT === 'postgresql';
const dayBucketExpr = () => fn('DATE', col('createdAt'));
const monthBucketExpr = () => (
  isPostgres
    ? fn('to_char', col('createdAt'), 'YYYY-MM')
    : fn('strftime', '%Y-%m', col('createdAt'))
);

// @desc    Get super admin overview analytics
// @route   GET /api/analytics/overview
// @access  Private (Super Admin only)
exports.getOverview = async (req, res) => {
  try {
    const { startDate, endDate, period = 'all' } = req.query;
    
    // Calculate date range
    let dateFilter = {};
    
    if (startDate && endDate) {
      const range = buildUaeDateRange(startDate, endDate);
      if (range) {
        dateFilter = {
          createdAt: {
            [Op.between]: [range.start, range.end]
          }
        };
      }
    } else if (period !== 'all') {
      const todayKey = toUaeDateKey();
      
      switch (period) {
        case 'today':
          {
            const todayRange = getUaeDayRange(todayKey);
            if (todayRange) {
              dateFilter.createdAt = { [Op.between]: [todayRange.start, todayRange.end] };
            }
          }
          break;
        case 'week':
          {
            const startKey = addDaysToDateKey(todayKey, -6);
            const weekRange = startKey ? buildUaeDateRange(startKey, todayKey) : null;
            if (weekRange) {
              dateFilter.createdAt = { [Op.between]: [weekRange.start, weekRange.end] };
            }
          }
          break;
        case 'month':
          {
            const startKey = addDaysToDateKey(todayKey, -29);
            const monthRange = startKey ? buildUaeDateRange(startKey, todayKey) : null;
            if (monthRange) {
              dateFilter.createdAt = { [Op.between]: [monthRange.start, monthRange.end] };
            }
          }
          break;
        case 'year':
          {
            const startKey = addDaysToDateKey(todayKey, -364);
            const yearRange = startKey ? buildUaeDateRange(startKey, todayKey) : null;
            if (yearRange) {
              dateFilter.createdAt = { [Op.between]: [yearRange.start, yearRange.end] };
            }
          }
          break;
      }
    }

    // Sales Analytics
    const salesData = await SalesInvoice.findAll({
      where: {
        ...dateFilter,
        status: { [Op.ne]: 'draft' }
      },
      attributes: [
        [fn('COUNT', col('id')), 'totalInvoices'],
        [fn('SUM', col('total')), 'totalSales'],
        [fn('SUM', col('discount')), 'totalDiscount'],
        [fn('AVG', col('total')), 'averageInvoice']
      ],
      raw: true
    });

    // Customer Analytics
    const customerData = await Customer.findAll({
      where: dateFilter,
      attributes: [
        [fn('COUNT', col('id')), 'totalCustomers'],
        [fn('COUNT', literal('CASE WHEN "customerType" = \'individual\' THEN 1 END')), 'retailCustomers'],
        [fn('COUNT', literal('CASE WHEN "customerType" = \'business\' THEN 1 END')), 'wholesaleCustomers']
      ],
      raw: true
    });

    // Product & Inventory Analytics
    const productData = await Product.findAll({
      attributes: [
        [fn('COUNT', col('id')), 'totalProducts'],
        [fn('SUM', col('stockQuantity')), 'totalStock'],
        [fn('COUNT', literal('CASE WHEN "isActive" = true THEN 1 END')), 'activeProducts'],
        [fn('SUM', literal('CASE WHEN "stockQuantity" <= 10 THEN 1 ELSE 0 END')), 'lowStockProducts']
      ],
      raw: true
    });

    // Payment Analytics
    const paymentData = await Payment.findAll({
      where: dateFilter,
      attributes: [
        [fn('COUNT', col('id')), 'totalPayments'],
        [fn('SUM', col('amount')), 'totalReceived'],
        [fn('COUNT', literal('CASE WHEN "paymentMethod" = \'cash\' THEN 1 END')), 'cashPayments'],
        [fn('COUNT', literal('CASE WHEN "paymentMethod" = \'bank_transfer\' THEN 1 END')), 'bankPayments']
      ],
      raw: true
    });

    // Daily Sales Trend (Last 30 days)
    const todayKey = toUaeDateKey();
    const thirtyStartKey = addDaysToDateKey(todayKey, -29);
    const thirtyRange = thirtyStartKey ? buildUaeDateRange(thirtyStartKey, todayKey) : null;
    
    const createdDayExpr = dayBucketExpr();
    const dailySalesTrend = await SalesInvoice.findAll({
      where: {
        ...(thirtyRange ? { createdAt: { [Op.between]: [thirtyRange.start, thirtyRange.end] } } : {}),
        status: { [Op.ne]: 'draft' }
      },
      attributes: [
        [createdDayExpr, 'date'],
        [fn('SUM', col('total')), 'total'],
        [fn('COUNT', col('id')), 'count']
      ],
      group: [createdDayExpr],
      order: [[createdDayExpr, 'ASC']],
      raw: true
    });

    // Monthly Revenue (Last 12 months)
    const twelveStartKey = addDaysToDateKey(todayKey, -364);
    const twelveRange = twelveStartKey ? buildUaeDateRange(twelveStartKey, todayKey) : null;
    
    const createdMonthExpr = monthBucketExpr();
    const monthlyRevenue = await SalesInvoice.findAll({
      where: {
        ...(twelveRange ? { createdAt: { [Op.between]: [twelveRange.start, twelveRange.end] } } : {}),
        status: { [Op.ne]: 'draft' }
      },
      attributes: [
        [createdMonthExpr, 'month'],
        [fn('SUM', col('total')), 'revenue'],
        [fn('COUNT', col('id')), 'invoices']
      ],
      group: [createdMonthExpr],
      order: [[createdMonthExpr, 'ASC']],
      raw: true
    });

    // Top Products by Sales (from invoice items)
    let topProducts = [];
    try {
      topProducts = await sequelize.query(`
        SELECT 
          p."productName",
          p."productCode",
          COUNT(sii."id") as "salesCount",
          CAST(SUM(COALESCE(sii."quantity", 0) * COALESCE(sii."unitPrice", 0)) as REAL) as "totalRevenue"
        FROM "sales_invoice_items" sii
        JOIN "sales_invoices" si ON si."id" = sii."invoiceId"
        JOIN "products" p ON p."id" = sii."productId"
        WHERE si."status" != 'draft'
          AND sii."productId" IS NOT NULL
        GROUP BY p."id", p."productName", p."productCode"
        ORDER BY "totalRevenue" DESC
        LIMIT 10
      `, { type: sequelize.QueryTypes.SELECT });
    } catch (error) {
      console.error('Top products query error:', error);
      // Return empty array on error
      topProducts = [];
    }

    // Recent Activity Logs
    let recentActivity = [];
    try {
      recentActivity = await SalesInvoice.findAll({
        where: dateFilter,
        include: [
          { model: Customer, attributes: ['id', 'name', 'customerCode', 'phone', 'email'], required: false },
          { model: User, attributes: ['fullName', 'username'], required: false }
        ],
        order: [['createdAt', 'DESC']],
        limit: 10
      });
    } catch (error) {
      console.error('Recent activity query error:', error);
      recentActivity = [];
    }

    // User/Employee Activity
    const employeeActivity = await User.findAll({
      where: { isActive: true, role: { [Op.ne]: 'super_admin' } },
      attributes: ['id', 'fullName', 'username', 'role'],
      raw: true
    });

    res.status(200).json({
      success: true,
      data: {
        sales: salesData[0] || {},
        customers: customerData[0] || {},
        products: productData[0] || {},
        payments: paymentData[0] || {},
        trends: {
          daily: dailySalesTrend,
          monthly: monthlyRevenue
        },
        topProducts,
        recentActivity,
        employeeActivity
      }
    });
  } catch (error) {
    console.error('Analytics overview error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Get employee performance report
// @route   GET /api/analytics/employee/:userId
// @access  Private (Super Admin only)
exports.getEmployeeReport = async (req, res) => {
  try {
    const { userId } = req.params;
    const { startDate, endDate, period = 'month' } = req.query;

    if (req.user.role !== 'super_admin' && req.user.id !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access this employee report'
      });
    }

    // Calculate date range
    let dateFilter = {};
    if (startDate && endDate) {
      const range = buildUaeDateRange(startDate, endDate);
      if (range) {
        dateFilter = {
          createdAt: {
            [Op.between]: [range.start, range.end]
          }
        };
      }
    } else {
      const todayKey = toUaeDateKey();
      let startKey = todayKey;
      
      switch (period) {
        case 'week':
          startKey = addDaysToDateKey(todayKey, -6);
          break;
        case 'month':
          startKey = addDaysToDateKey(todayKey, -29);
          break;
        case 'year':
          startKey = addDaysToDateKey(todayKey, -364);
          break;
      }
      const range = startKey ? buildUaeDateRange(startKey, todayKey) : null;
      if (range) {
        dateFilter.createdAt = { [Op.between]: [range.start, range.end] };
      }
    }

    // Get employee details
    const employee = await User.findByPk(userId, {
      attributes: ['id', 'fullName', 'username', 'email', 'role', 'phone', 'createdAt']
    });

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found'
      });
    }

    // Sales handled by employee
    const salesData = await SalesInvoice.findAll({
      where: {
        employeeId: userId,
        ...dateFilter,
        status: { [Op.ne]: 'draft' }
      },
      attributes: [
        [fn('COUNT', col('id')), 'totalInvoices'],
        [fn('SUM', col('total')), 'totalSales'],
        [fn('AVG', col('total')), 'averageSale'],
        [fn('MAX', col('total')), 'largestSale']
      ],
      raw: true
    });

    // Sales breakdown by type (quantity + revenue)
    let salesByType = {
      gas: { quantity: 0, revenue: 0 },
      cylinder: { quantity: 0, revenue: 0 },
      tool: { quantity: 0, revenue: 0 }
    };
    try {
      const salesItemsByType = await SalesInvoiceItem.findAll({
        attributes: [
          'saleType',
          [fn('SUM', col('SalesInvoiceItem.quantity')), 'totalQuantity'],
          [fn('SUM', col('SalesInvoiceItem.totalPrice')), 'totalRevenue']
        ],
        where: {
          saleType: { [Op.in]: ['Gas', 'Full Cylinder', 'Empty Cylinder', 'Tool'] }
        },
        include: [
          {
            model: SalesInvoice,
            as: 'invoice',
            attributes: [],
            where: {
              employeeId: userId,
              ...dateFilter,
              status: { [Op.ne]: 'draft' }
            }
          }
        ],
        group: ['saleType'],
        raw: true
      });

      salesByType = salesItemsByType.reduce((acc, row) => {
        const quantity = parseFloat(row.totalQuantity) || 0;
        const revenue = parseFloat(row.totalRevenue) || 0;
        if (row.saleType === 'Gas') {
          acc.gas.quantity += quantity;
          acc.gas.revenue += revenue;
        } else if (row.saleType === 'Tool') {
          acc.tool.quantity += quantity;
          acc.tool.revenue += revenue;
        } else {
          acc.cylinder.quantity += quantity;
          acc.cylinder.revenue += revenue;
        }
        return acc;
      }, salesByType);
    } catch (error) {
      console.error('Employee sales by type error:', error);
    }

    // Daily performance
    const invoiceDayExpr = dayBucketExpr();
    const dailyPerformance = await SalesInvoice.findAll({
      where: {
        employeeId: userId,
        ...dateFilter,
        status: { [Op.ne]: 'draft' }
      },
      attributes: [
        [invoiceDayExpr, 'date'],
        [fn('COUNT', col('id')), 'invoiceCount'],
        [fn('SUM', col('total')), 'totalSales']
      ],
      group: [invoiceDayExpr],
      order: [[invoiceDayExpr, 'ASC']],
      raw: true
    });

    // Recent invoices by employee
    let recentInvoices = [];
    try {
      recentInvoices = await SalesInvoice.findAll({
        where: {
          employeeId: userId,
          ...dateFilter
        },
        include: [
          { model: Customer, attributes: ['id', 'name', 'customerCode', 'phone', 'email'], required: false }
        ],
        order: [['createdAt', 'DESC']],
        limit: 20
      });
    } catch (error) {
      console.error('Recent invoices query error:', error);
      recentInvoices = [];
    }

    // Collections handled by employee (placeholder - Collection model may not exist yet)
    let collectionsData = [{ totalCollections: 0, totalAmountCollected: 0 }];
    try {
      if (Collection) {
        collectionsData = await Collection.findAll({
          where: {
            employeeId: userId,
            ...dateFilter
          },
          attributes: [
            [fn('COUNT', col('id')), 'totalCollections'],
            [fn('SUM', col('amountCollected')), 'totalAmountCollected']
          ],
          raw: true
        });
      }
    } catch (error) {
      console.error('Collections query error:', error);
      collectionsData = [{ totalCollections: 0, totalAmountCollected: 0 }];
    }

    // Customer interactions
    let customerInteractions = [];
    try {
      customerInteractions = await SalesInvoice.findAll({
        where: {
          employeeId: userId,
          ...dateFilter
        },
        attributes: [
          'customerId',
          [fn('COUNT', col('id')), 'interactionCount']
        ],
        group: ['customerId'],
        include: [{ model: Customer, attributes: ['id', 'name', 'customerCode', 'phone', 'email'], required: false }],
        order: [[fn('COUNT', col('id')), 'DESC']],
        limit: 10,
        raw: false
      });
    } catch (error) {
      console.error('Customer interactions query error:', error);
      customerInteractions = [];
    }

    res.status(200).json({
      success: true,
      data: {
        employee,
        sales: salesData[0] || {},
        salesByType,
        collections: collectionsData[0] || {},
        dailyPerformance,
        recentInvoices,
        customerInteractions
      }
    });
  } catch (error) {
    console.error('Employee report error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Get all employees for dropdown
// @route   GET /api/analytics/employees
// @access  Private (Super Admin only)
exports.getEmployeesList = async (req, res) => {
  try {
    const employees = await User.findAll({
      where: {
        isActive: true,
        role: { [Op.ne]: 'super_admin' }
      },
      attributes: ['id', 'fullName', 'username', 'role', 'email'],
      order: [['fullName', 'ASC']]
    });

    res.status(200).json({
      success: true,
      data: employees
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Export analytics data
// @route   GET /api/analytics/export
// @access  Private (Super Admin only)
exports.exportAnalytics = async (req, res) => {
  try {
    const { type = 'overview', format = 'json', ...filters } = req.query;

    let data;
    if (type === 'overview') {
      data = await exports.getOverview({ query: filters }, { json: () => {} });
    } else if (type === 'employee' && filters.userId) {
      data = await exports.getEmployeeReport(
        { params: { userId: filters.userId }, query: filters },
        { json: () => {} }
      );
    }

    // For now, return JSON format
    // TODO: Implement PDF/Excel export using libraries
    res.status(200).json({
      success: true,
      format,
      data
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Export failed',
      error: error.message
    });
  }
};

module.exports = exports;
