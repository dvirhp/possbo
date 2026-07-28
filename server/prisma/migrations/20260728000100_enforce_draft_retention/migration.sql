DELETE FROM "posts"
WHERE "id" IN (
  SELECT "id"
  FROM (
    SELECT
      "id",
      ROW_NUMBER() OVER (
        PARTITION BY "user_id"
        ORDER BY "updated_at" DESC, "created_at" DESC, "id" DESC
      ) AS "draft_rank"
    FROM "posts"
    WHERE "status" = 'DRAFT'
  ) AS "ranked_drafts"
  WHERE "draft_rank" > 7
);
