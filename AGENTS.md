# AGENTS.md — AI Agent Guide for Braude MCP

Welcome! This repository contains a remote, serverless [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server for **Ort Braude College of Engineering** (מכללת עזריאלי / אורט בראודה), deployed on **Cloudflare Workers**.

This guide is designed for AI coding assistants (e.g., Antigravity, Claude Code, Cursor, Windsurf, Codex, Gemini Spark) working on or maintaining this codebase.

---

## 🎯 Project Goal & Scope

- **Primary Goal**: Provide AI assistants with live, structured access to Ort Braude College's public academic data:
  1. **Academic Calendar**: Important academic dates, semester start/end dates, exam periods, registration windows, and holidays.
  2. **Course Search**: Querying the college course catalog by keyword, course code, or department name.
  3. **Course Schedules**: Detailed group slots, lecture/lab schedules, assigned professors, days, hours, and classrooms.
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
├── src/
│   ├── index.ts                # App entry point, Hono router (/mcp, /health, /), CORS & rate limiting
│   ├── mcp/
│   │   ├── server.ts           # MCP Server setup & JSON-RPC 2.0 dispatcher
│   │   ├── tools/
│   │   │   ├── calendar.ts     # get_academic_calendar tool registration
│   │   │   └── course.ts       # search_courses & get_course_schedule tools registration
│   │   └── resources/
│   │       └── calendar.ts     # braude://calendar/current resource registration
│   ├── scrapers/
│   │   ├── calendar.ts         # Scraper for w3.braude.ac.il (Academic Calendar HTML parsing)
│   │   └── course_search.ts    # Scraper for info.braude.ac.il (FireFly Web course search)
│   ├── middleware/
│   │   └── rate_limit.ts       # Sliding window IP-based rate limiter (60 req/min/IP)
│   ├── utils/
│   │   └── cache.ts            # In-memory TTL cache for scraped data
│   └── types/
│       └── index.ts            # Shared TypeScript interfaces & types
├── tests/
│   ├── unit/                   # Scraper, cache, & rate limit unit tests
│   │   ├── cache.test.ts
│   │   ├── calendar.test.ts
│   │   ├── course_search.test.ts
│   │   └── rate_limit.test.ts
│   └── integration/            # JSON-RPC /mcp HTTP POST integration & stress tests
│       ├── calendar_mcp.test.ts
│       ├── course_mcp.test.ts
│       ├── mcp.test.ts
│       ├── mcp_adversarial.test.ts
│       ├── m1_stress.test.ts
│       ├── m2_challenger.test.ts
│       ├── m2_challenger_stress.test.ts
│       ├── m3_challenger.test.ts
│       └── m3_challenger_stress.test.ts
├── package.json                # Dependencies, scripts, and package specs
├── wrangler.toml               # Cloudflare Workers deployment config
├── tsconfig.json               # TypeScript compiler config
├── vitest.config.ts            # Vitest testing environment setup
├── PROJECT.md                  # Detailed architectural spec & milestone inventory
└── README.md                   # User documentation, client setups & deployment guide
```

---

## ⚡ Inventory of Tools & Resources

### MCP Tools

1. **`get_academic_calendar`** ([src/mcp/tools/calendar.ts](file:///Users/oshriagronov/Documents/mcp-cloudflare/braude-mcp/src/mcp/tools/calendar.ts))
   - **Input**: `{ year?: string }` (e.g. `"2025-2026"`, or omit for current year)
   - **Output**: JSON containing semester dates, exam periods, registration dates, and holidays.
2. **`search_courses`** ([src/mcp/tools/course.ts](file:///Users/oshriagronov/Documents/mcp-cloudflare/braude-mcp/src/mcp/tools/course.ts))
   - **Input**: `{ query: string, department?: string }` (e.g. `{ "query": "אלגברה ליניארית" }`)
   - **Output**: Array of course summary objects matching the query.
3. **`get_course_schedule`** ([src/mcp/tools/course.ts](file:///Users/oshriagronov/Documents/mcp-cloudflare/braude-mcp/src/mcp/tools/course.ts))
   - **Input**: `{ courseCode: string }` (e.g. `{ "courseCode": "61101" }`)
   - **Output**: Detailed course slots, groups (lectures/labs), instructors, days, hours, and classrooms.

### MCP Resources

1. **`braude://calendar/current`** ([src/mcp/resources/calendar.ts](file:///Users/oshriagronov/Documents/mcp-cloudflare/braude-mcp/src/mcp/resources/calendar.ts))
   - **MIME Type**: `application/json`
   - **Output**: Immediate JSON object for active academic year calendar.

---

## 🔒 Security, Legal & Architecture Guardrails

When modifying or expanding this codebase, AI agents MUST strictly adhere to the following principles:

1. **Serverless Worker Isolates**:
   - Cloudflare Workers are stateless and short-lived.
   - Do NOT introduce persistent filesystem operations, long-lived background timers (`setInterval`), or Node.js native binary dependencies (`fs`, `child_process`).
2. **Robots.txt & Public Access Only**:
   - Scrapers MUST only access public URLs on `w3.braude.ac.il` and `info.braude.ac.il`.
   - Never attempt to bypass logins, scrape authenticated student portals, or access private data.
3. **Rate Limiting & Caching**:
   - Maintain the sliding window IP rate limiter in [src/middleware/rate_limit.ts](file:///Users/oshriagronov/Documents/mcp-cloudflare/braude-mcp/src/middleware/rate_limit.ts).
   - Use in-memory TTL caching in [src/utils/cache.ts](file:///Users/oshriagronov/Documents/mcp-cloudflare/braude-mcp/src/utils/cache.ts) for HTML scraping to prevent overloading college servers.
4. **JSON-RPC 2.0 / MCP Compliance**:
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

---

## 📌 Code Conventions & Quality Rules

- **Strict TypeScript**: Keep `noImplicitAny`, `strictNullChecks`, and `noUnusedLocals` clean.
- **Error Handling**: Scrapers should catch network/parsing failures and throw clean, descriptive error messages that tool wrappers can capture safely without crashing the Worker.
- **Import Statements**: Use standard ES module imports with `.js` extensions for local module paths (e.g., `import { handleMcpRequest } from './mcp/server.js'`), as required by Node/Worker ES Modules TS configuration.
