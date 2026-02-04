## Deploy to Production (Render + Resend)

This guide assumes:
- You want an all-in-one host for the web app + database.
- You will use `wherewasitshot.co.uk` as the public domain.
- Email login uses Resend.

### 1) Create the production database
1. Create a Postgres database on Render.
2. Copy the database connection string into your Render service env as `DATABASE_URL`.
3. Run migrations using the Render shell or locally:

```bash
export DATABASE_URL="postgresql://..."
./scripts/db/migrate.sh
```

### 2) Create the web service
1. Create a new web service on Render from this repo.
2. Build command:
```
npm install && npm run build
```
3. Start command:
```
npm run start
```

### 3) Set production environment variables
Set these in Render:
- `APP_URL=https://wherewasitshot.co.uk`
- `DATABASE_URL=...`
- `NEXT_PUBLIC_MAPBOX_TOKEN=...`
- `WHAT3WORDS_API_KEY=...`
- `SESSION_SECRET=...`
- `RESEND_API_KEY=...`
- `EMAIL_FROM=Film Location Finder <no-reply@wherewasitshot.co.uk>`

### 4) Configure the domain
1. Add `wherewasitshot.co.uk` as a custom domain in Render.
2. Add the DNS records that Render provides at your domain registrar.

### 5) Set up Resend domain + DNS
1. Add a sending domain in Resend (recommend using a subdomain like `mail.wherewasitshot.co.uk`).
2. Add the SPF and DKIM records provided by Resend at your DNS host.
3. (Recommended) Add a DMARC record so email providers trust your domain.
4. Update `EMAIL_FROM` to use the verified domain/subdomain.

### 6) Validate
- Visit `https://wherewasitshot.co.uk`
- Request a login link and confirm it arrives.
- Submit a test estimate and a rating.
