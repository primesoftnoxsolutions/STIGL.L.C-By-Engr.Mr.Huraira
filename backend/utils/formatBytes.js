const formatBytes = (bytes) => {
  const value = Number(bytes || 0);
  if (!Number.isFinite(value) || value <= 0) {
    return '0B';
  }

  if (value < 1024) {
    return `${Math.round(value)}B`;
  }

  if (value < 1024 * 1024) {
    return `${Math.round(value / 1024)}KB`;
  }

  if (value < 1024 * 1024 * 1024) {
    return `${(value / (1024 * 1024)).toFixed(1)}MB`;
  }

  return `${(value / (1024 * 1024 * 1024)).toFixed(2)}GB`;
};

module.exports = {
  formatBytes
};
