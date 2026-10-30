<p align="center">
  <img src="public/logos/zone2-black.png" alt="ZONE-2" width="360">
</p>
<p align="center"><strong>Two lenses, one story.</strong><br>Open-source local news that puts a regional broadcaster and a town newspaper side by side</p>
<p align="center"><a href="README.ko.md">한국어</a> · English</p>

# ZONE-2

ZONE-2 shows **how a regional broadcaster and a local weekly report the same story differently**, on one screen, and turns the public comments underneath into a structured, AI-assisted public forum.

- Built by the **MBC Chungbuk** (regional broadcaster) × **Okinews** (county weekly) consortium
- Supported by the Korea Press Foundation's 2026 digital media development program
- Live service: https://mbcok.com · License: [Apache License 2.0](LICENSE) ([NOTICE](NOTICE))

This repository is the whole product: the web app, the AI pipelines and prompts, the database schema, and the operations scripts. It is published so that any other pairing of a broadcaster and a local newspaper can stand up their own regional edition.

---

## What it does

| Feature | What happens |
|---|---|
| **CrossView** | Articles from the two outlets are paired by vector similarity plus LLM re-ranking, then shown as a two-line headline ("the regional outlet says ○○ / the local paper says ○○"), per-outlet summaries, one AI-written synthesis paragraph, and a four-page card story. Reviewers from both outlets confirm before publication (default; can be switched to publish on one confirmation). |
| **Opinion Thermometer** | Article comments and forum posts are grouped by issue. Every 15 minutes each issue gets a temperature from 0 to 100 (mention frequency, sentiment spread, topic concentration) and the top five are shown. Tapping an issue leads to the source articles. |
| **AI podcast ("Today in Chungbuk")** | Each morning a script is written from both outlets' articles (with a guaranteed local-news corner) and synthesized to speech. Reviewers from both outlets confirm before it goes out. Nothing AI-generated is published without a human confirmation. |
| **Forum** | Anonymous posts and comments without login (edit/delete by password), one photo, likes, grouping by issue. Bot protection is a signed arithmetic challenge plus a honeypot field, with a banned-word filter. |
| **Public notices** | Four county-government boards are collected and sorted by deadline. |
| **Admin** | Review queue (per-outlet confirmation status), content rollback, audit log, accounts and roles, and a metrics dashboard at `/admin/metrics`. |

The screens follow one visual grammar we call *Iljeom* ("one point"): paper-colored ground, ink type, 1 px rules, and nothing else. No cards, rounded corners, or shadows. Orange is reserved for play and deadlines, red for temperature. Every screen supports a large-type mode and a high-contrast mode.

## How it works

```
Ingest (hourly)   regional outlet · YouTube videos + comments · local paper · forum · county notices
   │  normalize → hash authors immediately → embed (pgvector)
   ▼
Match             top-N from the other outlet (cosine) → date/keyword filters → LLM re-rank → per-outlet summaries → card data
   │              a news item and its video with the same title count as one article; live streams and replays are skipped
   ▼
Temperature (15m) issue keywords → local articles → their comments + forum posts → sentiment → temperature and ranking
   ▼
Podcast (07:00)   material from CrossView pairs → local articles → regional articles → script → Korean copy-edit → TTS → review queue
   ▼
Review            confirmation by both outlets' accounts (CrossView, podcast; default) → publish → audit log and metrics
```

### The stack we actually run

One Mac mini, self-hosted. The only external dependencies are Supabase (self-hosted) and optional AI keys.

| Layer | Choice | Notes |
|---|---|---|
| App | Next.js 15 (App Router) · React 19 · TypeScript · Tailwind v4 | `pnpm build` output served by `next start` |
| Database | Supabase self-host (Postgres + pgvector + Realtime + Auth + Storage) | Docker, `supabase/migrations` |
| Scheduling | macOS launchd (`deploy/launchd/*.plist`) calling `/api/cron/*` with `CRON_SECRET` | ingest hourly · temperature every 15 min · podcast hourly (generated at 07:00 KST) · notices daily |
| Re-ranking, summaries, headlines, issue extraction | a subscription coding CLI (`LOCAL_AI_CLI=codex`) or the Claude API (`ANTHROPIC_API_KEY`) | prompts live in `lib/ai/*` |
| Embeddings | local model (`lib/ai/local-embed`) or OpenAI | |
| Sentiment | local KcELECTRA sidecar (`LOCAL_SENTIMENT=1`, Python) → CLI → Claude, in that fallback order | a comment-domain model |
| Speech | Gemini TTS (news-anchor tone) → OpenAI TTS → macOS `say`; MP3 via ffmpeg | copy-editing rules from [im-not-ai](https://github.com/epoko77-ai/im-not-ai) |
| Exposure | Cloudflare Tunnel (remotely managed) | WAF and cache are configured in the dashboard |

## Run it locally

You need Node 22+, pnpm 10, Docker, the Supabase CLI, and ffmpeg (podcast audio). Python 3 only if you use the local sentiment model.

```bash
pnpm install --frozen-lockfile
cp .env.example .env.local             # see the table below — the UI works without any AI key
supabase start                          # local Supabase (Docker)
supabase db reset                       # applies every migration + the synthetic seed (supabase/seed.sql)
                                        # ↑ fresh local database only. Never on a machine attached to a live database: it drops everything
pnpm dev                                # http://localhost:3000
```

`supabase db reset` loads a **synthetic seed** (fictional article pairs from two outlets, comments, issue temperatures, CrossViews, a podcast episode, forum posts, notices), so the home, CrossView, thermometer, podcast, forum, and notices pages are populated with no keys at all. For real data, point the two RSS/Atom feeds at your outlets with `RSS_MACRO_FEED_URL` (regional) and `RSS_MICRO_FEED_URL` (local) and the hourly ingest takes over. The **demo adapter** (synthetic articles, on by default when no feed is set) is switched off with `DEMO_ADAPTERS=0` once real collection is in place.

```bash
curl -X POST -H "Authorization: Bearer $CRON_SECRET" localhost:3000/api/cron/ingest
curl -X POST -H "Authorization: Bearer $CRON_SECRET" localhost:3000/api/cron/match
curl -X POST -H "Authorization: Bearer $CRON_SECRET" localhost:3000/api/cron/temperature
curl -X POST -H "Authorization: Bearer $CRON_SECRET" "localhost:3000/api/cron/podcast?force=1"
```

Admin accounts are created with a script (roles: administrator, regional-outlet reviewer, local-outlet reviewer).

```bash
pnpm tsx scripts/ops/create-admin-user.ts --email=you@example.org --role=super_admin --name=Name
```

### Environment variables (full list in `.env.example`)

| Group | Variables | Notes |
|---|---|---|
| Required | `NEXT_PUBLIC_SUPABASE_URL` `NEXT_PUBLIC_SUPABASE_ANON_KEY` `SUPABASE_SERVICE_ROLE_KEY` `CRON_SECRET` `INGEST_HASH_SALT` `FORUM_HASH_PEPPER` `VISIT_HASH_PEPPER` | salt/peppers: `openssl rand -hex 32`. In production a missing one stops that path |
| AI (at least one) | `LOCAL_AI_CLI` or `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GOOGLE_GENERATIVE_AI_API_KEY` | Without any, deterministic mock output is used. Using a subscription CLI (codex, claude) for server automation is subject to each provider's terms; API keys are recommended for production. |
| Ingest | `RSS_MACRO_FEED_URL` `RSS_MICRO_FEED_URL` (generic RSS/Atom, comma-separated for several) · `YOUTUBE_API_KEY` `MBC_YOUTUBE_CHANNEL_ID` · `DEMO_ADAPTERS` | Outlets without a feed get an adapter through the `lib/adapters/` interface |
| Operations | `PODCAST_AUTO_PUBLISH_HOUR` (default `off`) `LOCAL_SENTIMENT*` `TTS_PROVIDER` | |

## Operating it (self-host)

`docs/deploy/mac-runbook.md` walks through installation, cron, and the tunnel (in Korean). In short:

- launchd keeps `next start` running; a deploy is `git pull → pnpm build → launchctl kickstart -k`.
- launchd hits `/api/cron/*` with `curl` hourly or every 15 minutes. Time-of-day decisions are made in KST on the server, independent of the machine's time zone.
- Silent failures accumulate in `system_alerts` and surface at the top of the admin dashboard (re-rank failures, sentiment path anomalies, missing podcast episodes, items waiting on review).
- The metrics (matching precision, ingest success, thermometer uptime, podcast publication rate, return visits, review approval rate) are computed by the same functions in `/admin/metrics` and `pnpm report:stage1`.

## Privacy and rights

> **Publishing this repository grants no right to collect or use the articles, comments, or photos of MBC Chungbuk or Okinews.** The collectors for those two outlets are used only by the consortium and are not included here (empty stubs stand in their place). Another regional edition must implement its own adapters through the `lib/adapters/` interface, with its own outlets' permission.

- Comment and post authors are hashed with SHA-256 at ingest time; originals are never stored. Forum IPs are stored only as hashes.
- Visit statistics store one row per browser per day: a random browser ID hashed again on the server, plus the date, deleted after 180 days. There are no third-party analytics and no cookie banner.
- Article text belongs to each outlet. CrossView speaks its summaries and comparisons in ZONE-2's own editorial voice and preserves the original title, link, and publication date.
- The names and logos of "MBC Chungbuk" and "Okinews" are their trademarks and are not covered by this license. Replace them with your own marks when you fork (see `NOTICE`).

## Repository map

```
config/         one file of regional settings (region.ts): outlet names, place names, corner names, logos, funder credit
app/            pages and API routes (/api/cron/*, /api/admin/*, public API)
components/     UI (CrossView, thermometer, podcast, forum, admin, home deck)
lib/            domain logic: ai (prompts, model calls) · matching · temperature · podcast · forum · metrics · ingest
supabase/       migrations (schema, RLS, RPC) and the synthetic seed
scripts/        verify · ops · report · scrape · sentiment sidecar — scripts/README.md
deploy/         launchd definitions (server, tunnel, cron) — deploy/README.md
docs/           design documents (features, metrics, data model, API spec, ops runbook; Korean)
docs-site/      end-user guide (VitePress)
THIRD_PARTY_NOTICES.md · sbom.cdx.json   third-party notices · dependency inventory (CycloneDX)
```

## Running it for your region

1. Edit **`config/region.ts`**: outlet names, place names, corner names, official sites, logos, funder credit ([config/README.md](config/README.md)). Screens, scripts, prompts, metadata, and RSS all follow.
2. Put your two outlets' RSS/Atom URLs in `RSS_MACRO_FEED_URL` / `RSS_MICRO_FEED_URL`. If an outlet has no feed, implement the `lib/adapters/` interface (`fetchArticles`, `fetchComments`) and register it in `registry.ts`.
3. Drop your logos into `public/logos/` and replace the outlet names in `NOTICE`.
4. Create reviewer accounts for both outlet roles. The confirmation rule (`docs/06-API명세.md` §4.1) defaults to both outlets confirming (`REQUIRED_CONFIRMATIONS=2`); set it to 1 to publish on a single confirmation.

The product copy, prompts, and copy-editing rules are in Korean. Translating the UI strings is straightforward; the Korean-specific rules (national-politics vocabulary, anchor-script markers) live in `lib/podcast/regional.ts` and would need an equivalent for another language.

## Contributing

- [CONTRIBUTING.md](CONTRIBUTING.md) · [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) · security reports: [SECURITY.md](SECURITY.md)
- Third-party licenses: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) · SBOM: [sbom.cdx.json](sbom.cdx.json)
