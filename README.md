# Braude College MCP Server (Cloudflare Worker)


[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Cloudflare Workers](https://img.shields.io/badge/Platform-Cloudflare%20Workers-F38020?logo=cloudflare)](https://workers.cloudflare.com/)
[![Model Context Protocol](https://img.shields.io/badge/MCP-JSON--RPC%202.0-blue)](https://modelcontextprotocol.io/)

A remote, serverless [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server for **Ort Braude College of Engineering**, powered by a **pure edge database architecture** deployed on **Cloudflare Workers**.

This server enables AI assistants (such as Claude, Codex, Cursor, Windsurf, Gemini Spark, or custom LLM agents) to query academic calendar dates, search the latest-year Braude course catalog, retrieve **scraped** lecture/lab schedules, and read **ingested syllabus PDF text** (topics, exams, grading) from the database. User queries never scrape the college live; a background job every 3 days refreshes the catalog, timetable, calendar, and syllabus PDFs into D1.

---

> ### ⚠️ Legal & Ethical Disclaimer
> - **Unofficial Server**: This project is an **independent, open-source community tool** and is **NOT** affiliated with, authorized, maintained, sponsored, or endorsed by **Ort Braude College of Engineering**.
> - **Robots.txt Compliance**: This server strictly respects and adheres to the `robots.txt` guidelines specified by `w3.braude.ac.il` and `info.braude.ac.il`.
> - **No Private Data Access**: It does **NOT** access, scrape, or store any private student data, personal accounts, grades, or password-protected portals.
> - **Zero-Load User Queries**: User queries hit the persistent database layer with **zero live scraping**, ensuring zero load on college servers during runtime.
> - **Polite Background Refresh**: A Cloudflare Cron Trigger (`0 0 */3 * *`) and the `POST /sync` endpoint refresh the latest academic year from FireFly (catalog, weekly timetable, and every public syllabus PDF) into D1. MCP queries only read that database.

---

## 🛠️ Features & Available Tools

### Tools

| Tool Name | Description | Example Arguments |
|---|---|---|
| `get_academic_calendar` | Scraped academic calendar from D1/seed (semester dates, exams, holidays). Updated every 3 days. Errors if nothing has been scraped; does not invent dates. | `{ "year": "2026-2027" }` or `{}` |
| `search_courses` | Searches the **latest academic year** catalog (currently 571 taught courses) by keyword, code, or department name. | `{ "query": "אלגברה" }` or `{ "query": "תוכנה", "department": "הנדסת תוכנה" }` |
| `get_course_schedule` | Comprehensive course record from the database: weekly slots, instructors, rooms, credits, and ingested syllabus PDF (attendance / חובת נוכחות, grading, exam, topics). | `{ "courseCode": "61767" }` or `{ "courseCode": "62005" }` |
| `get_course_syllabus` | Full ingested syllabus plus parsed sections: whether attendance is required, grading/exam rules, topics, objectives, AI policy, and the site schedule. Do not fetch the PDF URL. | `{ "courseCode": "61767" }` |

### Resources

| Resource URI | MIME Type | Description |
|---|---|---|
| `braude://calendar/current` | `application/json` | Provides immediate JSON access to the active academic year's calendar events directly from the database. |

---

## 🔌 Client Connection Guide

Updating an existing app or AI agent for the new syllabus/attendance tools: give it [AI_CLIENT_UPDATE.md](./AI_CLIENT_UPDATE.md).

Replace `https://braude-mcp.<your-subdomain>.workers.dev/mcp` with your deployed Cloudflare Worker URL (or `http://127.0.0.1:8787/mcp` if running locally).

### 1. Claude (Claude Desktop & Claude Code CLI)

#### **Claude Desktop App**
Edit your `claude_desktop_config.json`:
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "braude": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-fetch",
        "https://braude-mcp.<your-subdomain>.workers.dev/mcp"
      ]
    }
  }
}
```

#### **Claude Code CLI**
Add the remote server via terminal:
```bash
claude mcp add braude https://braude-mcp.<your-subdomain>.workers.dev/mcp
```

---

### 2. Codex, Cursor, Windsurf & Antigravity IDEs

In your IDE settings or MCP configuration file (`.cursor/mcp.json` or `.codeium/windsurf/mcp_config.json`):

```json
{
  "mcpServers": {
    "braude-mcp": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-fetch",
        "https://braude-mcp.<your-subdomain>.workers.dev/mcp"
      ]
    }
  }
}
```

---

### 3. Gemini Spark & Custom AI Agents

for Gemini Spark go to "Connected Apps", scroll down to "Custome Apps" and click on "Add Custome App" and in there insert the url: `https://braude-mcp.<your-subdomain>.workers.dev/mcp` and procced with the instructions of gemini.

---

## 🚀 Deployment Guide

### Prerequisites
- [Node.js](https://nodejs.org/) v18.0.0 or higher
- [npm](https://www.npmjs.com/) v9.0.0 or higher
- A free [Cloudflare Account](https://dash.cloudflare.com/sign-up)

---

### Manual Deployment via Wrangler

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Authenticate Wrangler**:
   ```bash
   npx wrangler login
   ```

3. **Deploy**:
   ```bash
   npm run deploy
   ```

4. **Set an owner-only sync secret** (required; `/sync` is not public):
   ```bash
   npx wrangler secret put SYNC_SECRET
   ```
   Paste a long random token when prompted. Do not commit it.

5. **Refresh D1** (you only, with that secret):
   ```bash
   curl -X POST https://braude-mcp.<your-subdomain>.workers.dev/sync \
     -H "Authorization: Bearer YOUR_SYNC_SECRET"
   ```
   Queries read D1 first, then the bundled seed. Until `/sync` runs, production D1 may still hold old data.

   The 3-day Cloudflare cron still refreshes D1 automatically and does not use HTTP, so it does not need this token.

---

### 📦 Uploading the Project to GitHub

To publish this project to GitHub for the first time:

1. **Initialize Git and commit code**:
   ```bash
   git init
   git add .
   git commit -m "feat: initial commit for braude-mcp server"
   ```

2. **Create repository and push to GitHub**:
   - Using GitHub CLI (`gh`):
     ```bash
     gh repo create braude-mcp --public --source=. --remote=origin --push
     ```
   - Or manually create a repository on [GitHub](https://github.com/new) and run:
     ```bash
     git remote add origin https://github.com/YOUR_USERNAME/braude-mcp.git
     git branch -M main
     git push -u origin main
     ```

---

### 🤖 Automated Deployment via GitHub Actions (CI/CD)

This repository includes a GitHub Actions workflow (`.github/workflows/deploy.yml`) that automatically runs typechecks, runs the unit/integration test suite, and deploys to Cloudflare Workers whenever you push to `main` or `master`.

To enable automated deployment, you must add two secret credentials to your GitHub repository settings:

#### **Step 1: Retrieve your `CLOUDFLARE_ACCOUNT_ID`**
1. Log in to the [Cloudflare Dashboard](https://dash.cloudflare.com/).
2. Click on **Workers & Pages** in the left sidebar navigation menu.
3. On the right side of the page, locate the **Account ID** field.
4. Click to copy the 32-character hexadecimal string.

#### **Step 2: Create a `CLOUDFLARE_API_TOKEN`**
1. In the Cloudflare Dashboard, click your profile icon in the top right corner and select **My Profile**.
2. Click **API Tokens** in the left sidebar menu.
3. Click the **Create Token** button.
4. Locate the **Edit Cloudflare Workers** template and click **Use template**.
5. Ensure the token permissions include:
   - `Account | Workers Scripts | Edit`
   - `Account | Account Settings | Read`
6. Click **Continue to summary**, then click **Create Token**.
7. Copy the generated secret API Token string *(Store it securely; Cloudflare will only show it once)*.

#### **Step 3: Add Secrets to your GitHub Repository**
1. Go to your repository on GitHub: `https://github.com/YOUR_USERNAME/braude-mcp`.
2. Click **Settings** (top tab).
3. In the left sidebar, expand **Secrets and variables** and click **Actions**.
4. Click **New repository secret**.
5. Set **Name** to `CLOUDFLARE_ACCOUNT_ID` and **Secret** to your Account ID string. Click **Add secret**.
6. Click **New repository secret** again.
7. Set **Name** to `CLOUDFLARE_API_TOKEN` and **Secret** to your API Token string. Click **Add secret**.

Now, every `git push` to `main` will automatically test and deploy your worker!

---

## ⚙️ Configuration & Environment Variables

| Variable | Default | Description |
|---|---|---|
| `ENVIRONMENT` | `production` | Deployment environment state |
| `RATE_LIMIT_MAX` | `60` | Maximum requests allowed per IP per 1-minute window |
| `SYNC_SECRET` | _(none)_ | Owner token for `POST /sync`. Set with `wrangler secret put SYNC_SECRET`, never in git. |

To set custom environment variables locally for development, copy `.env.example` to `.dev.vars`:
```bash
cp .env.example .dev.vars
```

---

## 🧪 Testing & Quality Assurance

Run test suite:
```bash
npm test
```

Run TypeScript typecheck:
```bash
npm run typecheck
```

Rebuild the bundled seed from the live FireFly latest year (catalog + weekly timetable):
```bash
npm run refresh-seed
```

Then scrape per-course credits (נקודות זכות), פרשיית לימוד, and ingest syllabus PDF text (resumable):
```bash
npm run enrich-seed
# PDF text only (skips FireFly detail pages):
npm run enrich-seed -- --pdfs-only
```

Production D1 is filled by the same 3-day job as the catalog (`cron 0 0 */3 * *` or authenticated `POST /sync`): courses, schedules, calendar, and full syllabus PDF text. Every MCP query reads D1 (or the bundled seed fallback) and never fetches Braude URLs.

---

## 🏗️ Architecture

```text
               +----------------------------------+
               |   Claude / Codex / Gemini Spark  |
               +----------------------------------+
                                |
                   JSON-RPC 2.0 / HTTP POST
                                v
               +----------------------------------+
               |    Cloudflare Worker (Hono)      |
               |  - Rate Limiter (60 req/min/IP)  |
               |  - CORS & Error Handling         |
               +----------------------------------+
                                |
                                v
               +----------------------------------+
               |        MCP Dispatcher            |
               |  - Tools: calendar & course      |
               |  - Resource: braude://calendar   |
               +----------------------------------+
                                |
                                v
               +----------------------------------+
               |    Universal Database Layer      |
               |  - Zero live scraping on queries |
               |  - Cloudflare D1 / seed fallback |
               |  - Scraped latest-year timetable |
               +----------------------------------+
                                ^
                                | (Cron 0 0 */3 * * and POST /sync)
               +----------------+----------------+
               |  Background sync (latest year)  |
               |  FireFly session POST year      |
               |  switch + timetable + details   |
               +----------------+----------------+
                                |
               +----------------+----------------+
               |                                 |
               v                                 v
   w3.braude.ac.il (Calendar)       info.braude.ac.il (FireFly)
```

---

## 📄 License

Distributed under the **MIT License**. See [`LICENSE`](./LICENSE) for details.
