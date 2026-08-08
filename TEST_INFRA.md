# E2E Test Infra: Braude MCP Cloudflare Worker

## Test Philosophy
- Opaque-box, requirement-driven testing over HTTP POST (`/mcp`).
- Methodology: Category-Partition + Boundary Value Analysis + Pairwise Combinatorial + Real-World Workload Testing.

## Feature Inventory & Test Coverage Goals
| # | Feature | Source (requirement) | Tier 1 (Feature) | Tier 2 (Boundary) | Tier 3 (Pairwise) | Tier 4 (Real-World) |
|---|---------|----------------------|:----------------:|:-----------------:|:-----------------:|:-------------------:|
| 1 | Serverless MCP Scaffolding (`initialize`, `tools/list`, `/health`) | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ | ✓ |
| 2 | Academic Calendar (`get_academic_calendar`) | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ | ✓ |
| 3 | Course Search (`search_courses`) | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ | ✓ |
| 4 | Course Schedule Details (`get_course_schedule`) | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ | ✓ |

## Test Architecture
- Test Runner: `vitest` running integration test script against local `wrangler dev` (port 8787) or deployed worker.
- HTTP Request Format: `POST /mcp` with JSON-RPC 2.0 payload (`Content-Type: application/json`).
- Expected Output Format: Valid JSON-RPC 2.0 response payload with `{ result: { content: [...] } }`.

## Test Tiers Definition
- **Tier 1 (Feature Coverage)**: Happy path tests for `initialize`, `tools/list`, `get_academic_calendar`, `search_courses`, and `get_course_schedule`.
- **Tier 2 (Boundary & Corner Cases)**: Empty search query, non-existent course codes, missing parameters, invalid JSON-RPC format, unknown tool names.
- **Tier 3 (Cross-Feature Combinations)**: Sequential requests (initialize -> search_courses -> get_course_schedule for found course code).
- **Tier 4 (Real-World Application Scenarios)**: Student schedule lookup flow (search for "אבטחת מידע", get course schedule, extract instructor & room, verify calendar dates).
