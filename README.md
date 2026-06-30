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
- **Notion** — API key authentication

### Workflow Automation
- Visual workflow canvas built on [@xyflow/react](https://reactflow.dev/)
- Workflows are stored as graphs (nodes + edges) in PostgreSQL

**Available workflow nodes:**
| Node | Description |
|---|---|
| Webhook Trigger | Starts a workflow from an inbound HTTP webhook |
| Find Location Images | Finds reusable location photos via OpenStreetMap + Wikimedia Commons |
| Rank Images | Uses OpenAI GPT-4 Vision to score and filter images |
| Manual Review | Pauses the run for a human to select an option |
| Render Template | Fills template placeholders and renders a PNG |

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
DATABASE_URL_UNPOOLED=postgresql://user:password@host:5432/dbname

# Auth
ADMIN_PASSWORD=your-admin-password
SESSION_SECRET=a-long-random-secret-string

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

# OpenAI (for Rank Images node)
OPENAI_API_KEY=
```

Only `DATABASE_URL`, `ADMIN_PASSWORD`, and `SESSION_SECRET` are required to run the core app. The other variables are needed only for the specific integrations they power.

### Find Location Images setup

The Find Location Images node uses OpenStreetMap Nominatim to geocode the location query, then searches nearby geotagged Wikimedia Commons photos. It does not require a Google Maps key.

In the workflow editor, capture a webhook sample first, select only the fields you want to expose downstream, then insert those selected fields into the node's Location query. For example, combine a city, country, venue name, or street address instead of wiring the entire webhook body. Returned candidates include source, author, license, and attribution URLs where Wikimedia provides them.

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
