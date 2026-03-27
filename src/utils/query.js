function parsePageLimit(page, limit, maxLimit = 100, defaultLimit = 20) {
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(maxLimit, Math.max(1, parseInt(limit, 10) || defaultLimit));
  const offset = (pageNum - 1) * limitNum;
  return { pageNum, limitNum, offset };
}

function parseKeyword(keyword) {
  const value = String(keyword || '').trim();
  return value || null;
}

function parseBooleanFlag(value) {
  if (value === undefined || value === null || value === '') return null;
  if (value === true || value === 'true' || value === 1 || value === '1') return 1;
  if (value === false || value === 'false' || value === 0 || value === '0') return 0;
  return null;
}

function parseSort(sortBy, sortOrder, sortMap, defaultSortKey) {
  const sortByKey = Object.prototype.hasOwnProperty.call(sortMap, sortBy) ? sortBy : defaultSortKey;
  const sortColumn = sortMap[sortByKey] || sortMap[defaultSortKey];
  const sortOrderValue = String(sortOrder || 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc';
  const sortDir = sortOrderValue === 'asc' ? 'ASC' : 'DESC';
  return { sortColumn, sortDir, sortByKey, sortOrderValue };
}

function parseEnum(value, allowedValues) {
  if (value === undefined || value === null || value === '') return null;
  return allowedValues.includes(value) ? value : null;
}

function parseIntInRange(value, min, max = Number.MAX_SAFE_INTEGER) {
  if (value === undefined || value === null || value === '') return null;
  const n = parseInt(value, 10);
  if (!Number.isFinite(n)) return null;
  if (n < min || n > max) return null;
  return n;
}

module.exports = {
  parsePageLimit,
  parseKeyword,
  parseBooleanFlag,
  parseSort,
  parseEnum,
  parseIntInRange
};
