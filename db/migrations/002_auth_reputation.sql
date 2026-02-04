ALTER TABLE estimates
  ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;

ALTER TABLE estimate_ratings
  ADD COLUMN IF NOT EXISTS weight NUMERIC NOT NULL DEFAULT 1;

CREATE UNIQUE INDEX IF NOT EXISTS estimate_ratings_unique
  ON estimate_ratings (estimate_id, user_id)
  WHERE user_id IS NOT NULL;
