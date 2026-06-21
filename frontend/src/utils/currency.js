// Currency formatting utility for UAE Dirham
export const formatCurrency = (amount) => {
  return `AED ${parseFloat(amount || 0).toFixed(2)}`;
};

export const formatCurrencyArabic = (amount) => {
  return `${parseFloat(amount || 0).toFixed(2)} د.إ`;
};

// VAT Rate for UAE
export const VAT_RATE = 0.05; // 5%

export const calculateVAT = (amount) => {
  return parseFloat(amount || 0) * VAT_RATE;
};

export const calculateTotalWithVAT = (amount) => {
  return parseFloat(amount || 0) * (1 + VAT_RATE);
};
