class TaskRepository {
  constructor({ baseUrl, userId, activityId, fetch }) {
    this.baseUrl = baseUrl;
    this.userId = userId;
    this.activityId = activityId;
    this.fetch = fetch || globalThis.fetch;
  }

  async getTasks() {
    const url = `${this.baseUrl}/api/tasks`;
    const response = await this.fetch(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    const payload = await response.json();
    if (!response.ok || payload.code !== 0) {
      throw new Error('Failed to fetch tasks');
    }
    return payload.data || [];
  }

  async completeTask(taskId, type, extra) {
    const url = `${this.baseUrl}/api/tasks/complete`;
    const response = await this.fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId, type, extra, userId: this.userId, activityId: this.activityId }),
    });
    const payload = await response.json();
    if (!response.ok || payload.code !== 0) {
      throw new Error('Failed to complete task');
    }
    return payload.data;
  }

  async claimReward(taskId) {
    const url = `${this.baseUrl}/api/tasks/claim`;
    const response = await this.fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId, userId: this.userId, activityId: this.activityId }),
    });
    const payload = await response.json();
    if (!response.ok || payload.code !== 0) {
      throw new Error('Failed to claim reward');
    }
    return payload.data;
  }

  async reportProgress(taskId, progress) {
    const url = `${this.baseUrl}/api/tasks/progress`;
    const response = await this.fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId, progress, userId: this.userId, activityId: this.activityId }),
    });
    const payload = await response.json();
    if (!response.ok || payload.code !== 0) {
      throw new Error('Failed to report progress');
    }
    return payload.data;
  }
}

module.exports = TaskRepository;
