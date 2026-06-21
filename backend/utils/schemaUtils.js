const ensureTableColumns = async (sequelize, tableName, columns = []) => {
  if (!sequelize || !tableName || !Array.isArray(columns) || columns.length === 0) {
    return [];
  }

  const queryInterface = sequelize.getQueryInterface();
  const description = await queryInterface.describeTable(tableName);
  const existing = new Set(Object.keys(description || {}));
  const added = [];

  for (const column of columns) {
    if (!column?.name || !column?.definition) continue;
    if (existing.has(column.name)) continue;

    await queryInterface.addColumn(tableName, column.name, column.definition);
    existing.add(column.name);
    added.push(column.name);
  }

  return added;
};

module.exports = {
  ensureTableColumns
};
