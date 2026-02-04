## Film Location Finder - PRD (MVP)

### Summary
Build a web app that lets someone enter a film title and timestamp and receive an estimated real-world filming location, plus a map pin and what3words. The estimate is supported by evidence, can be rated by peers, and improves with community contributions and reputation.

### Goals
- Fast lookup for film + timestamp.
- Evidence-backed location estimates that can be improved over time.
- Peer ratings and contributor reputation that elevate accuracy.
- Seed with 500 high-likelihood films to make day 1 useful.

### Non-goals (MVP)
- Frame-accurate shot segmentation.
- Official studio confirmation pipelines.
- Full scene-by-scene coverage for all films.

### Primary Users
- Casual film fans looking up a scene.
- Location hunters/tourists.
- Contributors who add and verify details.

### Core User Flows
1. Search film -> choose film.
2. Enter timestamp -> view location estimate + evidence.
3. Rate estimate -> optionally add evidence or propose a new location.
4. Earn reputation -> influence confidence and confirmations.

### MVP Features
- Film search with typeahead.
- Timestamp input (`HH:MM:SS`) + optional shot range.
- Estimated location card:
  - Map pin
  - what3words address
  - Confidence band (low/med/high)
  - Evidence summary
- Ratings:
  - Up/down accuracy
  - Comment
- Contributions:
  - Submit new estimate
  - Attach evidence and notes
- Reputation & confirmation:
  - Weighted votes
  - Confirmation threshold

### Evidence Types (MVP)
- Wikipedia notes / production info
- Publicly available scripts / transcripts
- Publicly available behind-the-scenes sources

### Reputation Model (Simple)
- New contributors start with neutral weight.
- If an estimate becomes "confirmed," its author gains reputation.
- If an estimate is consistently downvoted, weight decreases.
- Ratings are weighted by the rater's reputation.

### Confirmation Threshold (Simple)
- Minimum number of ratings.
- Minimum weighted accuracy score.
- Minimum number of independent contributors.

### Seed Strategy
- Start with 500 films using an Anglo/US-weighted Wikipedia pageview algorithm.
- Reserve 100 slots for consensus "greatest of all time" list.
- See `docs/seed-selection-algorithm.md`.

### Success Metrics
- % of searches that return an estimate
- Median time-to-first-estimate for new film
- % of estimates reaching "confirmed"
- Repeat contributor rate

### Risks & Mitigations
- Sparse data for niche films -> seed strategy + community contributions
- Low trust -> evidence requirements + visible reputation
- Overconfidence -> conservative confidence bands, explicit "estimated"
