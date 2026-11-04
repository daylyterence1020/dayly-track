PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_network_people` (
	`owner_id` text NOT NULL,
	`network_id` text NOT NULL,
	`person_id` text NOT NULL,
	PRIMARY KEY(`owner_id`, `network_id`, `person_id`),
	FOREIGN KEY (`owner_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`owner_id`,`network_id`) REFERENCES `networks`(`owner_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`owner_id`,`person_id`) REFERENCES `people`(`owner_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_network_people`("owner_id", "network_id", "person_id") SELECT "owner_id", "network_id", "person_id" FROM `network_people`;--> statement-breakpoint
DROP TABLE `network_people`;--> statement-breakpoint
ALTER TABLE `__new_network_people` RENAME TO `network_people`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `network_people_owner_person` ON `network_people` (`owner_id`,`person_id`);--> statement-breakpoint
CREATE TABLE `__new_networks` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "networks_name_nonempty" CHECK(length(trim("__new_networks"."name")) > 0)
);
--> statement-breakpoint
INSERT INTO `__new_networks`("id", "owner_id", "name", "created_at") SELECT "id", "owner_id", "name", "created_at" FROM `networks`;--> statement-breakpoint
DROP TABLE `networks`;--> statement-breakpoint
ALTER TABLE `__new_networks` RENAME TO `networks`;--> statement-breakpoint
CREATE UNIQUE INDEX `networks_owner_id_id` ON `networks` (`owner_id`,`id`);--> statement-breakpoint
CREATE INDEX `networks_owner_id` ON `networks` (`owner_id`);--> statement-breakpoint
CREATE TABLE `__new_people` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "people_name_nonempty" CHECK(length(trim("__new_people"."name")) > 0)
);
--> statement-breakpoint
INSERT INTO `__new_people`("id", "owner_id", "name", "created_at") SELECT "id", "owner_id", "name", "created_at" FROM `people`;--> statement-breakpoint
DROP TABLE `people`;--> statement-breakpoint
ALTER TABLE `__new_people` RENAME TO `people`;--> statement-breakpoint
CREATE UNIQUE INDEX `people_owner_id_id` ON `people` (`owner_id`,`id`);--> statement-breakpoint
CREATE INDEX `people_owner_id` ON `people` (`owner_id`);--> statement-breakpoint
CREATE TABLE `__new_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`network_id` text NOT NULL,
	`title` text NOT NULL,
	`due_at` integer,
	`from_person_id` text,
	`to_person_id` text,
	`status` text DEFAULT 'in_progress' NOT NULL,
	`placement` text DEFAULT 'todo' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`owner_id`,`network_id`) REFERENCES `networks`(`owner_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`owner_id`,`from_person_id`) REFERENCES `people`(`owner_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`owner_id`,`to_person_id`) REFERENCES `people`(`owner_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "tasks_title_nonempty" CHECK(length(trim("__new_tasks"."title")) > 0),
	CONSTRAINT "tasks_due_whole_hour" CHECK("__new_tasks"."due_at" IS NULL OR "__new_tasks"."due_at" % 3600 = 0),
	CONSTRAINT "tasks_distinct_people" CHECK("__new_tasks"."from_person_id" IS NULL OR "__new_tasks"."to_person_id" IS NULL OR "__new_tasks"."from_person_id" <> "__new_tasks"."to_person_id"),
	CONSTRAINT "tasks_valid_status" CHECK("__new_tasks"."status" IN ('in_progress', 'completed')),
	CONSTRAINT "tasks_valid_placement" CHECK("__new_tasks"."placement" IN ('todo', 'archive'))
);
--> statement-breakpoint
INSERT INTO `__new_tasks`("id", "owner_id", "network_id", "title", "due_at", "from_person_id", "to_person_id", "status", "placement", "created_at", "updated_at", "version") SELECT "id", "owner_id", "network_id", "title", "due_at", "from_person_id", "to_person_id", "status", "placement", "created_at", "updated_at", "version" FROM `tasks`;--> statement-breakpoint
DROP TABLE `tasks`;--> statement-breakpoint
ALTER TABLE `__new_tasks` RENAME TO `tasks`;--> statement-breakpoint
CREATE UNIQUE INDEX `tasks_owner_id_id` ON `tasks` (`owner_id`,`id`);--> statement-breakpoint
CREATE INDEX `tasks_owner_network_placement` ON `tasks` (`owner_id`,`network_id`,`placement`);--> statement-breakpoint
CREATE TABLE `__new_user_settings` (
	`owner_id` text PRIMARY KEY NOT NULL,
	`default_network_id` text NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`owner_id`,`default_network_id`) REFERENCES `networks`(`owner_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_user_settings`("owner_id", "default_network_id") SELECT "owner_id", "default_network_id" FROM `user_settings`;--> statement-breakpoint
DROP TABLE `user_settings`;--> statement-breakpoint
ALTER TABLE `__new_user_settings` RENAME TO `user_settings`;