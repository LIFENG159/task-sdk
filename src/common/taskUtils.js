const isNumber = (value) => typeof value === 'number' && !Number.isNaN(value);

const now = () => Date.now();

const getDayKey = (timestamp = now()) => {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getRemainingSeconds = (startedAt, durationSeconds) => {
  if (!isNumber(startedAt) || !isNumber(durationSeconds)) {
    return 0;
  }
  const elapsed = Math.floor((now() - startedAt) / 1000);
  return Math.max(durationSeconds - elapsed, 0);
};

module.exports = { isNumber, now, getDayKey, getRemainingSeconds };
