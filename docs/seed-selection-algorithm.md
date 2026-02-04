## Seed Selection Algorithm (500 Films)

### Goal
Pick 500 films that are most likely to be searched at launch, with 100 reserved for a consensus "greatest of all time" list. The remaining 400 are ranked using Anglo/US-weighted Wikipedia signals.

### Data Sources (MVP)
- Wikipedia pageviews (English project, 12-month window).
- Optional US-weighting from Wikimedia country-level pageview datasets, if available for articles.
- Wikipedia list pages for "greatest of all time" consensus lists.

### Definitions
- `PV_12m`: 12-month sum of pageviews for a film's English Wikipedia article.
- `US_rank_hits`: Optional count of appearances in US country-level lists (if available).
- `GOAT_lists`: Predefined list pages used for the consensus set.

### Step 1: Reserve 100 "Greatest of All Time"
1. Select consensus lists (all from Wikipedia pages):
   - BFI Sight & Sound (latest critics list)
   - AFI 100 Years 100 Movies
   - IMDb Top 250
   - Letterboxd Top 250
   - They Shoot Pictures, Don't They? (TSPDT)
2. Extract ranked films from each list.
3. Score each film per list:
   - `list_points = max(0, 101 - rank)`
4. Total score = sum of `list_points` across lists.
5. Tie-breakers:
   - Higher number of lists appeared in
   - Higher best (lowest) rank
6. Take top 100 by total score and lock.

### Step 2: Rank Remaining 400 (Most Likely to Be Searched)
1. Candidate pool:
   - All films with an English Wikipedia article.
   - (Recommended) use Wikidata to identify films and their Wikipedia titles.
2. Compute `PV_12m` from the English Wikipedia pageviews API.
3. Compute `US_rank_hits` (optional):
   - If a country-level, per-article signal is available, count appearances in US lists.
   - If not available, set `US_rank_hits = 0` and rely on English-only pageviews.
4. Normalize:
   - `pv_norm = PV_12m / max(PV_12m)`
   - `us_norm = US_rank_hits / max(US_rank_hits)`
5. Weighted score:
   - If US signal available: `search_score = 0.75 * pv_norm + 0.25 * us_norm`
   - Otherwise: `search_score = pv_norm`
6. Select top 400 by `search_score`, excluding the reserved 100.

### Output
- Final list = 100 GOAT + 400 likely-search titles.
- Store: film title, canonical Wikipedia article, and seed score.

### Notes & Limitations
- Country-level pageview data is bucketed and thresholded for privacy, so treat US weighting as a coarse signal, not precise counts.
- Wikipedia pageview data is available from mid-2015 onward; older films are still eligible via their article pageviews.
- Confirm availability of a country-level, per-article signal before enabling US weighting.
