const TaskRepository = require('../api/taskRepository');
const TaskStore = require('../features/taskStore');
const TaskTimerManager = require('../features/taskTimerManager');
const { TASK_TYPES, TASK_STATUS } = require('../enums/taskTypes');
const { now, getRemainingSeconds } = require('../common/taskUtils');
const { createMemoryStorage } = require('../common/storage');
const { createCallbacks } = require('../components/callbacks');

class TaskSdk {
  constructor(config = {}) {
    this.config = config;
    this.callbacks = createCallbacks(config.callbacks);
    this.storage = config.storage || (typeof window !== 'undefined' && window.localStorage) || createMemoryStorage();
    this.store = new TaskStore();
    this.progressReportAt = new Map();
    this.repository = new TaskRepository({
      baseUrl: config.baseUrl,
      userId: config.userId,
      activityId: config.activityId,
      fetch: config.fetch,
    });
    this.timerManager = new TaskTimerManager();
  }

  async init() {
    return this.fetchTasks();
  }

  // 拉取最新任务并恢复进行中的定时器。
  async fetchTasks() {
    try {
      const tasks = await this.repository.getTasks();
      this.store.setTasks(tasks);
      this.callbacks.onTasksUpdated(this.store.getTasks());
      this.restoreDelayedClaims();
      this.restoreCountdownTasks();
      return tasks;
    } catch (error) {
      this.handleError(error, { action: 'fetchTasks' });
      return [];
    }
  }

  // 根据任务类型规则启动任务。
  startTask(taskId) {
    const task = this.store.getTaskById(taskId);
    if (!task) {
      return;
    }

    if (task.type === TASK_TYPES.DELAYED_CLAIM) {
      this.startDelayedClaim(task);
      return;
    }

    if (
      task.type === TASK_TYPES.BROWSE_JUMP_COUNTDOWN ||
      task.type === TASK_TYPES.BUBBLE_SCROLL_COUNTDOWN
    ) {
      if (task.config && task.config.jumpUrl) {
        this.callbacks.onTaskJump(task);
      }
      this.startCountdownTask(task);
      return;
    }

    if (task.type === TASK_TYPES.DIVERSION_ORDER) {
      this.callbacks.onTaskJump(task);
    }
  }

  // 完成任务并更新本地状态，同时通知回调。
  async completeTask(taskId, extra) {
    const task = this.store.getTaskById(taskId);
    if (!task) {
      return null;
    }
    try {
      const updated = await this.repository.completeTask(taskId, task.type, extra);
      const saved = this.store.updateTask(taskId, (current) => ({ ...current, ...updated }));
      if (saved) {
        this.emitTaskStatus(saved);
        this.clearCountdownStateIfNeeded(saved);
      }
      return saved;
    } catch (error) {
      this.handleError(error, { action: 'completeTask', taskId });
      return null;
    }
  }

  // 领取已完成任务的奖励。
  async claimReward(taskId) {
    try {
      const payload = await this.repository.claimReward(taskId);
      const saved = this.store.updateTask(taskId, (current) => ({ ...current, ...payload.task }));
      if (payload.reward) {
        this.callbacks.onRewardClaimed(taskId, payload.reward);
      }
      if (saved) {
        this.emitTaskStatus(saved);
      }
      return payload;
    } catch (error) {
      this.handleError(error, { action: 'claimReward', taskId });
      return null;
    }
  }

  // 清理所有计时器与内部状态。
  destroy() {
    this.timerManager.clearAll();
  }

  // 倒计时类任务到期后自动完成。
  startCountdownTask(task) {
    const duration = task.config && task.config.durationSeconds ? task.config.durationSeconds : 0;
    const startedAt = now();
    this.storage.setItem(this.getCountdownStartedAtKey(task.id), startedAt);
    const updated = this.store.updateTask(task.id, (current) => ({
      ...current,
      status: TASK_STATUS.IN_PROGRESS,
      progress: { remainingSeconds: duration, startedAt },
    }));
    if (updated) {
      this.emitTaskStatus(updated);
    }
    this.timerManager.startCountdown(task.id, duration, {
      onTick: (id, remaining) => {
        this.store.updateTask(id, (current) => ({
          ...current,
          progress: { ...(current.progress || {}), remainingSeconds: remaining },
        }));
        this.reportCountdownProgress(id, remaining);
        this.callbacks.onCountdownTick(id, remaining);
      },
      onComplete: (id) => {
        const optimistic = this.store.updateTask(id, (current) => ({
          ...current,
          status: TASK_STATUS.COMPLETED,
          progress: { ...(current.progress || {}), remainingSeconds: 0 },
        }));
        if (optimistic) {
          this.emitTaskStatus(optimistic);
        }
        this.completeTask(id);
      },
    });
  }

  // 延迟领取任务：到期后变为可领取。
  startDelayedClaim(task) {
    const delay = task.config && task.config.claimDelaySeconds ? task.config.claimDelaySeconds : 0;
    const key = this.getDelayedClaimKey(task.id);
    const storedStartedAt = Number(this.storage.getItem(key));
    const startedAt = storedStartedAt || now();
    if (!storedStartedAt) {
      this.storage.setItem(key, startedAt);
    }

    const remaining = getRemainingSeconds(startedAt, delay);
    if (remaining <= 0) {
      const claimable = this.store.updateTask(task.id, (current) => ({
        ...current,
        status: TASK_STATUS.CLAIMABLE,
      }));
      if (claimable) {
        this.emitTaskStatus(claimable);
      }
      return;
    }

    const updated = this.store.updateTask(task.id, (current) => ({
      ...current,
      status: TASK_STATUS.IN_PROGRESS,
      progress: { remainingSeconds: remaining, startedAt },
    }));
    if (updated) {
      this.emitTaskStatus(updated);
    }

    this.timerManager.startCountdown(task.id, remaining, {
      onComplete: (id) => {
        const claimable = this.store.updateTask(id, (current) => ({
          ...current,
          status: TASK_STATUS.CLAIMABLE,
        }));
        if (claimable) {
          this.emitTaskStatus(claimable);
        }
      },
    });
  }

  // 刷新后从存储中恢复延迟领取任务的倒计时。
  restoreDelayedClaims() {
    const tasks = this.store.getTasks();
    tasks.forEach((task) => {
      if (task.type !== TASK_TYPES.DELAYED_CLAIM) {
        return;
      }
      const key = this.getDelayedClaimKey(task.id);
      const storedStartedAt = Number(this.storage.getItem(key));
      if (!storedStartedAt) {
        return;
      }
      const delay = task.config && task.config.claimDelaySeconds ? task.config.claimDelaySeconds : 0;
      const remaining = getRemainingSeconds(storedStartedAt, delay);
      if (remaining <= 0) {
        this.store.updateTask(task.id, (current) => ({
          ...current,
          status: TASK_STATUS.CLAIMABLE,
        }));
        this.emitTaskStatus(this.store.getTaskById(task.id));
      } else {
        this.store.updateTask(task.id, (current) => ({
          ...current,
          status: TASK_STATUS.IN_PROGRESS,
          progress: { remainingSeconds: remaining, startedAt: storedStartedAt },
        }));
        this.timerManager.startCountdown(task.id, remaining, {
          onComplete: (id) => {
            const claimable = this.store.updateTask(id, (current) => ({
              ...current,
              status: TASK_STATUS.CLAIMABLE,
            }));
            if (claimable) {
              this.emitTaskStatus(claimable);
            }
          },
        });
      }
    });
  }

  // 根据存储的开始时间恢复倒计时任务（浏览/滑动）。
  restoreCountdownTasks() {
    const tasks = this.store.getTasks();
    tasks.forEach((task) => {
      if (
        task.type !== TASK_TYPES.BROWSE_JUMP_COUNTDOWN &&
        task.type !== TASK_TYPES.BUBBLE_SCROLL_COUNTDOWN
      ) {
        return;
      }

      if (
        task.status === TASK_STATUS.COMPLETED ||
        task.status === TASK_STATUS.CLAIMABLE ||
        task.status === TASK_STATUS.CLAIMED
      ) {
        return;
      }

      const startedAt = Number(this.storage.getItem(this.getCountdownStartedAtKey(task.id)));
      if (!startedAt) {
        return;
      }

      const duration = task.config && task.config.durationSeconds ? task.config.durationSeconds : 0;
      const remaining = getRemainingSeconds(startedAt, duration);
      if (remaining <= 0) {
        const optimistic = this.store.updateTask(task.id, (current) => ({
          ...current,
          status: TASK_STATUS.COMPLETED,
          progress: { ...(current.progress || {}), remainingSeconds: 0, startedAt },
        }));
        if (optimistic) {
          this.emitTaskStatus(optimistic);
        }
        this.completeTask(task.id);
        return;
      }

      const updated = this.store.updateTask(task.id, (current) => ({
        ...current,
        status: TASK_STATUS.IN_PROGRESS,
        progress: { ...(current.progress || {}), remainingSeconds: remaining, startedAt },
      }));
      if (updated) {
        this.emitTaskStatus(updated);
      }
      this.timerManager.startCountdown(task.id, remaining, {
        onTick: (id, nextRemaining) => {
          this.store.updateTask(id, (current) => ({
            ...current,
            progress: { ...(current.progress || {}), remainingSeconds: nextRemaining, startedAt },
          }));
          this.reportCountdownProgress(id, nextRemaining);
          this.callbacks.onCountdownTick(id, nextRemaining);
        },
        onComplete: (id) => {
          const optimistic = this.store.updateTask(id, (current) => ({
            ...current,
            status: TASK_STATUS.COMPLETED,
            progress: { ...(current.progress || {}), remainingSeconds: 0, startedAt },
          }));
          if (optimistic) {
            this.emitTaskStatus(optimistic);
          }
          this.completeTask(id);
        },
      });
    });
  }

  // 向宿主派发状态变化通知。
  emitTaskStatus(task) {
    if (task) {
      this.callbacks.onTaskStatusChanged(task);
    }
  }

  handleError(error, context) {
    this.callbacks.onError(error, context);
  }

  getDelayedClaimKey(taskId) {
    return `task-sdk:${taskId}:startedAt`;
  }

  getCountdownStartedAtKey(taskId) {
    return `task-sdk:${taskId}:countdownStartedAt`;
  }

  clearCountdownStateIfNeeded(task) {
    if (
      task.type !== TASK_TYPES.BROWSE_JUMP_COUNTDOWN &&
      task.type !== TASK_TYPES.BUBBLE_SCROLL_COUNTDOWN
    ) {
      return;
    }
    if (task.status !== TASK_STATUS.COMPLETED && task.status !== TASK_STATUS.CLAIMED) {
      return;
    }
    this.storage.removeItem(this.getCountdownStartedAtKey(task.id));
    this.progressReportAt.delete(task.id);
  }

  reportCountdownProgress(taskId, remainingSeconds) {
    const lastReported = this.progressReportAt.get(taskId) || 0;
    const nowAt = now();
    if (remainingSeconds > 0 && nowAt - lastReported < 5000) {
      return;
    }
    this.progressReportAt.set(taskId, nowAt);
    this.repository
      .reportProgress(taskId, { remainingSeconds })
      .catch((error) => this.handleError(error, { action: 'reportProgress', taskId }));
  }
}

module.exports = TaskSdk;
