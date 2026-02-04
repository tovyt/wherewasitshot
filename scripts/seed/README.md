## Seed List Builder

Builds the 500-film seed list:
- 100 reserved for "greatest of all time" consensus lists
- 400 most-likely searched (based on English Wikipedia pageviews)

### Setup
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r scripts/seed/requirements.txt
```

### Run
```bash
python scripts/seed/build_seed_list.py --save-cache
```

### Output
- `data/seed/output/seed_500.json`
- `data/seed/output/seed_500.csv`

### Import into Postgres
```bash
python scripts/seed/import_seed_list.py
```

### Notes
- The script uses Wikimedia APIs and can be rate-limited. Use `--sleep` to slow requests.
- Provide a meaningful `--user-agent` for production runs.
- Optional US weighting file: `--us-weight-file path/to/weights.csv`
  - CSV format: `title,weight` (weight should be normalized 0–1).
