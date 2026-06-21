export const getQuotationCustomerDisplay = (quotation, customers = []) => {
  if (!quotation) {
    return {
      name: 'N/A',
      phone: 'N/A',
      email: 'N/A',
      trNumber: '',
      isWalkIn: false
    };
  }

  if (quotation.customerType === 'walk_in') {
    return {
      name: quotation.walkInCustomerName || 'Walk-in Customer',
      phone: 'N/A',
      email: 'N/A',
      trNumber: quotation.walkInTrNumber || '',
      isWalkIn: true
    };
  }

  const customer = quotation.customer
    || customers.find((entry) => entry.id === quotation.customerId)
    || null;

  return {
    name: customer?.name || 'N/A',
    phone: customer?.phone || 'N/A',
    email: customer?.email || 'N/A',
    trNumber: '',
    isWalkIn: false
  };
};
