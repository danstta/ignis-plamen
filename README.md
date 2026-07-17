# Ignis

**Ignis** is an open-source visual automation platform that combines design templating with workflow automation — think Canva and Zapier in one tool. Built for teams that need to generate dynamic, branded assets at scale.

> **Early Stage** — This project is under active development. APIs, features, and configuration may change between releases. Contributions welcome.

---

## Features

### Template Designer
- Canvas-based visual editor for creating design templates
- Supported elements: text, images, and shapes
- Text styling: fonts, colors, sizes, gradients, and auto-width chip mode
- Brand color and font integration across all templates
- Server-side PNG rendering via [Satori](https://github.com/vercel/satori)
- Code export (React/HTML generation)

### Brand Management
- Define reusable brand identities (colors, fonts, logos)
- Brand assets are available in every color picker and font selector across the editor

### Connections
- OAuth 2.0 integration framework for third-party services
- **Google Drive** — OAuth 2.0
- **OpenAI** — API key
- **Claude (Anthropic)** — API key
- **Azure AI Foundry** — endpoint + API key (per-deployment model names)
- **Notion** — internal integration token

### Workflow Automation
- Visual workflow canvas built on [@xyflow/react](https://reactflow.dev/)
- Workflows are stored as graphs (nodes + edges) in PostgreSQL

**Available workflow nodes:**
| Node | Description |
|---|---|
| Webhook | Starts the workflow when data is POSTed to its URL, exposing the request body, headers, and query to downstream nodes |
| Find Location Images | Searches free/open image sources for real, reusable photos near the location |
| Rank Images | Scores images with a vision model via an OpenAI or Azure AI Foundry connection (default model `gpt-4.1-mini`) and returns them sorted best-first |
| Categorize Images | Assigns each image to one of your categories with vision and preserves the category downstream |
| Select Images | Pauses so you can pick and order the images used by the next template render |
| LLM Prompt | Calls an AI model with a custom prompt and returns generated text |
| Manual Review | Chooses the final image — automatically (top-ranked) or by pausing for a human pick |
| Render Template | Fills a template's placeholders and renders the final PNG |
| Render Template Batch | Renders several template versions from an input image list and returns them as an array |
| Preview Design Image | Pauses so you can preview candidate images inside a selected design before locking one |
| Review Designs | Pauses the workflow so you can pick one generated design, then continues with that choice |
| Rehost Image | Copies an image from an expiring URL (e.g. a Notion file) into permanent storage so a later step can't break when the source link expires |
| Run Link | Outputs a link to the current workflow run so you can inspect progress and review paused steps |
| Router | Routes the workflow down one of several branches based on conditions over upstream data — the first matching branch wins, otherwise the Else branch runs |
| Update Notion Page | Updates selected Notion page properties from webhook or step data |
| Sync Link Hub | Upserts Link Hub project rows into Supabase from a Notion webhook payload |
| List Drive Images | Lists image files inside a Google Drive folder and its subfolders |
| Upload Drive Files | Uploads one or more files to a Google Drive folder from file URLs or upstream outputs |

### Background Job Execution
- Durable workflow execution via [Inngest](https://www.inngest.com/)
- Retries and memoization — completed steps are not re-run on retry
- Concurrency limiting (max 10 parallel runs)
- Live run status streaming in the dashboard

### Authentication
- Session-based auth with HMAC-signed JWT cookies (7-day TTL)
- Single shared admin password — suitable for private self-hosted deployments

---

## Tech Stack

- **Framework:** Next.js 16 (App Router, React 19)
- **Database:** PostgreSQL via [Drizzle ORM](https://orm.drizzle.team/)
- **Storage:** Vercel Blob for render/export outputs; Supabase Storage for the Assets library (both fall back to `./public/uploads` in development)
- **Job Queue:** Inngest
- **Rendering:** Satori
- **UI:** Tailwind CSS 4, shadcn/ui, Lucide icons, Zustand

## Dependencies

| Package | Version | Purpose |
|---|---|---|
| `next` | 16 | Framework (App Router, server components, API routes) |
| `react` / `react-dom` | 19 | UI rendering |
| `drizzle-orm` | 0.45 | Database ORM and query builder |
| `drizzle-kit` | 0.31 | Database migrations and schema management |
| `postgres` | — | PostgreSQL driver |
| `inngest` | — | Durable background job execution |
| `satori` | — | Server-side PNG rendering from JSX |
| `@xyflow/react` | — | Visual workflow canvas (nodes + edges) |
| `@vercel/blob` | — | File/asset storage |
| `zustand` | — | Client-side state management |
| `zod` | — | Schema validation |
| `tailwindcss` | 4 | Utility-first CSS framework |
| `@base-ui/react` | — | Headless UI primitives (shadcn/ui base) |
| `lucide-react` | — | Icon library |
| `react-moveable` | — | Drag, resize, and rotate elements on canvas |
| `react-selecto` | — | Multi-element selection on canvas |
| `react-infinite-viewer` | — | Canvas pan and zoom |
| `sonner` | — | Toast notifications |
| `next-themes` | — | Dark/light mode switching |
| `class-variance-authority` | — | Utility for composing Tailwind variants |

---

## Deploying

### Prerequisites

- Node.js 20+
- PostgreSQL database (local, [Neon](https://neon.tech/), [Supabase](https://supabase.com/), etc.)
- An [Inngest](https://www.inngest.com/) account (free tier available)

### Environment variables

Create a `.env.local` file in the project root:

```env
# Database
DATABASE_URL=postgresql://user:password@host:5432/dbname
# Direct (session-pooler / non-pooled) connection used by drizzle-kit migrations.
# Falls back to DATABASE_URL when unset — fine for direct Postgres, required on
# transaction poolers (Supabase port 6543, Neon pooled) where DDL must not run pooled.
DIRECT_URL=postgresql://user:password@host:5432/dbname

# Auth
ADMIN_PASSWORD=your-admin-password
SESSION_SECRET=a-long-random-secret-string

# Encrypts connection credentials (OAuth tokens, API keys) at rest in Postgres.
# Generate: bun -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
# Strongly recommended in production. Changing/losing it makes existing connections unreadable.
CONNECTIONS_ENCRYPTION_KEY=

# Public URL (used for OAuth redirects and webhooks)
PUBLIC_APP_URL=https://your-domain.com

# Storage (optional in dev — falls back to ./public/uploads)
# Vercel Blob backs render/export outputs; Supabase Storage backs the Assets library.
BLOB_READ_WRITE_TOKEN=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_ASSETS_BUCKET=assets

# Inngest (required in production)
INNGEST_EVENT_KEY=
INNGEST_SIGNING_KEY=

# Google OAuth (for Google Drive connection)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_DRIVE_REFRESH_TOKEN=

# OpenAI (for Rank Images node)
OPENAI_API_KEY=

# Pexels (optional, for polished Find Location Images results)
PEXELS_API_KEY=

# Google Maps Platform (optional, for exact Google Places photos in Find Location Images)
GOOGLE_MAPS_API_KEY=

# Link Hub Notion -> Supabase sync (server-only)
# Optional: set these when Link Hub writes to a different Supabase project than this app.
LINK_HUB_SUPABASE_URL=
LINK_HUB_SUPABASE_SERVICE_ROLE_KEY=
NOTION_LINK_HUB_TOKEN=
NOTION_LINK_HUB_DATA_SOURCE_ID=
NOTION_LINK_HUB_WEBHOOK_VERIFICATION_TOKEN=
# Notion property-name overrides for the Link Hub sync are listed in .env.example.

# Instagram-style Review Designs preview (optional testing feed)
# Comma- or newline-separated image URLs. When empty, mock grid posts are generated.
INSTAGRAM_PREVIEW_POST_URLS=
```

Only `DATABASE_URL`, `ADMIN_PASSWORD`, and `SESSION_SECRET` are required to run the core app. The other variables are needed only for the specific integrations they power.

Existing deployments enabling `CONNECTIONS_ENCRYPTION_KEY` should set the key and run `bun scripts/encrypt-connections.ts` once to seal rows stored before encryption; treat credentials stored before encryption was enabled as having been readable at rest — rotate them (reconnect OAuth accounts / reissue API keys) if the database or its backups may have been exposed.

### Find Location Images setup

The Find Location Images node uses OpenStreetMap Nominatim to geocode the location query, then searches image providers. Pexels is best for polished poster-style destination photos and requires `PEXELS_API_KEY`. Wikimedia Commons gives the most precise nearby geotagged search. Openverse adds a broader open-licensed image catalog, but quality varies. None of these require a Google Maps key.

In the workflow editor, capture a webhook sample first, select only the fields you want to expose downstream, then insert those selected fields into the node's Location query. For example, combine a city, country, venue name, or street address instead of wiring the entire webhook body. Returned candidates include source, author, license, and attribution URLs when the provider returns them.

### Review Designs grid preview

The Review Designs node can show an Instagram-style grid on the paused review screen without Instagram OAuth or Meta Graph API credentials. For layout testing, set `INSTAGRAM_PREVIEW_POST_URLS` to a comma- or newline-separated list of existing image URLs. If it is empty, Ignis generates mock grid tiles for the entered username.

### 1. Deploy to Vercel (recommended)

1. Import the repository in the [Vercel dashboard](https://vercel.com/new)
2. Add the environment variables listed above
3. Connect an Inngest project via the [Vercel integration](https://vercel.com/integrations/inngest) — this auto-sets `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY`
4. Run database migrations after first deploy (see below)

### 2. Self-hosted

```bash
# Clone the repo
git clone https://github.com/danstta/ignis.git
cd ignis

# Install dependencies
bun install

# Set up environment variables
cp .env.example .env.local
# Edit .env.local with your values

# Run database migrations
bun run db:migrate

# Start the development server
bun run dev
```

For production builds:

```bash
bun run build
bun run start
```

In a local development environment, start the Inngest dev server in a separate terminal to run workflows:

```bash
bunx inngest-cli@latest dev
```

### Database migrations

Run migrations against your database whenever you pull new changes:

```bash
bun run db:migrate
```

To inspect your database via a local GUI:

```bash
bun run db:studio
```

---

## Contributing

This project is in early development and the scope is intentionally narrow right now. If you have ideas, open an issue first before submitting a large pull request.

---

## License

MIT
