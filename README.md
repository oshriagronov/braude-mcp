# Braude College MCP Server (Cloudflare Worker)


[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Cloudflare Workers](https://img.shields.io/badge/Platform-Cloudflare%20Workers-F38020?logo=cloudflare)](https://workers.cloudflare.com/)
[![Model Context Protocol](https://img.shields.io/badge/MCP-JSON--RPC%202.0-blue)](https://modelcontextprotocol.io/)

A remote, serverless [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server for **Ort Braude College of Engineering** (מכללת עזריאלי / אורט בראודה). Built with TypeScript, Hono, and deployed on Cloudflare Workers.

This server enables AI assistants (such as Claude, Codex, Cursor, Windsurf, Gemini Spark, or custom LLM agents) to query real-time academic calendar dates, search for available courses, and look up course schedules and classroom assignments.

---

> ### ⚠️ Legal & Ethical Disclaimer
> - **Unofficial Server**: This project is an **independent, open-source community tool** and is **NOT** affiliated with, authorized, maintained, sponsored, or endorsed by **Ort Braude College of Engineering**.
> - **Robots.txt Compliance**: This server strictly respects and adheres to the `robots.txt` guidelines specified by `w3.braude.ac.il` and `info.braude.ac.il`. It only accesses publicly available pages.
> - **No Private Data Access**: It does **NOT** access, scrape, or store any private student data, personal accounts, grades, or password-protected portals.
> - **Rate Limiting & Server Protection**: To ensure zero disruption or overload on the college web infrastructure:
>   - **Built-in IP Rate Limiting**: Enforces a strict limit of **60 requests per minute per IP** (returning `HTTP 429 Too Many Requests` with retry headers when exceeded).
>   - **In-Memory Caching**: Caches scraped public HTML data in memory to minimize outgoing requests to college servers.

---

## 🛠️ Features & Available Tools

### Tools

| Tool Name | Description | Example Arguments |
|---|---|---|
| `get_academic_calendar` | Fetches academic calendar events, semester start/end dates, exam periods, registration dates, and holidays for a given academic year. | `{ "year": "2025-2026" }` or `{}` (defaults to current year) |
| `search_courses` | Searches the course catalog by keyword, course code, or department name. | `{ "query": "אלגברה ליניארית" }` or `{ "query": "תוכנה", "department": "הנדסת תוכנה" }` |
| `get_course_schedule` | Retrieves detailed schedule options for a course, including lecture/lab groups, days, times, instructors, and classrooms. | `{ "courseCode": "61101" }` |

### Resources

| Resource URI | MIME Type | Description |
|---|---|---|
| `braude://calendar/current` | `application/json` | Provides immediate JSON access to the active academic year's calendar events. |

---

## 🔌 Client Connection Guide

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
               |    Scraper Layer & TTL Cache     |
               |  - cheerio DOM Parsing           |
               |  - Respects robots.txt           |
               +----------------------------------+
                                |
               +----------------+----------------+
               |                                 |
               v                                 v
   w3.braude.ac.il (Calendar)       info.braude.ac.il (FireFly)
```

---

## 📄 License

Distributed under the **MIT License**. See [`LICENSE`](./LICENSE) for details.
