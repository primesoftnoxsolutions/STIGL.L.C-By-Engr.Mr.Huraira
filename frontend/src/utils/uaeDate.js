export const UAE_TIMEZONE = 'Asia/Dubai';

export const getUaeDateKey = () => (
  new Intl.DateTimeFormat('en-CA', { timeZone: UAE_TIMEZONE }).format(new Date())
);

export const getUaeMonthKey = () => {
  const dateKey = getUaeDateKey();
  return dateKey ? dateKey.slice(0, 7) : '';
};
