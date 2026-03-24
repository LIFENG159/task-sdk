const TASK_TYPES = {
  BROWSE_JUMP_COUNTDOWN: 'browse_jump_countdown',
  BUBBLE_SCROLL_COUNTDOWN: 'bubble_scroll_countdown',
  DIVERSION_ORDER: 'diversion_order',
  DELAYED_CLAIM: 'delayed_claim',
};

const TASK_STATUS = {
  LOCKED: 'locked',
  AVAILABLE: 'available',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  CLAIMABLE: 'claimable',
  CLAIMED: 'claimed',
};

module.exports = { TASK_TYPES, TASK_STATUS };
