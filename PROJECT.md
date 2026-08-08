# Project: Braude MCP Cloudflare Worker

## Architecture
- **Runtime Platform**: Cloudflare Workers free tier (serverless V8 edge isolates, zero local background processes).
- **Core Stack**: TypeScript, Hono (`hono`), MCP SDK (`@modelcontextprotocol/sdk`), HTML parser (`cheerio`), unit & integration testing (`vitest`), deployment runner (`wrangler`).
- **Transport Mechanism**: Streamable HTTP / JSON-RPC 2.0 over HTTP POST (`/mcp` endpoint), handling `initialize`, `tools/list`, `tools/call`, `resources/list`, and `resources/read` statelessly.
- **Scraping Layer**: On-demand HTML fetching via native `fetch` + DOM parsing (`cheerio`), targeting public portals:
  - Academic Calendar: `https://w3.braude.ac.il/calander-newsletter/` (accordions for years 2022-2027)
  - Course Schedule: `https://info.braude.ac.il/yedion/fireflyweb.aspx?appname=BSHITA` (FireFly Web search and detailed course schedule slots)

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Serverless MCP Scaffolding | Base Cloudflare Worker setup, TypeScript, Hono HTTP router (`/mcp`), package.json, wrangler.toml, tsconfig.json, vitest config | M1 | survey_1, survey_2 |
| 2 | Academic Calendar Scraper & Tool | Live scraping of `w3.braude.ac.il`, parsing semester dates, exam periods, registration dates, holidays; tool `get_academic_calendar` & resource `braude://calendar/current` | M2 | survey_3 |
| 3 | Course Schedule Scraper & Tools | Live querying of `info.braude.ac.il/yedion` with `appname=BSHITA`; tools `search_courses` and `get_course_schedule` returning groups, instructors, classrooms, days, and time slots | M3 | survey_3 |
| 4 | E2E Integration Test Suite & Verification | Automated integration test suite issuing JSON-RPC POST requests to `/mcp` (testing tool listing, tool execution, edge cases) both locally (`wrangler dev`) and remotely | M4 | ORIGINAL_REQUEST §Acceptance Criteria |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | M1: Base Infrastructure & MCP HTTP Server | Setup project scaffolding (`package.json`, `wrangler.toml`, `tsconfig.json`, `.gitignore`), implement Hono router & JSON-RPC dispatcher at `/mcp` | none | DONE |
| 2 | M2: Academic Calendar Scraper & Tools | Implement `src/scrapers/calendar.ts`, `get_academic_calendar` tool, and `braude://calendar/current` resource | M1 | DONE |
| 3 | M3: Course Schedule Scraper & Tools | Implement `src/scrapers/course_search.ts`, `search_courses` tool, and `get_course_schedule` tool | M1 | DONE |
| 4 | M4: E2E Test Suite & Final Verification | Implement `tests/integration/mcp.test.ts`, verify full JSON-RPC workflow over HTTP POST, run unit & integration tests, perform forensic audit | M1, M2, M3 | DONE |

## Interface Contracts

### Client ↔ Cloudflare Worker MCP Endpoint (`POST /mcp`)
- **Protocol**: JSON-RPC 2.0 over HTTP POST (`Content-Type: application/json`).
- **Endpoints**:
  - `POST /mcp` — Main JSON-RPC message endpoint.
  - `GET /health` — Health check returning `{ status: "ok", service: "braude-mcp" }`.
- **JSON-RPC Methods Supported**:
  - `initialize` -> returns server capabilities (`tools`, `resources`).
  - `tools/list` -> returns array of tool definitions with Zod/JSON schemas.
  - `tools/call` -> executes tool (`name`, `arguments`) and returns `{ content: [{ type: "text", text: "..." }], isError: boolean }`.
  - `resources/list` -> returns array of resource definitions.
  - `resources/read` -> returns resource content for URI.

### Scrapers ↔ Tools Internal Contract
- Scraper functions accept parameters and return typed data structures or throw descriptive errors.
- `CalendarScraper.fetchCalendar(year?: string)` -> returns `Promise<AcademicCalendarData>`.
- `CourseScraper.searchCourses(query: string, department?: string)` -> returns `Promise<CourseSummary[]>`.
- `CourseScraper.getCourseSchedule(courseCode: string)` -> returns `Promise<CourseScheduleDetail>`.

## Code Layout
```
/Users/oshriagronov/Documents/mcp-cloudflare/braude-mcp/
├── package.json
├── wrangler.toml
├── tsconfig.json
├── vitest.config.ts
├── .gitignore
├── src/
│   ├── index.ts                   # Cloudflare Worker entry point & Hono router (/mcp, /health)
│   ├── mcp/
│   │   ├── server.ts              # MCP Server instance & JSON-RPC dispatcher
│   │   ├── tools/
│   │   │   ├── calendar.ts        # get_academic_calendar tool registration
│   │   │   └── course.ts          # search_courses & get_course_schedule tools registration
│   │   └── resources/
│   │       └── calendar.ts        # braude://calendar/current resource registration
│   ├── scrapers/
│   │   ├── calendar.ts            # Scraper for w3.braude.ac.il
│   │   └── course_search.ts       # Scraper for info.braude.ac.il (FireFly)
│   └── types/
│       └── index.ts               # Shared TypeScript interfaces
└── tests/
    ├── unit/                      # Scraper & HTML parser unit tests
    └── integration/               # Integration tests for /mcp HTTP POST endpoint
```
