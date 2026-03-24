const isNumber = (value) => typeof value === 'number' && !Number.isNaN(value);

const now = () => Date.now();

const getRemainingSeconds = (startedAt, durationSeconds) => {
  if (!isNumber(startedAt) || !isNumber(durationSeconds)) {
    return 0;
  }
  const elapsed = Math.floor((now() - startedAt) / 1000);
  return Math.max(durationSeconds - elapsed, 0);
};

module.exports = { isNumber, now, getRemainingSeconds };
