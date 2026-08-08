# Original User Request

## Initial Request — 2026-08-08T08:42:23Z

Create a remote Model Context Protocol (MCP) server for Ort Braude College of Engineering (w3.braude.ac.il) deployed to a free serverless platform (e.g. Cloudflare Workers / HTTP endpoint) so that neither the MCP server nor the web scraping runs on the user's local machine. The server will fetch and parse live data on-demand from Braude's public portals.

Working directory: /Users/oshriagronov/Documents/mcp-cloudflare/braude-mcp
Integrity mode: development

## Requirements

### R1. Remote Serverless MCP Server Architecture (Cloudflare Worker / HTTP)
Deploy/build an MCP server using standard HTTP/SSE or Worker transport (e.g. Cloudflare Worker with `@modelcontextprotocol/sdk` or Hono/Worker fetch) that runs completely in the cloud for free, with zero local background processes.

### R2. Academic Calendar MCP Tool & Resource
Implement an MCP tool/resource (`get_academic_calendar`) that remote-scrapes calendar events (semester start/end dates, exam periods, holiday breaks) from `https://w3.braude.ac.il/intrested__trashed/calander-newsletter/`.

### R3. Detailed Course Schedule & Lecture Info MCP Tool
Implement MCP tools (`search_courses` and `get_course_schedule`) that query Braude's public schedule system (`https://info.braude.ac.il/yedion/fireflyweb.aspx?prgname=Enter_Search`) and return detailed course information, including:
- Course name, code, credits, prerequisites
- Lecture / Recitation / Lab groups (הרצאה / תרגול / מעבדה)
- Lecturer / instructor names
- Days, hours / time slots
- Classroom numbers, hall, and building locations

### R4. Remote Live Scraping & Fetching Layer
Implement HTML parsing / HTTP fetching routines optimized for serverless execution (using `cheerio`, native `fetch`, or regex/DOM parsing) to query `info.braude.ac.il` on-demand without needing headless browser binaries or paid proxies.

## Acceptance Criteria

### Remote Server & Tools
- [ ] Server builds and deploys successfully as a serverless worker / remote HTTP service (e.g., Cloudflare Worker).
- [ ] Server responds to standard MCP protocol requests (tool listing, execution) over HTTP/SSE.
- [ ] `get_academic_calendar` returns structured calendar events (dates, holidays, semester boundaries).
- [ ] `search_courses` searches and filters courses by department or keyword.
- [ ] `get_course_schedule` returns comprehensive schedule details per course: group type (Lecture/Lab), instructor, classroom/building, day of week, and time range.

### Verification
- [ ] An automated integration test makes remote HTTP requests to the deployed endpoint / worker and verifies non-empty valid JSON tool responses.
- [ ] Server operates 100% on free tiers with zero local server/scraper setup required on the client machine.
