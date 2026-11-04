import { sql } from "drizzle-orm";
import { check, foreignKey, index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const accounts = sqliteTable("accounts", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  deactivatedAt: integer("deactivated_at"),
  createdAt: integer("created_at").notNull(),
}, (table) => [
  uniqueIndex("accounts_active_email").on(table.email).where(sql`${table.deactivatedAt} IS NULL`),
]);

export const emailChallenges = sqliteTable("email_challenges", {
  email: text("email").notNull(),
  purpose: text("purpose").notNull(),
  accountId: text("account_id"),
  codeHash: text("code_hash").notNull(),
  salt: text("salt").notNull(),
  expiresAt: integer("expires_at").notNull(),
  nextSendAt: integer("next_send_at").notNull(),
  attempts: integer("attempts").notNull().default(0),
}, (table) => [primaryKey({ columns: [table.email, table.purpose] })]);

export const sessions = sqliteTable("sessions", {
  tokenHash: text("token_hash").primaryKey(),
  accountId: text("account_id").notNull().references(() => accounts.id),
  expiresAt: integer("expires_at").notNull(),
  revokedAt: integer("revoked_at"),
}, (table) => [index("sessions_account_id").on(table.accountId)]);

export const authLimits = sqliteTable("auth_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  resetAt: integer("reset_at").notNull(),
});

// Owner references and composite keys keep every relationship inside one account.
export const networks = sqliteTable("networks", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull().references(() => accounts.id),
  name: text("name").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("networks_owner_id_id").on(table.ownerId, table.id),
  index("networks_owner_id").on(table.ownerId),
  check("networks_name_nonempty", sql`length(trim(${table.name})) > 0`),
]);

export const people = sqliteTable("people", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull().references(() => accounts.id),
  name: text("name").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("people_owner_id_id").on(table.ownerId, table.id),
  index("people_owner_id").on(table.ownerId),
  check("people_name_nonempty", sql`length(trim(${table.name})) > 0`),
]);

export const networkPeople = sqliteTable("network_people", {
  ownerId: text("owner_id").notNull().references(() => accounts.id),
  networkId: text("network_id").notNull(),
  personId: text("person_id").notNull(),
}, (table) => [
  primaryKey({ columns: [table.ownerId, table.networkId, table.personId] }),
  foreignKey({ columns: [table.ownerId, table.networkId], foreignColumns: [networks.ownerId, networks.id] }),
  foreignKey({ columns: [table.ownerId, table.personId], foreignColumns: [people.ownerId, people.id] }),
  index("network_people_owner_person").on(table.ownerId, table.personId),
]);

export const tasks = sqliteTable("tasks", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull().references(() => accounts.id),
  networkId: text("network_id").notNull(),
  title: text("title").notNull(),
  // Unix seconds; a Hong Kong local whole hour is divisible by 3600.
  dueAt: integer("due_at"),
  fromPersonId: text("from_person_id"),
  toPersonId: text("to_person_id"),
  status: text("status", { enum: ["in_progress", "completed"] }).notNull().default("in_progress"),
  placement: text("placement", { enum: ["todo", "archive"] }).notNull().default("todo"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  version: integer("version").notNull().default(1),
}, (table) => [
  uniqueIndex("tasks_owner_id_id").on(table.ownerId, table.id),
  index("tasks_owner_network_placement").on(table.ownerId, table.networkId, table.placement),
  foreignKey({ columns: [table.ownerId, table.networkId], foreignColumns: [networks.ownerId, networks.id] }),
  foreignKey({ columns: [table.ownerId, table.fromPersonId], foreignColumns: [people.ownerId, people.id] }),
  foreignKey({ columns: [table.ownerId, table.toPersonId], foreignColumns: [people.ownerId, people.id] }),
  check("tasks_title_nonempty", sql`length(trim(${table.title})) > 0`),
  check("tasks_due_whole_hour", sql`${table.dueAt} IS NULL OR ${table.dueAt} % 3600 = 0`),
  check("tasks_distinct_people", sql`${table.fromPersonId} IS NULL OR ${table.toPersonId} IS NULL OR ${table.fromPersonId} <> ${table.toPersonId}`),
  check("tasks_valid_status", sql`${table.status} IN ('in_progress', 'completed')`),
  check("tasks_valid_placement", sql`${table.placement} IN ('todo', 'archive')`),
]);

export const userSettings = sqliteTable("user_settings", {
  ownerId: text("owner_id").primaryKey().references(() => accounts.id),
  defaultNetworkId: text("default_network_id").notNull(),
}, (table) => [
  foreignKey({ columns: [table.ownerId, table.defaultNetworkId], foreignColumns: [networks.ownerId, networks.id] }),
]);
