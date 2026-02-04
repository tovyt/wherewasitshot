## Database Setup (Postgres + PostGIS)

### Option A: Docker (easiest)
```bash
docker compose up -d
```

Set your `.env.local`:
```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/film_locator
```

Run migrations:
```bash
./scripts/db/migrate.sh
```

Seed sample data:
```bash
psql "$DATABASE_URL" -f db/seeds/001_sample.sql
```

### Option B: Local Postgres
1. Install Postgres and PostGIS (via Homebrew or your package manager).
2. Create a database (example: `film_locator`).
3. Set `DATABASE_URL` in `.env.local`.
4. Run the same migration + seed commands above.

### Import the 500-film seed list
After you run the seed pipeline and generate `data/seed/output/seed_500.csv`:
```bash
python scripts/seed/import_seed_list.py
```
