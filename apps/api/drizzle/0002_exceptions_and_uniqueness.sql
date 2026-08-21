-- Uniqueness that was previously only enforced in application code.
--
-- Both checks were read-then-insert, so two concurrent requests could pass
-- them and produce duplicates. Any duplicates an existing deployment already
-- accumulated have to go before the constraints can be created, so each index
-- is preceded by a collapse of the rows it would reject: the oldest row wins
-- for categories (it owns the items that reference it), the newest for push
-- subscriptions (it carries the freshest keys).

DELETE FROM "calendar_categories" a
USING "calendar_categories" b
WHERE a."user_id" = b."user_id"
  AND a."name" = b."name"
  AND (a."created_at", a."id") > (b."created_at", b."id")
  AND NOT EXISTS (SELECT 1 FROM "events" e WHERE e."category_id" = a."id")
  AND NOT EXISTS (SELECT 1 FROM "tasks" t WHERE t."category_id" = a."id");
--> statement-breakpoint
CREATE UNIQUE INDEX "idx_categories_user_name" ON "calendar_categories" USING btree ("user_id","name");--> statement-breakpoint
DELETE FROM "user_push_subscriptions" a
USING "user_push_subscriptions" b
WHERE a."user_id" = b."user_id"
  AND a."endpoint" = b."endpoint"
  AND (a."created_at", a."id") < (b."created_at", b."id");
--> statement-breakpoint
CREATE INDEX "idx_push_subs_user" ON "user_push_subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_push_subs_user_endpoint" ON "user_push_subscriptions" USING btree ("user_id","endpoint");
