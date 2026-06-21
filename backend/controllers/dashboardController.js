const { User, Cylinder, Customer, SalesInvoice, SalesInvoiceItem, Rental, Payment, sequelize, InactiveCustomerRead, DailyStock, Deposit, CompanySettings, MonthlyDashboardSnapshot } = require('../models');
const { Op } = require('sequelize');
const { toUaeDateKey, getUaeDayRange } = require('../utils/uaeTime');

const UAE_OFFSET_MINUTES = 4 * 60;

const toUaeDateTimeLabel = (date) => {
  if (!date) return null;
  const uaeMs = date.getTime() + UAE_OFFSET_MINUTES * 60 * 1000;
  return new Date(uaeMs).toISOString().replace('T', ' ').slice(0, 16);
};

const DEFAULT_TIMEZONE = 'Asia/Dubai';
const timeZoneFormatterCache = new Map();
const { registerCache } = require('../utils/runtimeCache');
registerCache('dashboardTimezoneFormatters', timeZoneFormatterCache);

const getTimeZoneFormatter = (timeZone) => {
  const safeZone = timeZone || DEFAULT_TIMEZONE;
  if (!timeZoneFormatterCache.has(safeZone)) {
    timeZoneFormatterCache.set(
      safeZone,
      new Intl.DateTimeFormat('en-US', {
        timeZone: safeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      })
    );
  }
  return timeZoneFormatterCache.get(safeZone);
};

const normalizeTimeZone = (timeZone) => {
  if (!timeZone) return DEFAULT_TIMEZONE;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date());
    return timeZone;
  } catch (error) {
    return DEFAULT_TIMEZONE;
  }
};

const getTimeZoneOffsetMs = (date, timeZone) => {
  const formatter = getTimeZoneFormatter(timeZone);
  const parts = formatter.formatToParts(date);
  const values = {};
  for (const part of parts) {
    if (part.type !== 'literal') {
      values[part.type] = part.value;
    }
  }
  const asUtc = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second)
  );
  return asUtc - date.getTime();
};

const makeZonedDate = (year, monthIndex, day, hour = 0, minute = 0, second = 0, ms = 0, timeZone) => {
  const safeZone = normalizeTimeZone(timeZone);
  const utcGuess = new Date(Date.UTC(year, monthIndex, day, hour, minute, second, ms));
  let offset = getTimeZoneOffsetMs(utcGuess, safeZone);
  let adjusted = new Date(utcGuess.getTime() - offset);
  const offsetRetry = getTimeZoneOffsetMs(adjusted, safeZone);
  if (offsetRetry !== offset) {
    adjusted = new Date(utcGuess.getTime() - offsetRetry);
  }
  return adjusted;
};

const getZonedDateParts = (date, timeZone) => {
  const formatter = getTimeZoneFormatter(timeZone);
  const parts = formatter.formatToParts(date);
  const values = {};
  for (const part of parts) {
    if (part.type !== 'literal') {
      values[part.type] = part.value;
    }
  }
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day)
  };
};

const getMonthKey = (date, timeZone) => {
  const { year, month } = getZonedDateParts(date, timeZone);
  if (!year || !month) return null;
  return `${year}-${String(month).padStart(2, '0')}`;
};

const parseMonthKey = (value) => {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})$/.exec(String(value));
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!year || month < 1 || month > 12) return null;
  return { year, monthIndex: month - 1, monthKey: `${match[1]}-${match[2]}` };
};

const addMonthsToKey = (monthKey, deltaMonths) => {
  const parsed = parseMonthKey(monthKey);
  if (!parsed || !Number.isFinite(deltaMonths)) return null;
  const totalMonths = (parsed.year * 12) + parsed.monthIndex + deltaMonths;
  if (!Number.isFinite(totalMonths)) return null;
  let newYear = Math.floor(totalMonths / 12);
  let newMonthIndex = totalMonths % 12;
  if (newMonthIndex < 0) {
    newMonthIndex += 12;
    newYear -= 1;
  }
  return `${newYear}-${String(newMonthIndex + 1).padStart(2, '0')}`;
};

const getMonthRange = (monthKey, timeZone) => {
  const parsed = parseMonthKey(monthKey);
  if (!parsed) return null;
  const start = makeZonedDate(parsed.year, parsed.monthIndex, 1, 0, 0, 0, 0, timeZone);
  const nextMonthKey = addMonthsToKey(parsed.monthKey, 1);
  const nextParsed = parseMonthKey(nextMonthKey);
  if (!nextParsed) return null;
  const nextStart = makeZonedDate(nextParsed.year, nextParsed.monthIndex, 1, 0, 0, 0, 0, timeZone);
  const end = new Date(nextStart.getTime() - 1);
  return { start, end };
};

const parseDateOnly = (value) => {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value));
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const utcCheck = new Date(Date.UTC(year, month - 1, day));
  if (utcCheck.getUTCFullYear() !== year || utcCheck.getUTCMonth() !== month - 1 || utcCheck.getUTCDate() !== day) {
    return null;
  }
  return { year, monthIndex: month - 1, day };
};

const resolveDateRange = (query = {}, timeZone, currentMonthKey) => {
  const safeZone = normalizeTimeZone(timeZone);
  const parsedMonth = parseMonthKey(query.month);
  if (parsedMonth) {
    const range = getMonthRange(parsedMonth.monthKey, safeZone);
    if (range) {
      return {
        mode: 'month',
        isMonth: true,
        monthKey: parsedMonth.monthKey,
        range,
        appliedFilter: { mode: 'month', month: parsedMonth.monthKey }
      };
    }
  }

  if (query.startDate && query.endDate) {
    const startParts = parseDateOnly(query.startDate);
    const endParts = parseDateOnly(query.endDate);
    if (startParts && endParts) {
      const start = makeZonedDate(startParts.year, startParts.monthIndex, startParts.day, 0, 0, 0, 0, safeZone);
      const end = makeZonedDate(endParts.year, endParts.monthIndex, endParts.day, 23, 59, 59, 999, safeZone);
      if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && start <= end) {
        return {
          mode: 'range',
          isMonth: false,
          range: { start, end },
          appliedFilter: { mode: 'range', startDate: query.startDate, endDate: query.endDate }
        };
      }
    }
  }

  if (currentMonthKey) {
    const range = getMonthRange(currentMonthKey, safeZone);
    if (range) {
      return {
        mode: 'month',
        isMonth: true,
        isDefault: true,
        monthKey: currentMonthKey,
        range,
        appliedFilter: { mode: 'month', month: currentMonthKey }
      };
    }
  }

  return null;
};

const buildInvoiceDateFilter = (dateRange) => (
  dateRange ? { invoiceDate: { [Op.between]: [dateRange.start, dateRange.end] } } : null
);

const computeSalesStats = async ({ invoiceDateFilter, employeeId } = {}) => {
  const paidInvoiceWhere = {
    status: { [Op.in]: ['active', 'paid', 'partial'] },
    paymentStatus: 'paid',
    ...(invoiceDateFilter || {})
  };
  if (employeeId) {
    paidInvoiceWhere.employeeId = employeeId;
  }

  const totalSales = Number(await SalesInvoice.sum('paidAmount', {
    where: paidInvoiceWhere
  })) || 0;

  const activeInvoiceWhere = {
    status: { [Op.in]: ['active', 'paid', 'partial'] },
    ...(invoiceDateFilter || {})
  };
  if (employeeId) {
    activeInvoiceWhere.employeeId = employeeId;
  }

  const paidInvoicesWithItems = await SalesInvoice.findAll({
    where: paidInvoiceWhere,
    attributes: ['id', 'total'],
    include: [
      {
        model: SalesInvoiceItem,
        as: 'items',
        attributes: ['saleType', 'totalPrice'],
        where: {
          saleType: { [Op.in]: ['Gas', 'Full Cylinder', 'Empty Cylinder', 'Tool'] }
        },
        required: false
      }
    ]
  });

  const typeTotals = {
    gas: 0,
    cylinder: 0,
    tool: 0
  };

  const resolveBucket = (saleType) => {
    if (saleType === 'Gas') return 'gas';
    if (saleType === 'Tool') return 'tool';
    if (saleType === 'Full Cylinder' || saleType === 'Empty Cylinder') return 'cylinder';
    return null;
  };

  paidInvoicesWithItems.forEach((invoice) => {
    const items = Array.isArray(invoice.items) ? invoice.items : [];
    if (!items.length) return;

    const lineTotal = items.reduce((sum, item) => sum + (parseFloat(item.totalPrice) || 0), 0);
    if (lineTotal <= 0) return;

    const invoiceTotal = parseFloat(invoice.total) || 0;
    const extraAmount = invoiceTotal - lineTotal;

    items.forEach((item) => {
      const bucket = resolveBucket(item.saleType);
      if (!bucket) return;
      const base = parseFloat(item.totalPrice) || 0;
      const weight = base / lineTotal;
      typeTotals[bucket] += base + (extraAmount * weight);
    });
  });

  const quantityByType = await SalesInvoiceItem.findAll({
    attributes: [
      'saleType',
      [sequelize.fn('SUM', sequelize.col('SalesInvoiceItem.quantity')), 'quantity']
    ],
    where: {
      saleType: { [Op.in]: ['Gas', 'Full Cylinder', 'Empty Cylinder', 'Tool'] }
    },
    include: [
      {
        model: SalesInvoice,
        as: 'invoice',
        attributes: [],
        where: activeInvoiceWhere
      }
    ],
    group: ['saleType'],
    raw: true
  });

  const quantityTotalsByType = quantityByType.reduce((acc, row) => {
    const quantity = parseFloat(row.quantity) || 0;
    if (row.saleType === 'Gas') acc.gasUnitsSold += quantity;
    if (row.saleType === 'Full Cylinder' || row.saleType === 'Empty Cylinder') {
      acc.cylinderUnitsSold += quantity;
    }
    if (row.saleType === 'Tool') acc.toolUnitsSold += quantity;
    return acc;
  }, {
    totalGasSales: 0,
    totalCylinderSales: 0,
    totalToolSales: 0,
    gasUnitsSold: 0,
    cylinderUnitsSold: 0,
    toolUnitsSold: 0
  });

  const invoiceCountWhere = {
    status: { [Op.in]: ['active', 'paid', 'partial'] },
    ...(invoiceDateFilter || {})
  };
  if (employeeId) {
    invoiceCountWhere.employeeId = employeeId;
  }

  const pendingPaymentWhere = {
    status: { [Op.in]: ['active', 'partial'] },
    ...(invoiceDateFilter || {})
  };
  if (employeeId) {
    pendingPaymentWhere.employeeId = employeeId;
  }

  const totalInvoices = await SalesInvoice.count({
    where: invoiceCountWhere
  });

  const pendingPayments = Number(await SalesInvoice.sum('balanceAmount', {
    where: pendingPaymentWhere
  })) || 0;

  return {
    totalSales,
    monthlySales: totalSales,
    cylinderSales: totalSales,
    totalGasSales: typeTotals.gas,
    totalCylinderSales: typeTotals.cylinder,
    totalToolSales: typeTotals.tool,
    gasUnitsSold: quantityTotalsByType.gasUnitsSold,
    cylinderUnitsSold: quantityTotalsByType.cylinderUnitsSold,
    toolUnitsSold: quantityTotalsByType.toolUnitsSold,
    totalInvoices,
    pendingPayments
  };
};

const computeCustomerStats = async ({ invoiceDateFilter } = {}) => {
  let totalCustomers;
  if (invoiceDateFilter) {
    totalCustomers = await SalesInvoice.count({
      distinct: true,
      col: 'customerId',
      where: {
        status: { [Op.in]: ['active', 'paid', 'partial'] },
        ...invoiceDateFilter
      }
    });
  } else {
    totalCustomers = await Customer.count();
  }

  const withBalance = await Customer.count({
    where: {
      isActive: true,
      currentBalance: { [Op.gt]: 0 }
    }
  });

  return {
    total: totalCustomers || 0,
    withBalance: withBalance || 0
  };
};

const saveMonthlySnapshotIfMissing = async ({ monthKey, dateRange, timeZone, salesStats, customerStats }) => {
  if (!monthKey || !dateRange) return null;
  const safeZone = normalizeTimeZone(timeZone);
  try {
    const [record, created] = await MonthlyDashboardSnapshot.findOrCreate({
      where: { monthKey },
      defaults: {
        monthKey,
        periodStart: dateRange.start,
        periodEnd: dateRange.end,
        data: { salesStats, customerStats },
        timezone: safeZone,
        generatedAt: new Date()
      }
    });
    return { record, created };
  } catch (error) {
    console.error('Monthly dashboard snapshot save error:', error);
    return null;
  }
};

const ensurePreviousMonthSnapshot = async ({ currentMonthKey, timeZone }) => {
  if (!currentMonthKey) return;
  const previousMonthKey = addMonthsToKey(currentMonthKey, -1);
  if (!previousMonthKey) return;
  const existing = await MonthlyDashboardSnapshot.findOne({
    where: { monthKey: previousMonthKey },
    attributes: ['id']
  });
  if (existing) return;
  const dateRange = getMonthRange(previousMonthKey, timeZone);
  if (!dateRange) return;
  const invoiceDateFilter = buildInvoiceDateFilter(dateRange);
  const salesStats = await computeSalesStats({ invoiceDateFilter });
  const customerStats = await computeCustomerStats({ invoiceDateFilter });
  await saveMonthlySnapshotIfMissing({
    monthKey: previousMonthKey,
    dateRange,
    timeZone,
    salesStats,
    customerStats
  });
};

// @desc    Get dashboard overview
// @route   GET /api/dashboard/overview
// @access  Private
exports.getDashboardOverview = async (req, res) => {
  try {
    const today = new Date();
    const companySettings = await CompanySettings.findOne({
      attributes: ['companyName', 'timeZone']
    });
    const timeZone = DEFAULT_TIMEZONE;
    const currentMonthKey = getMonthKey(today, timeZone);
    const rangeInfo = resolveDateRange(req.query, timeZone, currentMonthKey);
    const dateRange = rangeInfo?.range || null;
    const appliedFilter = rangeInfo?.appliedFilter || null;
    const invoiceDateFilter = buildInvoiceDateFilter(dateRange);
    const isEmployee = req.user.role === 'employee';

    try {
      await ensurePreviousMonthSnapshot({ currentMonthKey, timeZone });
    } catch (error) {
      console.error('Monthly snapshot ensure error:', error);
    }

    const activeInvoiceWhere = {
      status: { [Op.in]: ['active', 'paid', 'partial'] },
      ...(invoiceDateFilter || {})
    };
    if (isEmployee) {
      activeInvoiceWhere.employeeId = req.user.id;
    }

    // Employee dashboard: return quantity-focused stats only to reduce load
    if (isEmployee) {
      const salesByType = await SalesInvoiceItem.findAll({
        attributes: [
          'saleType',
          [sequelize.fn('SUM', sequelize.col('SalesInvoiceItem.quantity')), 'quantity']
        ],
        where: {
          saleType: { [Op.in]: ['Gas', 'Full Cylinder', 'Empty Cylinder', 'Tool'] }
        },
        include: [
          {
            model: SalesInvoice,
            as: 'invoice',
            attributes: [],
            where: activeInvoiceWhere
          }
        ],
        group: ['saleType'],
        raw: true
      });

      const totals = salesByType.reduce((acc, row) => {
        const quantity = parseFloat(row.quantity) || 0;
        if (row.saleType === 'Gas') acc.gasUnitsSold += quantity;
        if (row.saleType === 'Full Cylinder' || row.saleType === 'Empty Cylinder') {
          acc.cylinderUnitsSold += quantity;
        }
        if (row.saleType === 'Tool') acc.toolUnitsSold += quantity;
        return acc;
      }, {
        gasUnitsSold: 0,
        cylinderUnitsSold: 0,
        toolUnitsSold: 0
      });

      const salesStats = {
        totalSales: 0,
        monthlySales: 0,
        cylinderSales: 0,
        totalGasSales: 0,
        totalCylinderSales: 0,
        totalToolSales: 0,
        gasUnitsSold: totals.gasUnitsSold,
        cylinderUnitsSold: totals.cylinderUnitsSold,
        toolUnitsSold: totals.toolUnitsSold,
        totalInvoices: 0,
        pendingPayments: 0
      };

      return res.status(200).json({
        success: true,
        data: {
          cylinderStats: null,
          salesStats,
          rentalStats: null,
          paymentStats: null,
          customerStats: null,
          employeeStats: null,
          recentInvoices: [],
          recentPayments: [],
          lastDailyStock: null,
          companyName: companySettings?.companyName || null,
          appliedFilter,
          timeZone,
          currentMonthKey,
          monthlySnapshot: null
        }
      });
    }

    // Get cylinder statistics
    const cylinderStats = {
      total: await Cylinder.count(),
      available: await Cylinder.count({ where: { status: 'available' } }),
      filled: await Cylinder.count({ where: { status: 'filled' } }),
      empty: await Cylinder.count({ where: { status: 'empty' } }),
      rented: await Cylinder.count({ where: { status: 'rented' } }),
      damaged: await Cylinder.count({ where: { status: 'damaged' } })
    };

    let salesStats = null;
    let customerStats = null;
    let snapshotMeta = null;

    if (rangeInfo?.isMonth && rangeInfo.monthKey && currentMonthKey && rangeInfo.monthKey < currentMonthKey) {
      const snapshot = await MonthlyDashboardSnapshot.findOne({
        where: { monthKey: rangeInfo.monthKey }
      });
      if (snapshot?.data?.salesStats) {
        salesStats = snapshot.data.salesStats;
        customerStats = snapshot.data.customerStats || null;
        snapshotMeta = {
          used: true,
          monthKey: snapshot.monthKey,
          generatedAt: snapshot.generatedAt
        };
      }
    }

    if (!salesStats) {
      salesStats = await computeSalesStats({ invoiceDateFilter });
    }

    if (!customerStats) {
      customerStats = await computeCustomerStats({ invoiceDateFilter });
    }

    if (!snapshotMeta && rangeInfo?.isMonth && rangeInfo.monthKey && currentMonthKey && rangeInfo.monthKey < currentMonthKey) {
      await saveMonthlySnapshotIfMissing({
        monthKey: rangeInfo.monthKey,
        dateRange,
        timeZone,
        salesStats,
        customerStats
      });
    }

    // Get rental statistics
    const rentalStats = {
      activeRentals: await Rental.count({ where: { status: 'active' } }),
      overdueRentals: await Rental.count({
        where: {
          status: 'active',
          endDate: { [Op.lt]: today }
        }
      }),
      totalRevenue: await Rental.sum('rentalAmount') || 0,
      outstandingAmount: await Rental.sum('balanceAmount', {
        where: { status: 'active' }
      }) || 0
    };

    const zonedParts = getZonedDateParts(today, timeZone);
    const fallbackMonthStart = makeZonedDate(zonedParts.year, zonedParts.month - 1, 1, 0, 0, 0, 0, timeZone);
    const fallbackYearStart = makeZonedDate(zonedParts.year, 0, 1, 0, 0, 0, 0, timeZone);

    // Get payment statistics
    const todayRange = getUaeDayRange(toUaeDateKey());
    const paymentStats = {
      todayPayments: await Payment.sum('amount', {
        where: {
          status: 'completed',
          ...(todayRange ? { paymentDate: { [Op.between]: [todayRange.start, todayRange.end] } } : {})
        }
      }) || 0,
      monthlyPayments: await Payment.sum('amount', {
        where: {
          status: 'completed',
          paymentDate: dateRange
            ? { [Op.between]: [dateRange.start, dateRange.end] }
            : { [Op.gte]: fallbackMonthStart }
        }
      }) || 0,
      yearlyPayments: await Payment.sum('amount', {
        where: {
          status: 'completed',
          paymentDate: dateRange
            ? { [Op.between]: [dateRange.start, dateRange.end] }
            : { [Op.gte]: fallbackYearStart }
        }
      }) || 0
    };

    // Get employee statistics (only for Super Admin)
    let employeeStats = null;
    if (req.user.role === 'super_admin') {
      employeeStats = {
        total: await User.count({ where: { isActive: true } }),
        employees: await User.count({
          where: { isActive: true, role: 'employee' }
        }),
        managers: await User.count({
          where: { isActive: true, role: 'manager' }
        })
      };
    }

    // Get recent activities
    const recentInvoices = await SalesInvoice.findAll({
      limit: 5,
      order: [['createdAt', 'DESC']],
      include: [
        {
          model: Customer,
          as: 'customer',
          attributes: ['name', 'customerCode']
        }
      ],
      attributes: ['id', 'invoiceNumber', 'total', 'status', 'createdAt']
    });

    const recentPayments = await Payment.findAll({
      limit: 5,
      order: [['createdAt', 'DESC']],
      include: [
        {
          model: Customer,
          as: 'customer',
          attributes: ['name', 'customerCode']
        }
      ],
      attributes: ['id', 'paymentNumber', 'amount', 'paymentMethod', 'createdAt']
    });

    const latestDailyStock = await DailyStock.findOne({
      attributes: ['reportDate', 'createdAt'],
      order: [['createdAt', 'DESC']]
    });
    res.status(200).json({
      success: true,
      data: {
        cylinderStats,
        salesStats,
        rentalStats,
        paymentStats,
        customerStats,
        employeeStats,
        recentInvoices,
        recentPayments,
        lastDailyStock: latestDailyStock ? {
          reportDate: latestDailyStock.reportDate,
          savedAt: latestDailyStock.createdAt,
          savedAtUae: toUaeDateTimeLabel(latestDailyStock.createdAt)
        } : null,
        companyName: companySettings?.companyName || null,
        appliedFilter,
        timeZone,
        currentMonthKey,
        monthlySnapshot: snapshotMeta
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Get inactive customers (no sales invoices and no deposits)
// @route   GET /api/dashboard/inactive-customers
// @access  Private
exports.getInactiveCustomers = async (req, res) => {
  try {
    const now = new Date();

    const lastRead = await InactiveCustomerRead.findOne({
      where: { userId: req.user.id },
      attributes: ['lastReadAt']
    });
    const lastReadAt = lastRead?.lastReadAt || null;

    const [customers] = await sequelize.query(
      `
      SELECT c."id",
             c."name",
             c."customerCode",
             c."phone",
             c."createdAt"
      FROM "customers" c
      WHERE NOT EXISTS (
        SELECT 1 FROM "sales_invoices" s WHERE s."customerId" = c."id"
      )
      `
    );

    const inactiveCustomers = customers.map(customer => {
      const inactiveSince = customer.createdAt || now;
      const daysInactive = Math.max(0, Math.floor((now - new Date(inactiveSince)) / (1000 * 60 * 60 * 24)));
      return {
        id: customer.id,
        name: customer.name,
        customerCode: customer.customerCode,
        phone: customer.phone,
        lastPurchaseDate: null,
        inactiveSince,
        daysInactive
      };
    });

    inactiveCustomers.sort((a, b) => new Date(b.inactiveSince) - new Date(a.inactiveSince));

    res.status(200).json({
      success: true,
      data: {
        count: inactiveCustomers.length,
        customers: inactiveCustomers,
        lastReadAt
      }
    });
  } catch (error) {
    console.error('Inactive customers error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Mark inactive customer notifications as read
// @route   POST /api/dashboard/inactive-customers/mark-read
// @access  Private
exports.markInactiveCustomersRead = async (req, res) => {
  try {
    const now = new Date();

    const [record, created] = await InactiveCustomerRead.findOrCreate({
      where: { userId: req.user.id },
      defaults: { lastReadAt: now }
    });

    if (!created) {
      await record.update({ lastReadAt: now });
    }

    res.status(200).json({
      success: true,
      data: { lastReadAt: record.lastReadAt }
    });
  } catch (error) {
    console.error('Mark inactive read error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Get sales chart data
// @route   GET /api/dashboard/sales-chart
// @access  Private
exports.getSalesChartData = async (req, res) => {
  try {
    const { period = 'month' } = req.query; // month, quarter, year
    
    let startDate;
    const today = new Date();

    switch (period) {
      case 'quarter':
        startDate = new Date(today.getFullYear(), today.getMonth() - 3, 1);
        break;
      case 'year':
        startDate = new Date(today.getFullYear(), 0, 1);
        break;
      default:
        startDate = new Date(today.getFullYear(), today.getMonth(), 1);
    }

    const uaeInvoiceDate = sequelize.literal("DATE(datetime(invoiceDate, '+4 hours'))");
    const salesData = await SalesInvoice.findAll({
      where: {
        status: { [Op.in]: ['active', 'paid', 'partial'] },
        invoiceDate: { [Op.gte]: startDate }
      },
      attributes: [
        [uaeInvoiceDate, 'date'],
        [sequelize.fn('SUM', sequelize.col('total')), 'total']
      ],
      group: [uaeInvoiceDate],
      order: [[uaeInvoiceDate, 'ASC']]
    });

    res.status(200).json({
      success: true,
      data: salesData
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};
