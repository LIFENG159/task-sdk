class TaskStore {
  constructor() {
    this.tasks = [];
  }

  setTasks(tasks) {
    this.tasks = Array.isArray(tasks) ? tasks.slice() : [];
    return this.tasks;
  }

  getTasks() {
    return this.tasks.slice();
  }

  getTaskById(taskId) {
    return this.tasks.find((task) => task.id === taskId);
  }

  updateTask(taskId, updater) {
    const index = this.tasks.findIndex((task) => task.id === taskId);
    if (index === -1) {
      return null;
    }
    const current = this.tasks[index];
    const next = typeof updater === 'function' ? updater(current) : updater;
    this.tasks[index] = next;
    return next;
  }
}

module.exports = TaskStore;
