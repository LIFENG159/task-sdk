const noop = () => {};

const createCallbacks = (callbacks = {}) => ({
  onTasksUpdated: callbacks.onTasksUpdated || noop,
  onTaskStatusChanged: callbacks.onTaskStatusChanged || noop,
  onCountdownTick: callbacks.onCountdownTick || noop,
  onRewardClaimed: callbacks.onRewardClaimed || noop,
  onError: callbacks.onError || noop,
});

module.exports = { createCallbacks };
