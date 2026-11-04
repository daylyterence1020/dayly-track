export type ViewTask = {
  id: string;
  status: "in_progress" | "completed";
  placement: "todo" | "archive";
  dueAt: number | null;
  createdAt: string;
};

export function statusTone(task: ViewTask, nowSeconds: number) {
  if (task.status === "completed") return "completed";
  return task.dueAt !== null && task.dueAt <= nowSeconds ? "overdue" : "upcoming";
}

export function sortTodoTasks<T extends ViewTask>(tasks: T[], nowSeconds: number): T[] {
  const rank = (task: T) => {
    if (task.status === "completed") return 3;
    if (task.dueAt === null) return 2;
    return task.dueAt <= nowSeconds ? 0 : 1;
  };
  return tasks.filter((task) => task.placement === "todo").sort((a, b) =>
    rank(a) - rank(b) ||
    (a.dueAt ?? Number.MAX_SAFE_INTEGER) - (b.dueAt ?? Number.MAX_SAFE_INTEGER) ||
    a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

export function inProgressCount<T extends ViewTask & { networkId: string }>(tasks: T[], networkId: string) {
  return tasks.filter((task) =>
    task.networkId === networkId &&
    task.placement === "todo" && task.status === "in_progress").length;
}
