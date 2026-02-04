CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'estimate_confidence') THEN
    CREATE TYPE estimate_confidence AS ENUM ('low', 'medium', 'high');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'estimate_status') THEN
    CREATE TYPE estimate_status AS ENUM ('estimated', 'confirmed', 'rejected');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS films (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  wikipedia_title TEXT,
  wikidata_id TEXT,
  release_year INTEGER,
  seed_segment TEXT,
  goat_score INTEGER,
  search_score NUMERIC,
  pageviews_12m BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS films_wikidata_id_key
  ON films (wikidata_id)
  WHERE wikidata_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS films_title_trgm
  ON films
  USING gin (title gin_trgm_ops);

CREATE INDEX IF NOT EXISTS films_wikipedia_title_trgm
  ON films
  USING gin (wikipedia_title gin_trgm_ops);

CREATE TABLE IF NOT EXISTS shots (
  id BIGSERIAL PRIMARY KEY,
  film_id BIGINT NOT NULL REFERENCES films(id) ON DELETE CASCADE,
  timestamp_start INTEGER NOT NULL,
  timestamp_end INTEGER NOT NULL,
  label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT shots_timestamp_check CHECK (timestamp_start >= 0 AND timestamp_end >= timestamp_start)
);

CREATE INDEX IF NOT EXISTS shots_film_time_idx
  ON shots (film_id, timestamp_start, timestamp_end);

CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  handle TEXT NOT NULL UNIQUE,
  reputation NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS estimates (
  id BIGSERIAL PRIMARY KEY,
  shot_id BIGINT NOT NULL REFERENCES shots(id) ON DELETE CASCADE,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  location GEOGRAPHY(Point, 4326)
    GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography) STORED,
  w3w TEXT,
  confidence estimate_confidence NOT NULL DEFAULT 'low',
  status estimate_status NOT NULL DEFAULT 'estimated',
  score NUMERIC NOT NULL DEFAULT 0,
  created_by BIGINT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT estimates_lat_check CHECK (lat BETWEEN -90 AND 90),
  CONSTRAINT estimates_lng_check CHECK (lng BETWEEN -180 AND 180)
);

CREATE INDEX IF NOT EXISTS estimates_shot_idx
  ON estimates (shot_id);

CREATE INDEX IF NOT EXISTS estimates_location_gix
  ON estimates
  USING GIST (location);

CREATE TABLE IF NOT EXISTS estimate_evidence (
  id BIGSERIAL PRIMARY KEY,
  estimate_id BIGINT NOT NULL REFERENCES estimates(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL,
  source_url TEXT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS estimate_ratings (
  id BIGSERIAL PRIMARY KEY,
  estimate_id BIGINT NOT NULL REFERENCES estimates(id) ON DELETE CASCADE,
  user_id BIGINT REFERENCES users(id),
  score INTEGER NOT NULL,
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT estimate_ratings_score_check CHECK (score IN (-1, 1))
);
