import assert from "node:assert/strict";
import test from "node:test";
import { inProgressCount, sortTodoTasks, statusTone } from "./task-view.ts";

const now = 1_800_000_000;
const task = (id, dueAt, status = "in_progress", placement = "todo", networkId = "a") =>
  ({ id, dueAt, status, placement, networkId, createdAt: `2026-11-04 ${id}` });

test("todo order follows overdue, upcoming, undated, then completed", () => {
  const rows = [
    task("undated", null), task("future", now + 3600),
    task("done", now - 3600, "completed"), task("overdue", now - 3600),
    task("due-now", now), task("archived", now - 7200, "completed", "archive"),
  ];
  assert.deepEqual(sortTodoTasks(rows, now).map(({ id }) => id),
    ["overdue", "due-now", "future", "undated", "done"]);
  assert.equal(statusTone(rows[3], now), "overdue");
  assert.equal(statusTone(rows[4], now), "overdue");
  assert.equal(statusTone(rows[0], now), "upcoming");
  assert.equal(statusTone(rows[2], now), "completed");
});

test("network counts exclude completed and archived tasks", () => {
  const rows = [task("one", null), task("two", null, "completed"),
    task("three", null, "in_progress", "archive"), task("four", null, "in_progress", "todo", "b")];
  assert.equal(inProgressCount(rows, "a"), 1);
  assert.equal(inProgressCount(rows, "b"), 1);
});
