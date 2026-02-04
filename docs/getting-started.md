## Getting Started (Newbie-Friendly)

This guide assumes you are starting from scratch on a new machine.

### 1) Install prerequisites
You will need:
- **Node.js** (LTS version)
- **Git**

If you are not sure, install the latest LTS from nodejs.org.

### 2) Install dependencies
```bash
npm install
```

### 3) Create your environment file
Copy `.env.example` to `.env.local` and add your API keys.
You need:
- `NEXT_PUBLIC_MAPBOX_TOKEN` for map previews
- `WHAT3WORDS_API_KEY` for what3words conversion
- `SESSION_SECRET` for signing login cookies
- `APP_URL` for generating login links
- `RESEND_API_KEY` and `EMAIL_FROM` for sending email login links

If you do not have a Resend account, sign up and create an API key first.
Use a verified domain or the default testing domain provided by Resend.

### 4) Set up the database
Follow `docs/db-setup.md` to start Postgres + PostGIS and run migrations.

### 5) Run the app
```bash
npm run dev
```

Then open `http://localhost:3000`.

Log in with your email to submit estimates and ratings (you’ll receive a magic link).
Open the email and click the link to finish login.
Visit `/profile` to see your contribution and reputation history.

### 6) (Optional) Build the seed list
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r scripts/seed/requirements.txt
python scripts/seed/build_seed_list.py --save-cache
```

The seed list will appear in `data/seed/output/`.

### 7) (Optional) Import the seed list into Postgres
```bash
python scripts/seed/import_seed_list.py
```
