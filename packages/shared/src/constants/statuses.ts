export const TASK_STATUSES = ['todo', 'in_progress', 'done'] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

export const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: 'To Do',
  in_progress: 'In Progress',
  done: 'Done',
};

export const VISIBILITY_OPTIONS = ['public', 'private'] as const;

export type VisibilityOption = (typeof VISIBILITY_OPTIONS)[number];

export const VISIBILITY_LABELS: Record<VisibilityOption, string> = {
  public: 'Public',
  private: 'Private',
};
