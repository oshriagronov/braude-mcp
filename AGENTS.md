# AGENTS.md — AI Agent Guide for Braude MCP

Welcome! This repository contains a remote, serverless [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server for **Ort Braude College of Engineering** (מכללת עזריאלי / אורט בראודה), deployed on **Cloudflare Workers**.

This guide is designed for AI coding assistants (e.g., Antigravity, Claude Code, Cursor, Windsurf, Codex, Gemini Spark) working on or maintaining this codebase.

---

## 🎯 Project Goal & Scope

- **Primary Goal**: Provide AI assistants with live, structured access to Ort Braude College's public academic data:
  1. **Academic Calendar**: Important academic dates, semester start/end dates, exam periods, registration windows, and holidays.
  2. **Course Search**: Querying the college course catalog by keyword, course code, or department name.
  3. **Course Schedules**: Detailed group slots, lecture/lab schedules, assigned professors, days, hours, and classrooms.
- **Query source**: Every MCP tool and resource **always serves scraped data from the database** (Cloudflare D1, or the bundled scraped seed if D1 has no row). **Never hardcoded dates, hours, instructors, credits, or syllabus text.** If nothing scraped is stored, return an error — do not invent a fallback.
- **Protocol**: Implements standard MCP (Model Context Protocol) over JSON-RPC 2.0 over HTTP POST (`/mcp`).
- **Platform**: Serverless Cloudflare Workers (V8 edge isolates).

---

## 🛠️ Technology Stack

| Layer | Technology | Description |
|---|---|---|
| **Runtime** | Cloudflare Workers | Serverless V8 edge isolate environment (`nodejs_compat` enabled) |
| **Web Server / Framework** | Hono (`hono` v4) | Lightweight, fast HTTP router for Workers |
| **Protocol Specification** | MCP SDK (`@modelcontextprotocol/sdk` v1.5) | Handles JSON-RPC 2.0 protocol schemas & RPC dispatching |
| **Parsing & Scraping** | Cheerio (`cheerio` v1) & Native `fetch` | Serverless HTML parsing of public college portals |
| **Validation** | Zod (`zod` v3) | Type-safe schema validation for tool input arguments |
| **Testing** | Vitest (`vitest` v2) | Unit and integration test runner |
| **Language** | TypeScript (v5.6) | Strict mode, target ES2022 |
| **Deployment** | Wrangler (`wrangler` v3) | Cloudflare CLI & build tool |

---

## 📁 Repository Structure & Directory Map

```text
braude-mcp/
├── .github/workflows/
│   └── deploy.yml              # CI/CD pipeline (typecheck, tests, wrangler deploy)
├── scripts/
│   └── refresh-seed.ts         # Rebuild src/data/db_seed.json from live latest-year scrape
├── src/
│   ├── index.ts                # Hono router (/mcp, /health, /sync), CORS, rate limit, cron
│   ├── data/
│   │   └── db_seed.json        # Bundled latest-year catalog + scraped schedules (seed fallback)
│   ├── db/
│   │   ├── client.ts           # D1 / seed queries; never returns generated timetable slots
│   │   └── schema.sql          # D1 tables: courses, course_groups, academic_calendar
│   ├── mcp/
│   │   ├── server.ts           # JSON-RPC 2.0 dispatcher (passes D1 into tool handlers)
│   │   ├── tools/
│   │   │   ├── calendar.ts     # get_academic_calendar
│   │   │   └── course.ts       # search_courses, get_course_schedule, get_course_syllabus
│   │   └── resources/
│   │       └── calendar.ts     # braude://calendar/current
│   ├── scrapers/
│   │   ├── calendar.ts         # w3.braude.ac.il academic calendar
│   │   ├── course_search.ts    # Catalog + S_YFineDate timetable parsers
│   │   ├── firefly.ts          # Cookie session + POST "מעבר שנה" (year is never hardcoded)
│   │   ├── syllabus_pdf.ts     # Fetch public syllabus PDFs and extract text
│   │   └── sync.ts             # Cron / POST /sync: scrape latest year into D1
│   ├── middleware/
│   │   └── rate_limit.ts       # Sliding window IP rate limiter (60 req/min/IP)
│   ├── utils/
│   │   └── cache.ts            # In-memory TTL cache
│   └── types/
│       └── index.ts            # Shared TypeScript interfaces
├── tests/
│   ├── unit/                   # Scraper, cache, DB, FireFly, rate-limit tests
│   └── integration/            # JSON-RPC /mcp HTTP POST integration & stress tests
├── package.json
├── wrangler.toml
├── tsconfig.json
├── vitest.config.ts
├── PROJECT.md
└── README.md
```

---

## ⚡ Inventory of Tools & Resources

### MCP Tools

1. **`get_academic_calendar`** ([src/mcp/tools/calendar.ts](src/mcp/tools/calendar.ts))
   - **Input**: `{ year?: string }` (e.g. `"2026-2027"`, or omit for current year)
   - **Output**: JSON containing semester dates, exam periods, registration dates, and holidays.
2. **`search_courses`** ([src/mcp/tools/course.ts](src/mcp/tools/course.ts))
   - **Input**: `{ query: string, department?: string }` (e.g. `{ "query": "אלגברה" }`)
   - **Output**: Array of course summary objects matching the query in the **latest academic year** catalog.
3. **`get_course_schedule`** ([src/mcp/tools/course.ts](src/mcp/tools/course.ts))
   - **Input**: `{ courseCode: string }` (e.g. `{ "courseCode": "61767" }` or `"62005"`)
   - **Output**: Site schedule (lectures/labs, instructors, days, hours, rooms, credits) plus ingested syllabus PDF (`syllabusText` and parsed `syllabus.attendance` / grading / topics). Empty `groups` if the portal has not published hours — **never invented times**.
4. **`get_course_syllabus`** ([src/mcp/tools/course.ts](src/mcp/tools/course.ts))
   - **Input**: `{ courseCode: string }` (e.g. `{ "courseCode": "61767" }`)
   - **Output**: Full ingested syllabus PDF plus parsed sections for attendance (חובת נוכחות), grading, exam, topics, objectives, and the site schedule. Never fetches the PDF at query time.

### MCP Resources

1. **`braude://calendar/current`** ([src/mcp/resources/calendar.ts](src/mcp/resources/calendar.ts))
   - **MIME Type**: `application/json`
   - **Output**: Immediate JSON object for active academic year calendar.

---

## 🔒 Security, Legal & Architecture Guardrails

When modifying or expanding this codebase, AI agents MUST strictly adhere to the following principles:

1. **Serverless Worker Isolates**:
   - Cloudflare Workers are stateless and short-lived.
   - Do NOT introduce persistent filesystem operations, long-lived background timers (`setInterval`), or Node.js native binary dependencies (`fs`, `child_process`).
2. **Universal Database Architecture (Zero Live Scraping on Queries)**:
   - The MCP **always serves from the database**. All tool calls (`get_academic_calendar`, `search_courses`, `get_course_schedule`, `get_course_syllabus`) and resources (`braude://calendar/current`) **query Cloudflare D1**, then the bundled scraped seed (`src/data/db_seed.json`) if D1 has no row. The seed is a scrape snapshot, not hardcoded content.
   - **Never serve hardcoded data** (calendar dates, hours, instructors, credits, syllabus text, or year labels). Do not keep baked-in event tables or placeholder generators in query handlers.
   - If nothing scraped is stored, return an error (`isError: true`). If a scrape fails, keep and serve the last successful D1/seed snapshot — never substitute invented data.
   - Pass `c.env.DB` through `handleMcpRequest` into the tool handlers. Do not call scrapers from tool handlers.
   - **No user query should ever make an outbound network call to Braude's servers during runtime.**
3. **Serve only scraped course data**:
   - Never generate placeholder instructors (`סגל המחלקה`, `מתרגל/ת הקורס`) or days from `courseCode % 5`.
   - `parseCourseScheduleHtml` / `parseTimetableHtml` must not default a missing weekday to Sunday (`א'`).
   - Do not invent credits (`3.0`) or syllabus PDF URLs from `new Date().getFullYear()`. Credits and פרשיית לימוד come from each course's FireFly detail page; PDF URLs use the FireFly year (`/info/{year}/{paddedCode}.pdf`).
   - If a course is in the catalog but has no published hours, return `groups: []`.
4. **Latest academic year is dynamic (never hardcoded)**:
   - Read the FireFly `ChangeYear` / `R1C39` dropdown and POST `PRGNAME=Enter_Search&ARGUMENTS=-A,,-A,ChangeYear`.
   - GET query-string year filters (`R1C39=2027`) are **ignored** by FireFly. Session cookies + POST are required.
   - Implementation: [src/scrapers/firefly.ts](src/scrapers/firefly.ts).
5. **Periodic Background Ingestion (Every 3 Days)**:
   - Cron (`0 0 */3 * *`) and `POST /sync` run [src/scrapers/sync.ts](src/scrapers/sync.ts): year switch, latest-year catalog (`S_LOOK_FOR_NOSE_AB`), weekly timetable (`S_YFineDate`), **full public syllabus PDFs**, and the **academic calendar** page, persist to D1.
   - Calendar scrape is independent of catalog scrape. If the calendar fetch fails, D1 keeps the last successful snapshot. MCP never serves hardcoded calendar dates. If nothing scraped is stored, tools return an error.
   - Syllabus PDFs are fetched from `https://info.braude.ac.il/info/{year}/{paddedCode}.pdf`, extracted in full to `syllabus_text`, and upserted into D1 during the same 3-day job as the catalog. Existing D1 PDF text is overlaid before replaceAll so a timeout cannot wipe syllabi.
   - After deploy, the owner triggers `POST /sync` with `Authorization: Bearer $SYNC_SECRET` (`wrangler secret put SYNC_SECRET`). Never ship an open `/sync`.
   - Rebuild timetable seed with `npm run refresh-seed`. Then `npm run enrich-seed` to scrape per-course credits (נקודות זכות), פרשיית לימוד, and syllabus PDF text (resumable locally).
   - MCP tools must not fetch PDFs at query time — they only read D1 / seed.
6. **Robots.txt & Public Access Only**:
   - Background scrapers MUST only access public URLs on `w3.braude.ac.il` and `info.braude.ac.il`.
   - Never attempt to bypass logins, scrape authenticated student portals, or access private data.
7. **Rate Limiting & Server Protection**:
   - Maintain the sliding window IP rate limiter in [src/middleware/rate_limit.ts](src/middleware/rate_limit.ts).
8. **JSON-RPC 2.0 / MCP Compliance**:
   - All `/mcp` POST responses must return valid JSON-RPC 2.0 objects with proper `id`, `result`, or `error` structures.
   - Tool execution results must use `{ content: [{ type: "text", text: JSON.stringify(...) }], isError?: boolean }`.

---

## ⚙️ Developer & Agent Workflows

### Environment Verification & Tests

Always run unit & integration tests after modifying any scrapers, handlers, or middleware:

```bash
# Run full test suite (unit + integration)
npm test

# Run tests in watch mode
npm run test:watch

# Validate TypeScript types without emitting code
npm run typecheck

# Verify wrangler build
npm run build

# Rebuild bundled seed from live FireFly latest year
npm run refresh-seed
```

### Development Server

Start a local Cloudflare Worker development server:
```bash
npm run dev
```
Local MCP endpoint: `http://127.0.0.1:8787/mcp`

### Deployment

Deploys to Cloudflare Workers using Wrangler:
```bash
npm run deploy
```
Then set `npx wrangler secret put SYNC_SECRET` and refresh D1 as the owner:

```bash
curl -X POST https://<worker>.workers.dev/sync -H "Authorization: Bearer $SYNC_SECRET"
```

Do not leave `/sync` unauthenticated. Cron (`scheduled`) still runs without HTTP.

---

## 📌 Code Conventions & Quality Rules

- **Strict TypeScript**: Keep `noImplicitAny`, `strictNullChecks`, and `noUnusedLocals` clean.
- **Error Handling**: Scrapers should catch network/parsing failures and throw clean, descriptive error messages that tool wrappers can capture safely without crashing the Worker. MCP query handlers must return that error (or prior scraped DB data), never hardcoded substitutes.
- **Import Statements**: Use standard ES module imports with `.js` extensions for local module paths (e.g., `import { handleMcpRequest } from './mcp/server.js'`), as required by Node/Worker ES Modules TS configuration.
