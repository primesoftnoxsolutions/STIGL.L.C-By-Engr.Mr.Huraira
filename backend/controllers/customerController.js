const { Customer } = require('../models');
const { Op } = require('sequelize');
const XLSX = require('xlsx');
const path = require('path');

function normalizeCell(value) {
  if (value === undefined || value === null) {
    return '';
  }
  return String(value).trim();
}

function normalizeName(value) {
  return normalizeCell(value).replace(/\s+/g, ' ');
}

// @desc    Get all customers
// @route   GET /api/customers
// @access  Private
exports.getAllCustomers = async (req, res) => {
  try {
    const { search, customerType, isActive } = req.query;
    const where = {};

    if (customerType) where.customerType = customerType;
    if (isActive !== undefined) where.isActive = isActive === 'true';
    if (search) {
      where[Op.or] = [
        { name: { [Op.like]: `%${search}%` } },
        { email: { [Op.like]: `%${search}%` } },
        { phone: { [Op.like]: `%${search}%` } },
        { customerCode: { [Op.like]: `%${search}%` } }
      ];
    }

    const customers = await Customer.findAll({
      where,
      order: [['createdAt', 'DESC']]
    });

    res.status(200).json({
      success: true,
      count: customers.length,
      data: customers
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Get single customer
// @route   GET /api/customers/:id
// @access  Private
exports.getCustomer = async (req, res) => {
  try {
    const customer = await Customer.findByPk(req.params.id);

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }

    res.status(200).json({
      success: true,
      data: customer
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Create customer
// @route   POST /api/customers
// @access  Private
exports.createCustomer = async (req, res) => {
  try {
    const { name, email, phone, trNumber, address } = req.body;

    // Generate customer code
    const count = await Customer.count();
    const customerCode = `CUST${String(count + 1).padStart(5, '0')}`;

    const customer = await Customer.create({
      customerCode,
      name,
      email: email || null,
      phone,
      trNumber: trNumber || null,
      address: address || null,
      customerType: 'individual', // Default value
      creditLimit: 0,
      currentBalance: 0
    });

    res.status(201).json({
      success: true,
      data: customer
    });
  } catch (error) {
    console.error('Create customer error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Update customer
// @route   PUT /api/customers/:id
// @access  Private
exports.updateCustomer = async (req, res) => {
  try {
    const customer = await Customer.findByPk(req.params.id);

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }

    const { name, email, phone, trNumber, address } = req.body;

    await customer.update({
      name,
      email: email || null,
      phone,
      trNumber: trNumber || null,
      address: address || null
    });

    res.status(200).json({
      success: true,
      data: customer
    });
  } catch (error) {
    console.error('Update customer error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Delete customer
// @route   DELETE /api/customers/:id
// @access  Private (Super Admin)
exports.deleteCustomer = async (req, res) => {
  try {
    const customer = await Customer.findByPk(req.params.id);

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }

    // Soft delete
    await customer.update({ isActive: false });

    res.status(200).json({
      success: true,
      message: 'Customer deactivated successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Import customers from Excel/CSV
// @route   POST /api/customers/import
// @access  Private (Super Admin)
exports.importCustomers = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Please upload a file to import.'
      });
    }

    const extension = path.extname(req.file.originalname || '').toLowerCase();
    if (!['.xlsx', '.csv'].includes(extension)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid file type. Please upload an Excel (.xlsx) or CSV (.csv) file.'
      });
    }

    let workbook;
    if (extension === '.csv') {
      const csvData = req.file.buffer.toString('utf8');
      workbook = XLSX.read(csvData, { type: 'string' });
    } else {
      workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    }

    const sheetNames = workbook.SheetNames || [];
    if (sheetNames.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'The uploaded file is empty or invalid.'
      });
    }

    const headerKey = (value) => normalizeCell(value)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '');

    const canonicalHeader = (value) => {
      const key = headerKey(value);
      if (!key) {
        return '';
      }
      if (key === 'customername' || key === 'customer' || key === 'name' || key.startsWith('customername')) {
        return 'customername';
      }
      if (key === 'trnumber' || key === 'tr' || key === 'taxregistration' || key.startsWith('trnumber')) {
        return 'trnumber';
      }
      if (
        key === 'address' ||
        key === 'customerdetails' ||
        key === 'addresscustomerdetails' ||
        key === 'addressdetails' ||
        key.startsWith('address') ||
        key.startsWith('customerdetails')
      ) {
        return 'addressdetails';
      }
      return '';
    };

    const expectedHeader = ['customername', 'trnumber', 'addressdetails'];

    const normalizeHeaderRow = (row) => {
      const normalized = (row || []).map((cell, index) => {
        let value = normalizeCell(cell);
        if (index === 0) {
          value = value.replace(/^\uFEFF/, '');
        }
        return value;
      });

      let startIndex = normalized.findIndex((value) => value !== '');
      if (startIndex === -1) {
        return { effectiveHeader: [], startIndex: 0 };
      }

      let endIndex = normalized.length - 1;
      while (endIndex >= startIndex && normalized[endIndex] === '') {
        endIndex -= 1;
      }

      return {
        effectiveHeader: normalized.slice(startIndex, endIndex + 1),
        startIndex
      };
    };

    let headerRowIndex = -1;
    let headerStartIndex = 0;
    let rows = [];

    for (const sheetName of sheetNames) {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) {
        continue;
      }
      const sheetRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
      if (!sheetRows || sheetRows.length === 0) {
        continue;
      }

      const headerScanLimit = sheetRows.length;
      for (let i = 0; i < headerScanLimit; i++) {
        const { effectiveHeader: candidateHeader, startIndex } = normalizeHeaderRow(sheetRows[i] || []);
        const normalizedCandidate = candidateHeader.map(canonicalHeader);
        const matches = normalizedCandidate.length === expectedHeader.length &&
          expectedHeader.every((expected, index) => expected === normalizedCandidate[index]);
        if (matches) {
          headerRowIndex = i;
          headerStartIndex = startIndex;
          rows = sheetRows;
          break;
        }
      }

      if (headerRowIndex !== -1) {
        break;
      }
    }

    if (headerRowIndex === -1 || rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid file structure. Expected columns: Customer Name, TR Number, Address / Customer Details (in that order).'
      });
    }

    const duplicateMode = normalizeCell(req.body.duplicateMode).toLowerCase() === 'update' ? 'update' : 'skip';

    const existingCustomers = await Customer.findAll({
      attributes: ['id', 'name', 'trNumber', 'customerCode', 'phone', 'email', 'address']
    });
    const nameMap = new Map();
    const trMap = new Map();
    existingCustomers.forEach((customer) => {
      const nameKey = normalizeName(customer.name).toLowerCase();
      if (nameKey) {
        nameMap.set(nameKey, customer);
      }
      const trKey = normalizeCell(customer.trNumber).toLowerCase();
      if (trKey) {
        trMap.set(trKey, customer);
      }
    });

    let customerCount = await Customer.count();
    let totalProcessed = 0;
    let successCount = 0;
    const failures = [];

    for (let i = headerRowIndex + 1; i < rows.length; i++) {
      const row = rows[i] || [];
      const rowNumber = i + 1;
      const rawName = row[headerStartIndex];
      const rawTrNumber = row[headerStartIndex + 1];
      const rawAddress = row[headerStartIndex + 2];
      const extraValues = row.some((value, index) => {
        const normalized = normalizeCell(value);
        if (normalized === '') {
          return false;
        }
        if (index < headerStartIndex) {
          return true;
        }
        if (index >= headerStartIndex + 3) {
          return true;
        }
        return false;
      });

      const name = normalizeName(rawName);
      const trNumber = normalizeCell(rawTrNumber);
      const address = normalizeCell(rawAddress);

      const isRowEmpty = !name && !trNumber && !address && !extraValues;
      if (isRowEmpty) {
        continue;
      }

      totalProcessed += 1;

      if (extraValues) {
        failures.push({
          row: rowNumber,
          customerName: name || null,
          reason: 'Extra columns are not allowed.'
        });
        continue;
      }

      if (!name) {
        failures.push({
          row: rowNumber,
          customerName: null,
          reason: 'Customer details are incomplete or invalid for this record.'
        });
        continue;
      }

      const nameKey = name.toLowerCase();
      const trKey = trNumber.toLowerCase();
      const existingByName = nameKey ? nameMap.get(nameKey) : null;
      const existingByTr = trKey ? trMap.get(trKey) : null;

      if (duplicateMode === 'skip') {
        if (existingByName) {
          failures.push({
            row: rowNumber,
            customerName: name,
            reason: 'Duplicate customer name.'
          });
          continue;
        }
        if (trKey && existingByTr) {
          failures.push({
            row: rowNumber,
            customerName: name,
            reason: 'Duplicate TR Number.'
          });
          continue;
        }
      }

      if (duplicateMode === 'update' && existingByName && existingByTr && existingByName.id !== existingByTr.id) {
        failures.push({
          row: rowNumber,
          customerName: name,
          reason: 'Customer name and TR Number refer to different existing records.'
        });
        continue;
      }

      if (duplicateMode === 'update' && (existingByName || existingByTr)) {
        const target = existingByTr || existingByName;
        try {
          const updates = { name };
          if (trNumber) {
            updates.trNumber = trNumber;
          }
          if (address) {
            updates.address = address;
          }
          await target.update(updates);

          successCount += 1;
          nameMap.set(nameKey, target);
          if (trKey) {
            trMap.set(trKey, target);
          }
          continue;
        } catch (err) {
          failures.push({
            row: rowNumber,
            customerName: name,
            reason: err.message || 'Failed to update customer.'
          });
          continue;
        }
      }

      customerCount += 1;
      const customerCode = `CUST${String(customerCount).padStart(5, '0')}`;

      try {
        const created = await Customer.create({
          customerCode,
          name,
          email: null,
          phone: 'N/A',
          trNumber: trNumber || null,
          address: address || null,
          customerType: 'individual',
          creditLimit: 0,
          currentBalance: 0
        });

        successCount += 1;
        nameMap.set(nameKey, created);
        if (trKey) {
          trMap.set(trKey, created);
        }
      } catch (err) {
        failures.push({
          row: rowNumber,
          customerName: name,
          reason: err.message || 'Failed to save customer.'
        });
      }
    }

    res.status(200).json({
      success: true,
      message: failures.length > 0
        ? 'Import completed with some errors. Customer details are incomplete or invalid for some records.'
        : 'Import completed successfully.',
      data: {
        totalProcessed,
        successCount,
        failedCount: failures.length,
        failures
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

// @desc    Export customers to Excel/CSV
// @route   GET /api/customers/export
// @access  Private (Super Admin)
exports.exportCustomers = async (req, res) => {
  try {
    const format = normalizeCell(req.query.format).toLowerCase() || 'xlsx';
    if (!['xlsx', 'csv'].includes(format)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid export format. Use xlsx or csv.'
      });
    }

    const customers = await Customer.findAll({
      order: [['createdAt', 'DESC']]
    });

    const header = ['Customer Name', 'TR Number', 'Address / Customer Details'];
    const rows = customers.map((customer) => ([
      customer.name || '',
      customer.trNumber || '',
      customer.address || ''
    ]));

    const worksheet = XLSX.utils.aoa_to_sheet([header, ...rows]);

    const today = new Date();
    const dateStamp = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const filename = `customers-export-${dateStamp}.${format}`;

    if (format === 'csv') {
      const csv = XLSX.utils.sheet_to_csv(worksheet);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.status(200).send(csv);
    }

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Customers');
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.status(200).send(buffer);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};
