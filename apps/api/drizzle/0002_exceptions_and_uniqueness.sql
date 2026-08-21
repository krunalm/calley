-- Uniqueness that was previously only enforced in application code.
--
-- Both checks were read-then-insert, so two concurrent requests could pass them
-- and produce duplicates. Any duplicates an existing deployment already
-- accumulated have to go before the constraints can be created.
--
-- Categories are referenced by events and tasks under ON DELETE RESTRICT, so
-- the losing rows cannot simply be deleted: their references move to the
-- surviving row first. The oldest duplicate wins, since it is the one most
-- likely to already own the bulk of the items. Skipping referenced duplicates
-- instead would leave the pair in place and abort the CREATE UNIQUE INDEX below.

CREATE TEMPORARY TABLE "duplicate_categories" ON COMMIT DROP AS
SELECT
  a."id"    AS "losing_id",
  keeper."id" AS "winning_id"
FROM "calendar_categories" a
JOIN LATERAL (
  SELECT b."id"
  FROM "calendar_categories" b
  WHERE b."user_id" = a."user_id"
    AND b."name" = a."name"
  ORDER BY b."created_at", b."id"
  LIMIT 1
) keeper ON TRUE
WHERE keeper."id" <> a."id";
--> statement-breakpoint
UPDATE "events" e
SET "category_id" = d."winning_id"
FROM "duplicate_categories" d
WHERE e."category_id" = d."losing_id";
--> statement-breakpoint
UPDATE "tasks" t
SET "category_id" = d."winning_id"
FROM "duplicate_categories" d
WHERE t."category_id" = d."losing_id";
--> statement-breakpoint
DELETE FROM "calendar_categories" c
USING "duplicate_categories" d
WHERE c."id" = d."losing_id";
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
