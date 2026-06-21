const UAE_TIMEZONE = 'Asia/Dubai';
const UAE_OFFSET_MINUTES = 4 * 60;
const UAE_OFFSET_MS = UAE_OFFSET_MINUTES * 60 * 1000;

const parseDateKey = (value) => {
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

const toUaeDateKey = (date = new Date()) => {
  const uaeMs = date.getTime() + UAE_OFFSET_MS;
  return new Date(uaeMs).toISOString().slice(0, 10);
};

const buildUaeDateKey = (year, monthIndex, day) => (
  new Date(Date.UTC(year, monthIndex, day, 0, 0, 0)).toISOString().slice(0, 10)
);

const getUaeNowParts = (date = new Date()) => {
  const uaeMs = date.getTime() + UAE_OFFSET_MS;
  const uaeDate = new Date(uaeMs);
  return {
    year: uaeDate.getUTCFullYear(),
    monthIndex: uaeDate.getUTCMonth(),
    day: uaeDate.getUTCDate(),
    hour: uaeDate.getUTCHours(),
    minute: uaeDate.getUTCMinutes(),
    second: uaeDate.getUTCSeconds()
  };
};

const makeUaeDate = (year, monthIndex, day, hour = 0, minute = 0, second = 0, ms = 0) => (
  new Date(Date.UTC(year, monthIndex, day, hour, minute, second, ms) - UAE_OFFSET_MS)
);

const makeUaeDateFromKey = (dateKey, hour = 0, minute = 0, second = 0, ms = 0) => {
  const parts = parseDateKey(dateKey);
  if (!parts) return null;
  return makeUaeDate(parts.year, parts.monthIndex, parts.day, hour, minute, second, ms);
};

const getUaeDayRange = (dateKey) => {
  const start = makeUaeDateFromKey(dateKey, 0, 0, 0, 0);
  if (!start) return null;
  const end = new Date(start.getTime() + (24 * 60 * 60 * 1000) - 1);
  return { start, end };
};

const buildUaeDateRange = (startInput, endInput) => {
  const startRange = getUaeDayRange(startInput);
  const endRange = getUaeDayRange(endInput);
  if (startRange && endRange) {
    return { start: startRange.start, end: endRange.end };
  }

  const start = parseUaeDateInput(startInput);
  const end = parseUaeDateInput(endInput);
  if (!start || !end) return null;
  return { start, end };
};

const parseUaeDateInput = (value) => {
  if (!value) return null;
  if (value instanceof Date) return value;
  const parts = parseDateKey(value);
  if (parts) {
    return makeUaeDate(parts.year, parts.monthIndex, parts.day, 0, 0, 0, 0);
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

const addDaysToDateKey = (dateKey, deltaDays) => {
  if (!dateKey) return null;
  const parts = parseDateKey(dateKey);
  if (!parts) return null;
  const baseUtcMs = Date.UTC(parts.year, parts.monthIndex, parts.day, 0, 0, 0);
  const nextUtcMs = baseUtcMs + (deltaDays * 24 * 60 * 60 * 1000);
  return new Date(nextUtcMs).toISOString().slice(0, 10);
};

module.exports = {
  UAE_TIMEZONE,
  UAE_OFFSET_MINUTES,
  UAE_OFFSET_MS,
  parseDateKey,
  toUaeDateKey,
  buildUaeDateKey,
  getUaeNowParts,
  makeUaeDate,
  makeUaeDateFromKey,
  getUaeDayRange,
  buildUaeDateRange,
  parseUaeDateInput,
  addDaysToDateKey
};
