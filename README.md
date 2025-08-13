# Spanish Tutor — Party Mode (Smart Boost)
- Up to 5 users, 100 messages/day each
- Server-side OpenAI key, masked from users
- Default model via `OPENAI_MODEL` (recommend `gpt-5-mini`)
- **Smart boost** toggle uses `OPENAI_MODEL_BOOST` (recommend `gpt-5`) per message
- Admin dashboard shows tokens & cost

## Env vars (Vercel → Project → Settings → Environment Variables)
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-5-mini
OPENAI_MODEL_BOOST=gpt-5
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
PARTY_CODE=RICK-SPANISH-01
PARTY_SEATS=5
DAILY_MSG_LIMIT=100
PARTY_JWT_SECRET=<random>
ADMIN_KEY=<secret>
GPT5_INPUT_PER_M=1.25
GPT5_OUTPUT_PER_M=10.00

## Deploy
1) Create Supabase project → run `schema.sql`
2) Upload this folder to GitHub
3) Create Vercel project → set env vars → Redeploy
4) Visit /join → then /conversation (try Smart boost)
