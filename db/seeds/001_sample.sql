INSERT INTO films (title, wikipedia_title, wikidata_id, seed_segment)
SELECT v.title, v.wikipedia_title, v.wikidata_id, v.seed_segment
FROM (
  VALUES
    ('The Dark Knight', 'The Dark Knight', 'Q128559', 'sample'),
    ('La La Land', 'La La Land (film)', 'Q20876651', 'sample'),
    ('The Lord of the Rings: The Fellowship of the Ring', 'The Lord of the Rings: The Fellowship of the Ring', 'Q1713', 'sample')
) AS v(title, wikipedia_title, wikidata_id, seed_segment)
WHERE NOT EXISTS (
  SELECT 1 FROM films f WHERE f.wikidata_id = v.wikidata_id
);

INSERT INTO shots (film_id, timestamp_start, timestamp_end, label)
SELECT f.id, 1500, 1530, 'Sample shot'
FROM films f
WHERE f.title IN ('The Dark Knight', 'La La Land', 'The Lord of the Rings: The Fellowship of the Ring')
  AND NOT EXISTS (
    SELECT 1
    FROM shots s
    WHERE s.film_id = f.id
      AND s.timestamp_start = 1500
      AND s.timestamp_end = 1530
  );

INSERT INTO estimates (shot_id, lat, lng, w3w, confidence, status, score)
SELECT shots.id,
  CASE films.title
    WHEN 'The Dark Knight' THEN 41.8781
    WHEN 'La La Land' THEN 34.0522
    ELSE -38.6857
  END AS lat,
  CASE films.title
    WHEN 'The Dark Knight' THEN -87.6298
    WHEN 'La La Land' THEN -118.2437
    ELSE 176.0702
  END AS lng,
  CASE films.title
    WHEN 'The Dark Knight' THEN 'loom.farm.union'
    WHEN 'La La Land' THEN 'evening.fearful.drape'
    ELSE 'tunes.rockets.sharing'
  END AS w3w,
  'low',
  'estimated',
  0
FROM shots
JOIN films ON films.id = shots.film_id
WHERE shots.label = 'Sample shot'
  AND NOT EXISTS (
    SELECT 1 FROM estimates e WHERE e.shot_id = shots.id
  );

INSERT INTO estimate_evidence (estimate_id, source_type, source_url, note)
SELECT estimates.id, 'Wikipedia', 'https://en.wikipedia.org/wiki/' || replace(films.wikipedia_title, ' ', '_'),
  'Sample evidence entry.'
FROM estimates
JOIN shots ON shots.id = estimates.shot_id
JOIN films ON films.id = shots.film_id
WHERE NOT EXISTS (
  SELECT 1
  FROM estimate_evidence e
  WHERE e.estimate_id = estimates.id
);
