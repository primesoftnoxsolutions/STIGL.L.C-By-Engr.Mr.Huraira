const { Product } = require('../models');
const { Op } = require('sequelize');
const XLSX = require('xlsx');
const path = require('path');

// Helper function to generate smart product code
function generateProductCode(productName) {
  if (!productName || typeof productName !== 'string') {
    return '';
  }

  // Remove all numbers and special characters, keep only words
  const cleanedName = productName.replace(/[0-9]/g, '').trim();
  
  // Split into words and filter out empty strings
  const words = cleanedName.split(/\s+/).filter(word => word.length > 0);
  
  if (words.length === 0) {
    return '';
  }

  let code = '';
  
  // Process first word with special rules
  const firstWord = words[0].toLowerCase();
  if (firstWord === 'cylinder') {
    code = 'CY';
  } else if (firstWord === 'oxygen') {
    code = 'OX';
  } else if (firstWord === 'gas') {
    code = 'GA';
  } else {
    code = words[0].charAt(0).toUpperCase();
  }
  
  // Process remaining words - take first letter only
  for (let i = 1; i < words.length; i++) {
    code += words[i].charAt(0).toUpperCase();
  }
  
  return code;
}

// Helper function to ensure unique product code
async function ensureUniqueProductCode(baseCode) {
  let code = baseCode;
  let counter = 1;
  
  while (true) {
    const existing = await Product.findOne({ where: { productCode: code } });
    if (!existing) {
      return code;
    }
    // If code exists, append number
    counter++;
    code = `${baseCode}${counter}`;
  }
}

function normalizeProductName(value) {
  if (!value && value !== 0) {
    return '';
  }
  return String(value).trim().replace(/\s+/g, ' ');
}

function detectProductTypeFromName(productName) {
  const normalized = normalizeProductName(productName);
  if (!normalized) {
    return 'Tool';
  }
  const firstWord = normalized.split(/\s+/)[0].toLowerCase();
  const firstLetter = normalized.charAt(0).toLowerCase();
  if (firstWord === 'gas' || firstLetter === 'g') {
    return 'Gas';
  }
  if (firstWord === 'cylinder' || firstLetter === 'c') {
    return 'Cylinder';
  }
  return 'Tool';
}

function parseNumericField(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : NaN;
  }
  const cleaned = String(value).trim().replace(/,/g, '');
  if (cleaned === '') {
    return null;
  }
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) {
    return NaN;
  }
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : NaN;
}

// @desc    Get all products
// @route   GET /api/products
// @access  Private
exports.getAllProducts = async (req, res) => {
  try {
    const { search, isActive, category } = req.query;
    const where = {};

    if (isActive !== undefined) where.isActive = isActive === 'true';
    if (category) where.productCategory = category;
    if (search) {
      where[Op.or] = [
        { productName: { [Op.like]: `%${search}%` } },
        { productCode: { [Op.like]: `%${search}%` } }
      ];
    }

    const products = await Product.findAll({
      where,
      order: [['createdAt', 'DESC']]
    });

    res.status(200).json({
      success: true,
      count: products.length,
      data: products
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Get single product
// @route   GET /api/products/:id
// @access  Private
exports.getProduct = async (req, res) => {
  try {
    const product = await Product.findByPk(req.params.id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    res.status(200).json({
      success: true,
      data: product
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Generate product code from name
// @route   POST /api/products/generate-code
// @access  Private
exports.generateCode = async (req, res) => {
  try {
    const { productName } = req.body;

    if (!productName) {
      return res.status(400).json({
        success: false,
        message: 'Product name is required'
      });
    }

    // Generate base code
    const baseCode = generateProductCode(productName);
    
    if (!baseCode) {
      return res.status(400).json({
        success: false,
        message: 'Could not generate product code from the provided name'
      });
    }

    // Ensure uniqueness
    const uniqueCode = await ensureUniqueProductCode(baseCode);

    res.status(200).json({
      success: true,
      data: { productCode: uniqueCode }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Create product
// @route   POST /api/products
// @access  Private
exports.createProduct = async (req, res) => {
  try {
    const { productName, productCategory, productType, costPrice, leastSellingPrice, description } = req.body;

    // Validate required fields
    if (!productName || !productType) {
      return res.status(400).json({
        success: false,
        message: 'Product name and product type are required'
      });
    }

    // Validate product type
    if (!['Gas', 'Cylinder', 'Tool'].includes(productType)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid product type. Must be Gas, Cylinder, or Tool'
      });
    }

    // Validate prices
    if (parseFloat(leastSellingPrice) < parseFloat(costPrice)) {
      return res.status(400).json({
        success: false,
        message: 'Least Selling Price cannot be lower than Cost Price'
      });
    }

    // Generate smart product code
    const baseCode = generateProductCode(productName);
    const productCode = await ensureUniqueProductCode(baseCode);

    // Create product
    const product = await Product.create({
      productCode,
      productName,
      productCategory: productCategory || null,
      productType,
      costPrice,
      leastSellingPrice,
      description: description || null,
      isActive: true
    });

    res.status(201).json({
      success: true,
      data: product,
      message: 'Product created successfully with auto-generated code'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Update product
// @route   PUT /api/products/:id
// @access  Private
exports.updateProduct = async (req, res) => {
  try {
    const product = await Product.findByPk(req.params.id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    const { productName, productCategory, productType, costPrice, leastSellingPrice, description, isActive } = req.body;

    // Validate product type if provided
    if (productType && !['Gas', 'Cylinder', 'Tool'].includes(productType)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid product type. Must be Gas, Cylinder, or Tool'
      });
    }

    // Validate prices if they are being updated
    const newCostPrice = costPrice !== undefined ? costPrice : product.costPrice;
    const newLeastPrice = leastSellingPrice !== undefined ? leastSellingPrice : product.leastSellingPrice;

    if (parseFloat(newLeastPrice) < parseFloat(newCostPrice)) {
      return res.status(400).json({
        success: false,
        message: 'Least Selling Price cannot be lower than Cost Price'
      });
    }

    // Update product (product code cannot be changed)
    await product.update({
      productName: productName !== undefined ? productName : product.productName,
      productCategory: productCategory !== undefined ? productCategory : product.productCategory,
      productType: productType !== undefined ? productType : product.productType,
      costPrice: newCostPrice,
      leastSellingPrice: newLeastPrice,
      description: description !== undefined ? description : product.description,
      isActive: isActive !== undefined ? isActive : product.isActive
    });

    res.status(200).json({
      success: true,
      data: product
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Delete product (hard delete)
// @route   DELETE /api/products/:id
// @access  Private (Super Admin)
exports.deleteProduct = async (req, res) => {
  try {
    const product = await Product.findByPk(req.params.id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Hard delete - permanently remove from database
    await product.destroy();

    res.status(200).json({
      success: true,
      message: 'Product deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Import products from Excel/CSV
// @route   POST /api/products/import
// @access  Private (Admin/Super Admin)
exports.importProducts = async (req, res) => {
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

    const headerKey = (value) => String(value || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '');

    const canonicalHeader = (value) => {
      const key = headerKey(value);
      if (!key) {
        return '';
      }
      if (key === 'productname' || key === 'product' || key === 'name' || key.startsWith('productname')) {
        return 'productname';
      }
      if (key === 'costprice' || key === 'cost' || key.startsWith('costprice')) {
        return 'costprice';
      }
      if (
        key === 'saleprice' ||
        key === 'sellingprice' ||
        key === 'leastsellingprice' ||
        key === 'leastprice' ||
        key.startsWith('saleprice') ||
        key.startsWith('sellingprice') ||
        key.startsWith('leastprice')
      ) {
        return 'saleprice';
      }
      return '';
    };

    const expectedHeader = ['productname', 'costprice', 'saleprice'];

    const normalizeHeaderRow = (row) => {
      const normalized = (row || []).map((cell, index) => {
        let value = String(cell || '').trim();
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
    let effectiveHeader = [];
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
          effectiveHeader = candidateHeader;
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
        message: 'Invalid file structure. Expected columns: Product Name, Cost Price, Sale Price (in that order).'
      });
    }

    const existingProducts = await Product.findAll({ attributes: ['productName'] });
    const existingNames = new Set(
      existingProducts
        .map(product => normalizeProductName(product.productName).toLowerCase())
        .filter(Boolean)
    );
    const seenNames = new Set();
    const failures = [];
    let successCount = 0;

    for (let i = headerRowIndex + 1; i < rows.length; i++) {
      const row = rows[i] || [];
      const rowNumber = i + 1;
      const rawName = row[headerStartIndex];
      const rawCost = row[headerStartIndex + 1];
      const rawSale = row[headerStartIndex + 2];
      const extraValues = row.some((value, index) => {
        const normalized = value === undefined || value === null ? '' : String(value).trim();
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

      const name = normalizeProductName(rawName);
      const nameKey = name.toLowerCase();
      const rawCostText = rawCost === undefined || rawCost === null ? '' : String(rawCost).trim();
      const rawSaleText = rawSale === undefined || rawSale === null ? '' : String(rawSale).trim();

      const isRowEmpty = !name && rawCostText === '' && rawSaleText === '' && !extraValues;
      if (isRowEmpty) {
        continue;
      }

      if (extraValues) {
        failures.push({
          row: rowNumber,
          productName: name || null,
          reason: 'Extra columns are not allowed.'
        });
        continue;
      }

      if (!name) {
        failures.push({
          row: rowNumber,
          productName: null,
          reason: 'Product details are incomplete or invalid for this item.'
        });
        continue;
      }

      if (existingNames.has(nameKey) || seenNames.has(nameKey)) {
        failures.push({
          row: rowNumber,
          productName: name,
          reason: 'Duplicate product name.'
        });
        continue;
      }

      if (rawCostText === '') {
        failures.push({
          row: rowNumber,
          productName: name,
          reason: 'Product details are incomplete or invalid for this item.'
        });
        continue;
      }

      if (rawSaleText === '') {
        failures.push({
          row: rowNumber,
          productName: name,
          reason: 'Product details are incomplete or invalid for this item.'
        });
        continue;
      }

      const costPrice = parseNumericField(rawCost);
      if (!Number.isFinite(costPrice)) {
        failures.push({
          row: rowNumber,
          productName: name,
          reason: 'Cost price must be numeric.'
        });
        continue;
      }

      const salePrice = parseNumericField(rawSale);
      if (!Number.isFinite(salePrice)) {
        failures.push({
          row: rowNumber,
          productName: name,
          reason: 'Sale price must be numeric.'
        });
        continue;
      }

      if (costPrice < 0 || salePrice < 0) {
        failures.push({
          row: rowNumber,
          productName: name,
          reason: 'Prices cannot be negative.'
        });
        continue;
      }

      if (salePrice < costPrice) {
        failures.push({
          row: rowNumber,
          productName: name,
          reason: 'Sale price cannot be lower than cost price.'
        });
        continue;
      }

      const productType = detectProductTypeFromName(name);
      const baseCode = generateProductCode(name);
      if (!baseCode) {
        failures.push({
          row: rowNumber,
          productName: name,
          reason: 'Could not generate product code.'
        });
        continue;
      }

      const productCode = await ensureUniqueProductCode(baseCode);

      try {
        await Product.create({
          productCode,
          productName: name,
          productCategory: productType,
          productType,
          costPrice,
          leastSellingPrice: salePrice,
          description: null,
          isActive: true
        });

        successCount += 1;
        existingNames.add(nameKey);
        seenNames.add(nameKey);
      } catch (err) {
        failures.push({
          row: rowNumber,
          productName: name,
          reason: err.message || 'Failed to save product.'
        });
      }
    }

    res.status(200).json({
      success: true,
      message: failures.length > 0
        ? 'Import completed with some errors. Product details are incomplete or invalid for some items.'
        : 'Import completed successfully.',
      data: {
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

// @desc    Export products to Excel/CSV
// @route   GET /api/products/export
// @access  Private (Super Admin)
exports.exportProducts = async (req, res) => {
  try {
    const format = String(req.query.format || 'xlsx').toLowerCase();
    if (!['xlsx', 'csv'].includes(format)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid export format. Use xlsx or csv.'
      });
    }

    const products = await Product.findAll({
      order: [['createdAt', 'DESC']]
    });

    const header = ['Product Name', 'Category (Gas / Cylinder)', 'Cost Price', 'Sale Price'];
    const rows = products.map((product) => {
      const category = product.productType || product.productCategory || '';
      const costValue = product.costPrice;
      const saleValue = product.leastSellingPrice;
      const costPrice = costValue !== null && costValue !== undefined ? Number(costValue) : '';
      const salePrice = saleValue !== null && saleValue !== undefined ? Number(saleValue) : '';
      return [
        product.productName || '',
        category,
        Number.isNaN(costPrice) ? (costValue ?? '') : costPrice,
        Number.isNaN(salePrice) ? (saleValue ?? '') : salePrice
      ];
    });

    const worksheet = XLSX.utils.aoa_to_sheet([header, ...rows]);

    const today = new Date();
    const dateStamp = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const filename = `products-export-${dateStamp}.${format}`;

    if (format === 'csv') {
      const csv = XLSX.utils.sheet_to_csv(worksheet);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.status(200).send(csv);
    }

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Products');
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

// @desc    Get product categories
// @route   GET /api/products/categories/list
// @access  Private
exports.getCategories = async (req, res) => {
  try {
    const categories = await Product.findAll({
      attributes: ['productCategory'],
      where: {
        productCategory: { [Op.ne]: null }
      },
      group: ['productCategory']
    });

    const categoryList = categories.map(c => c.productCategory).filter(c => c);

    res.status(200).json({
      success: true,
      data: categoryList
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};
