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

  async fetchTasks() {
    try {
      const tasks = await this.repository.getTasks();
      this.store.setTasks(tasks);
      this.callbacks.onTasksUpdated(this.store.getTasks());
      this.restoreDelayedClaims();
      return tasks;
    } catch (error) {
      this.handleError(error, { action: 'fetchTasks' });
      return [];
    }
  }

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
      this.startCountdownTask(task);
    }
  }

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
      }
      return saved;
    } catch (error) {
      this.handleError(error, { action: 'completeTask', taskId });
      return null;
    }
  }

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

  destroy() {
    this.timerManager.clearAll();
  }

  startCountdownTask(task) {
    const duration = task.config && task.config.durationSeconds ? task.config.durationSeconds : 0;
    const updated = this.store.updateTask(task.id, (current) => ({
      ...current,
      status: TASK_STATUS.IN_PROGRESS,
      progress: { remainingSeconds: duration, startedAt: now() },
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
}

module.exports = TaskSdk;
