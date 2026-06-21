const { DataTypes } = require('sequelize');

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('receiving_invoices', {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
      },
      rcNumber: {
        type: DataTypes.STRING(50),
        allowNull: false,
        unique: true
      },
      customerId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: 'customers',
          key: 'id'
        }
      },
      employeeId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id'
        }
      },
      rcDate: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
      },
      paymentMethod: {
        type: DataTypes.ENUM('cash', 'check', 'bank_transfer', 'credit_card', 'debit_card', 'other'),
        allowNull: false
      },
      totalAmount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false
      },
      bankName: {
        type: DataTypes.STRING(100)
      },
      checkNumber: {
        type: DataTypes.STRING(100)
      },
      signature: {
        type: DataTypes.TEXT('long')
      },
      notes: {
        type: DataTypes.TEXT
      },
      status: {
        type: DataTypes.ENUM('active', 'cancelled'),
        defaultValue: 'active'
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
      }
    });

    await queryInterface.createTable('receiving_invoice_items', {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
      },
      receivingInvoiceId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: 'receiving_invoices',
          key: 'id'
        }
      },
      salesInvoiceId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: 'sales_invoices',
          key: 'id'
        }
      },
      paymentId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: 'payments',
          key: 'id'
        }
      },
      invoiceNumber: {
        type: DataTypes.STRING(50),
        allowNull: false
      },
      invoiceAmount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false
      },
      amountReceived: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
      }
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('receiving_invoice_items');
    await queryInterface.dropTable('receiving_invoices');
  }
};
