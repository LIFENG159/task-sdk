# Task SDK Technical Design

## Overview
This SDK is a standalone project that provides task fetching, progress timing, task completion, and reward claiming. It exposes callbacks to the host app and supports four task types:

- browse_jump_countdown: browse a jump page, countdown in that page
- bubble_scroll_countdown: bubble slide/scroll countdown in current page
- diversion_order: external order task
- delayed_claim: start countdown on entry, claim after 30 minutes without staying on page

The host app integrates via instance creation (e.g. `new TaskSdk(config)`), and the SDK manages all API calls and timers internally while emitting callbacks.

## Architecture

```mermaid
flowchart LR
  HostApp[Host App (rn-web)] -->|new TaskSdk(config)| SDK
  SDK -->|callbacks| HostApp

  subgraph SDK
    Public[TaskSdk Public API]
    Repo[TaskRepository]
    Store[TaskStore]
    Timer[TaskTimerManager]
    Types[TaskTypes]
    Util[TaskUtils]
  end

  Public --> Repo
  Public --> Store
  Public --> Timer
  Repo --> Backend[(Task APIs)]
  Timer --> Store
  Store --> Public
```

## Data Model

```ts
type TaskType =
  | 'browse_jump_countdown'
  | 'bubble_scroll_countdown'
  | 'diversion_order'
  | 'delayed_claim';

type TaskStatus =
  | 'locked'
  | 'available'
  | 'in_progress'
  | 'completed'
  | 'claimable'
  | 'claimed';

type TaskItem = {
  id: string;
  type: TaskType;
  title?: string;
  status: TaskStatus;
  reward: { points?: number; couponId?: string; label?: string };
  config: {
    durationSeconds?: number;
    claimDelaySeconds?: number;
    jumpUrl?: string;
    bubbleId?: string;
    orderChannel?: string;
  };
  progress?: { remainingSeconds?: number; startedAt?: number };
  meta?: Record<string, any>;
};

type SdkCallbacks = {
  onTasksUpdated?: (tasks: TaskItem[]) => void;
  onTaskStatusChanged?: (task: TaskItem) => void;
  onCountdownTick?: (taskId: string, remainingSeconds: number) => void;
  onRewardClaimed?: (taskId: string, reward: TaskItem['reward']) => void;
  onError?: (error: Error, context?: { action: string; taskId?: string }) => void;
};
```

## Public API

```ts
class TaskSdk {
  constructor(config: {
    baseUrl: string;
    activityId: string;
    userId: string;
    storage?: Storage;
    callbacks?: SdkCallbacks;
  })

  init(): Promise<void>
  fetchTasks(): Promise<TaskItem[]>
  startTask(taskId: string): void
  completeTask(taskId: string, extra?: Record<string, any>): Promise<TaskItem>
  claimReward(taskId: string): Promise<{ reward: TaskItem['reward']; task: TaskItem }>
  destroy(): void
}
```

## API Endpoints (placeholders)

- GET `/api/tasks`
  - Params: `{ userId, activityId }`
  - Response: `{ code, data: TaskItem[] }`
- POST `/api/tasks/complete`
  - Body: `{ taskId, type, extra? }`
  - Response: `{ code, data: TaskItem }`
- POST `/api/tasks/claim`
  - Body: `{ taskId }`
  - Response: `{ code, data: { reward, task } }`
- POST `/api/tasks/progress`
  - Body: `{ taskId, progress: { remainingSeconds } }`
  - Response: `{ code, data: { ok: true } }`

## Task Timing Rules

- browse_jump_countdown: starts timer when host calls `startTask`, completes on timeout, then calls complete API and callbacks.
- bubble_scroll_countdown: host calls `startTask` after user triggers the bubble scroll action.
- diversion_order: host calls `completeTask` when order is confirmed.
- delayed_claim: on `startTask`, store `startedAt` in persistent storage; timer restores on init and transitions to `claimable` when delay elapsed.

## Persistence

- Use configurable `storage` (defaults to `window.localStorage`) to persist:
  - startedAt per task for delayed_claim
  - remainingSeconds for countdown tasks (optional)

## Callbacks

- `onTasksUpdated`: after fetching tasks
- `onTaskStatusChanged`: on each status transition
- `onCountdownTick`: every 1s for active countdown tasks
- `onRewardClaimed`: after claim API success
- `onError`: on API or timer errors

## Code Changes Plan

### New SDK Project
Location: `/Users/lifeng/Desktop/study/h5page/task-sdk`

Add files:
- `src/core/taskSdk.js`
- `src/api/taskRepository.js`
- `src/features/taskTimerManager.js`
- `src/features/taskStore.js`
- `src/enums/taskTypes.js`
- `src/common/taskUtils.js`
- `src/common/storage.js`
- `src/components/callbacks.js`
- `src/index.js` (export TaskSdk)
- `package.json` (name: task-sdk, node >=14)
- `tsconfig.json` (checkJs typecheck)
- `CHANGELOG.md`

### rn-web Integration
Host uses instance creation:

```ts
import TaskSdk from 'task-sdk';
const sdk = new TaskSdk({ baseUrl, userId, activityId, callbacks });
```

Integration updates:
- `activity-rn-web/src/App.js` (use SDK instance)
- `activity-rn-web/src/App.test.js` (add SDK behavior tests)
