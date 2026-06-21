const sequelize = require('../config/database');
console.log('Sequelize Dialect:', sequelize.getDialect());
console.log('Sequelize Config:', sequelize.config);
