class TaskTimerManager {
  constructor() {
    this.timers = new Map();
  }

  clear(taskId) {
    const timer = this.timers.get(taskId);
    if (timer) {
      clearInterval(timer);
      this.timers.delete(taskId);
    }
  }

  clearAll() {
    for (const taskId of this.timers.keys()) {
      this.clear(taskId);
    }
  }

  startCountdown(taskId, durationSeconds, { onTick, onComplete }) {
    this.clear(taskId);
    let remaining = durationSeconds;
    if (onTick) {
      onTick(taskId, remaining);
    }
    const timer = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        this.clear(taskId);
        if (onTick) {
          onTick(taskId, 0);
        }
        if (onComplete) {
          onComplete(taskId);
        }
        return;
      }
      if (onTick) {
        onTick(taskId, remaining);
      }
    }, 1000);
    this.timers.set(taskId, timer);
  }
}

module.exports = TaskTimerManager;
