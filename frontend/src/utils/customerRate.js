export const normalizeCustomerRateType = (value) => {
  if (!value) return null;

  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'gas') return 'Gas';
  if (normalized === 'tool') return 'Tool';
  if (
    normalized === 'full cylinder' ||
    normalized === 'full-cylinder' ||
    normalized === 'full_cylinder' ||
    normalized === 'cylinder'
  ) {
    return 'Full Cylinder';
  }
  if (
    normalized === 'empty cylinder' ||
    normalized === 'empty-cylinder' ||
    normalized === 'empty_cylinder'
  ) {
    return 'Empty Cylinder';
  }
  return null;
};

export const buildCustomerRateKey = (itemType, itemId) => {
  const normalizedType = normalizeCustomerRateType(itemType);
  if (!normalizedType || !itemId) return null;
  return `${normalizedType}::${itemId}`;
};

export const getProductTypeForCustomerRate = (itemType) => {
  const normalizedType = normalizeCustomerRateType(itemType);
  if (!normalizedType) return null;
  if (normalizedType === 'Full Cylinder' || normalizedType === 'Empty Cylinder') {
    return 'Cylinder';
  }
  return normalizedType;
};
