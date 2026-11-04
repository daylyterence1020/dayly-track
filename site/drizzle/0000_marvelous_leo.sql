CREATE TABLE `network_people` (
	`owner_id` text NOT NULL,
	`network_id` text NOT NULL,
	`person_id` text NOT NULL,
	PRIMARY KEY(`owner_id`, `network_id`, `person_id`),
	FOREIGN KEY (`owner_id`,`network_id`) REFERENCES `networks`(`owner_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`owner_id`,`person_id`) REFERENCES `people`(`owner_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `network_people_owner_person` ON `network_people` (`owner_id`,`person_id`);--> statement-breakpoint
CREATE TABLE `networks` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "networks_name_nonempty" CHECK(length(trim("networks"."name")) > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `networks_owner_id_id` ON `networks` (`owner_id`,`id`);--> statement-breakpoint
CREATE INDEX `networks_owner_id` ON `networks` (`owner_id`);--> statement-breakpoint
CREATE TABLE `people` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "people_name_nonempty" CHECK(length(trim("people"."name")) > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `people_owner_id_id` ON `people` (`owner_id`,`id`);--> statement-breakpoint
CREATE INDEX `people_owner_id` ON `people` (`owner_id`);--> statement-breakpoint
CREATE TABLE `tasks` (
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
	FOREIGN KEY (`owner_id`,`network_id`) REFERENCES `networks`(`owner_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`owner_id`,`from_person_id`) REFERENCES `people`(`owner_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`owner_id`,`to_person_id`) REFERENCES `people`(`owner_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "tasks_title_nonempty" CHECK(length(trim("tasks"."title")) > 0),
	CONSTRAINT "tasks_due_whole_hour" CHECK("tasks"."due_at" IS NULL OR "tasks"."due_at" % 3600 = 0),
	CONSTRAINT "tasks_distinct_people" CHECK("tasks"."from_person_id" IS NULL OR "tasks"."to_person_id" IS NULL OR "tasks"."from_person_id" <> "tasks"."to_person_id"),
	CONSTRAINT "tasks_valid_status" CHECK("tasks"."status" IN ('in_progress', 'completed')),
	CONSTRAINT "tasks_valid_placement" CHECK("tasks"."placement" IN ('todo', 'archive'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tasks_owner_id_id` ON `tasks` (`owner_id`,`id`);--> statement-breakpoint
CREATE INDEX `tasks_owner_network_placement` ON `tasks` (`owner_id`,`network_id`,`placement`);--> statement-breakpoint
CREATE TABLE `user_settings` (
	`owner_id` text PRIMARY KEY NOT NULL,
	`default_network_id` text NOT NULL,
	FOREIGN KEY (`owner_id`,`default_network_id`) REFERENCES `networks`(`owner_id`,`id`) ON UPDATE no action ON DELETE no action
);
