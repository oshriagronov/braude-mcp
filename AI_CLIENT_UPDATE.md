# AI instructions: update a project for the current Braude MCP

Give this file to the coding assistant that maintains **your** app (the MCP client). It is not for changing the Braude server itself.

The Braude MCP is a remote JSON-RPC 2.0 server. Course data is already scraped into its database. Client queries must **only call MCP tools**. Never download `syllabusUrl` PDFs, and never scrape `info.braude.ac.il` or `w3.braude.ac.il` from the client.

---

## 1. Refresh the MCP connection

Old clients still see only three tools until they reconnect.

1. Confirm the server URL (production Worker `/mcp`, or `http://127.0.0.1:8787/mcp` for local).
2. Restart the MCP host (Claude Desktop, Cursor, Codex, Windsurf, Gemini custom app, or your agent runtime).
3. Call `tools/list` and confirm these four tools exist:
   - `get_academic_calendar`
   - `search_courses`
   - `get_course_schedule` (payload grew; see below)
   - `get_course_syllabus` (**new**)
4. If `get_course_syllabus` is missing, the client is still pointed at an old Worker. Update the URL / redeploy, then restart.

Claude Desktop example (`claude_desktop_config.json`):

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

Cursor / Windsurf (`.cursor/mcp.json` or equivalent): same `mcpServers` shape.

After editing config, fully quit and reopen the app so `tools/list` is fetched again.

---

## 2. What changed

| Before | After |
|---|---|
| Three tools | Four tools (`get_course_syllabus` added) |
| `get_course_schedule` returned hours, instructors, credits, a short description, and a PDF **URL** | Same site fields **plus** ingested PDF text and parsed syllabus sections |
| Assistants tried to open `syllabusUrl` and failed | Read `syllabus.attendance`, `syllabus.grading`, `syllabus.topics`, and `syllabusText` from the tool result |
| Attendance / exam / topics were not answerable | Answer from parsed PDF fields; do not invent if they are missing |

`search_courses` is still a catalog lookup only (name, code, department). It does **not** include full syllabus text.

---

## 3. Tool map (use this when routing user questions)

| User question | Tool | Arguments |
|---|---|---|
| Find a course by name, topic word, or code | `search_courses` | `{ "query": "אלגברה" }` or `{ "query": "62005" }` |
| Filter by department | `search_courses` | `{ "query": "תוכנה", "department": "הנדסת תוכנה" }` |
| When is the class? Who teaches? Which room? | `get_course_schedule` | `{ "courseCode": "61767" }` |
| Must I attend? Exam? Grade breakdown? Topics? AI policy? | `get_course_syllabus` | `{ "courseCode": "62005" }` |
| Semester dates, exam period, holidays | `get_academic_calendar` | `{}` or `{ "year": "2026-2027" }` |

Typical flow:

1. `search_courses` → take `courseCode`
2. `get_course_syllabus` for policy (attendance, grading, topics)
3. `get_course_schedule` if you still need the weekly grid (it also includes syllabus fields, so one call can be enough)

---

## 4. JSON-RPC shapes

All calls are `POST /mcp` with `Content-Type: application/json`.

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "get_course_syllabus",
    "arguments": { "courseCode": "62005" }
  }
}
```

Tool results look like:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [{ "type": "text", "text": "{ ...course JSON... }" }],
    "isError": false
  }
}
```

Parse `result.content[0].text` as JSON. If `result.isError` is true, show that text; do not retry by fetching college URLs.

---

## 5. New / changed response fields

### `get_course_schedule` and `get_course_syllabus`

Both may include:

```ts
{
  courseCode: string;
  courseName: string;
  department?: string;
  credits: number;
  description?: string;          // short FireFly פרשיית לימוד
  prerequisites?: string[];
  syllabusUrl?: string;          // do not download
  syllabusText?: string;         // full ingested PDF text
  syllabus?: {
    attendance?: string;         // חובת נוכחות — use this for "must I attend?"
    grading?: string;            // הרכב הציון
    exam?: string;
    topics?: string;             // נושאי הלימוד
    objectives?: string;
    learningOutcomes?: string;
    requirements?: string;
    teachingMethods?: string;
    bibliography?: string;
    aiPolicy?: string;
  };
  groups?: Array<{               // weekly slots from the site (empty if unpublished)
    groupNumber: string;
    groupType: "lecture" | "recitation" | "lab" | "other";
    groupTypeHebrew: string;
    instructor: string;
    dayOfWeek: string;           // e.g. "ד'"
    startTime: string;
    endTime: string;
    location: string;
  }>;
  fetchedAt: string;
}
```

### How to answer attendance

1. Call `get_course_syllabus` with the course code.
2. Prefer `syllabus.attendance` (verbatim from the PDF).
3. If that is missing, search `syllabusText` for `נוכחות`, `חובת נוכחות`, `attendance`.
4. If both are missing, say the published syllabus does not state attendance. **Do not guess.**

Examples of real PDF language you may see:

- `חובת נוכחות 100% בהרצאות`
- `נוכחות חובה בלפחות 10 מעבדות`
- `דרישת נוכחות של 80% ... זכאי לבונוס` (bonus, not always a hard fail)

### How to answer exams / topics

- Exam and weights: `syllabus.grading` then `syllabus.exam`, else `syllabusText`
- Subjects: `syllabus.topics` then `syllabusText` / `description`
- Weekly hours: `groups` from either course tool

---

## 6. Code changes in the client project

Update any wrapper, prompt, or type that talks to Braude MCP:

1. **Tool allow-list** — add `"get_course_syllabus"`.
2. **Types** — add `syllabus?` and `syllabusText?` on schedule/syllabus results; add `department?` on the detail object.
3. **Prompts / system instructions** — replace “open the syllabus PDF” with “call `get_course_syllabus` and read `syllabus.attendance` / `syllabusText`”.
4. **Remove PDF fetch** — delete any `fetch(syllabusUrl)`, browser download, or “I cannot read PDFs” fallback that hits the college.
5. **Search UI** — keep `search_courses` as the finder; open detail via `get_course_syllabus` or `get_course_schedule`.
6. **Empty states**
   - `groups: []` → hours not published; do not invent times.
   - no `syllabus` / `syllabusText` → no public PDF ingested; say so.

Minimal TypeScript types to copy:

```ts
interface SyllabusContent {
  attendance?: string;
  grading?: string;
  exam?: string;
  topics?: string;
  objectives?: string;
  learningOutcomes?: string;
  requirements?: string;
  teachingMethods?: string;
  bibliography?: string;
  aiPolicy?: string;
}

interface CourseDetail {
  courseCode: string;
  courseName: string;
  department?: string;
  credits: number;
  description?: string;
  prerequisites?: string[];
  syllabusUrl?: string;
  syllabusText?: string;
  syllabus?: SyllabusContent;
  groups?: Array<{
    groupNumber: string;
    groupType: string;
    groupTypeHebrew: string;
    instructor: string;
    dayOfWeek: string;
    startTime: string;
    endTime: string;
    location: string;
  }>;
  fetchedAt: string;
}
```

---

## 7. Do not do this

- Do not fetch `https://info.braude.ac.il/info/{year}/{code}.pdf`.
- Do not scrape FireFly or the college calendar from the client.
- Do not invent instructors, days, credits, attendance rules, or exam weights.
- Do not treat `search_courses` hits as a full syllabus.

---

## 8. Quick verification

After updating, ask the assistant (or run the tools):

1. `search_courses` `{ "query": "סמינר בהתאמת תבניות" }` → code `62005`
2. `get_course_syllabus` `{ "courseCode": "62005" }` → `syllabus.attendance` mentions 100% lecture attendance
3. `get_course_schedule` `{ "courseCode": "61767" }` → non-empty `groups` plus syllabus fields when the PDF exists
4. Confirm the client never requested a `.pdf` URL

If step 2 has no `syllabusText`, the Worker you are calling has not ingested PDFs yet (needs deploy + 3-day/`POST /sync`). The client code is still correct; the server database is empty for that course.
