const RequestClient = require('./requestClient');

class TaskRepository {
  constructor({ baseUrl, userId, activityId, fetch }) {
    this.baseUrl = baseUrl;
    this.userId = userId;
    this.activityId = activityId;
    this.client = new RequestClient({ baseUrl, fetch });
  }

  async getTasks() {
    const { response, payload } = await this.client.get('/api/tasks');
    if (!response.ok || payload.code !== 0) {
      throw new Error('Failed to fetch tasks');
    }
    return payload.data || [];
  }

  async completeTask(taskId, type, extra) {
    const { response, payload } = await this.client.post('/api/tasks/complete', {
      body: { taskId, type, extra, userId: this.userId, activityId: this.activityId },
    });
    if (!response.ok || payload.code !== 0) {
      throw new Error('Failed to complete task');
    }
    return payload.data;
  }

  async claimReward(taskId) {
    const { response, payload } = await this.client.post('/api/tasks/claim', {
      body: { taskId, userId: this.userId, activityId: this.activityId },
    });
    if (!response.ok || payload.code !== 0) {
      throw new Error('Failed to claim reward');
    }
    return payload.data;
  }

  async reportProgress(taskId, progress) {
    const { response, payload } = await this.client.post('/api/tasks/progress', {
      body: { taskId, progress, userId: this.userId, activityId: this.activityId },
    });
    if (!response.ok || payload.code !== 0) {
      throw new Error('Failed to report progress');
    }
    return payload.data;
  }
}

module.exports = TaskRepository;
