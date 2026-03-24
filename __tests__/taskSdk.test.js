const TaskSdk = require('../src/index');

const createFetchMock = (handlers) =>
  jest.fn((url, options = {}) => {
    const key = `${options.method || 'GET'} ${url}`;
    const handler = handlers[key];
    if (!handler) {
      return Promise.reject(new Error(`Unhandled request: ${key}`));
    }
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve(handler(options)),
    });
  });

describe('TaskSdk', () => {
  test('fetchTasks returns tasks and triggers callback', async () => {
    const tasks = [
      {
        id: 't1',
        type: 'browse_jump_countdown',
        status: 'available',
        reward: { points: 10 },
        config: { durationSeconds: 3 },
      },
      {
        id: 't2',
        type: 'diversion_order',
        status: 'available',
        reward: { points: 20 },
        config: {},
      },
    ];

    const fetchMock = createFetchMock({
      'GET https://api.example.com/api/tasks': () => ({ code: 0, data: tasks }),
    });

    const onTasksUpdated = jest.fn();
    const sdk = new TaskSdk({
      baseUrl: 'https://api.example.com',
      activityId: 'a1',
      userId: 'u1',
      fetch: fetchMock,
      callbacks: { onTasksUpdated },
    });

    const result = await sdk.fetchTasks();

    expect(result).toEqual(tasks);
    expect(onTasksUpdated).toHaveBeenCalledWith(tasks);
  });

  test('browse countdown completes and calls complete API', async () => {
    jest.useFakeTimers();

    const task = {
      id: 't1',
      type: 'browse_jump_countdown',
      status: 'available',
      reward: { points: 10 },
      config: { durationSeconds: 3 },
    };

    const fetchMock = createFetchMock({
      'GET https://api.example.com/api/tasks': () => ({ code: 0, data: [task] }),
      'POST https://api.example.com/api/tasks/complete': () => ({
        code: 0,
        data: { ...task, status: 'completed' },
      }),
    });

    const onTaskStatusChanged = jest.fn();
    const onCountdownTick = jest.fn();
    const sdk = new TaskSdk({
      baseUrl: 'https://api.example.com',
      activityId: 'a1',
      userId: 'u1',
      fetch: fetchMock,
      callbacks: { onTaskStatusChanged, onCountdownTick },
    });

    await sdk.fetchTasks();
    sdk.startTask('t1');

    jest.advanceTimersByTime(3000);

    expect(onCountdownTick).toHaveBeenCalled();
    expect(onTaskStatusChanged).toHaveBeenCalledWith(
      expect.objectContaining({ id: 't1', status: 'completed' })
    );

    jest.useRealTimers();
  });

  test('delayed claim becomes claimable after delay', async () => {
    jest.useFakeTimers();

    const task = {
      id: 't3',
      type: 'delayed_claim',
      status: 'available',
      reward: { points: 30 },
      config: { claimDelaySeconds: 3 },
    };

    const fetchMock = createFetchMock({
      'GET https://api.example.com/api/tasks': () => ({ code: 0, data: [task] }),
    });

    const onTaskStatusChanged = jest.fn();
    const sdk = new TaskSdk({
      baseUrl: 'https://api.example.com',
      activityId: 'a1',
      userId: 'u1',
      fetch: fetchMock,
      callbacks: { onTaskStatusChanged },
    });

    await sdk.fetchTasks();
    sdk.startTask('t3');

    jest.advanceTimersByTime(3000);

    expect(onTaskStatusChanged).toHaveBeenCalledWith(
      expect.objectContaining({ id: 't3', status: 'claimable' })
    );

    jest.useRealTimers();
  });
});
