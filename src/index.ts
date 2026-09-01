import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { handleMcpRequest, createJsonRpcError } from './mcp/server.js';
import { createRateLimiter } from './middleware/rate_limit.js';
import { syncCatalogAndCalendar } from './scrapers/sync.js';
import type { D1Database } from './db/client.js';

export interface Env {
  ENVIRONMENT?: string;
  RATE_LIMIT_MAX?: string;
  DB?: D1Database;
}

const app = new Hono<{ Bindings: Env }>();

const maxRequests = Number(process.env.RATE_LIMIT_MAX) || (process.env.VITEST ? 10000 : 60);

export const rateLimiter = createRateLimiter({ max: maxRequests, windowMs: 60000 });

// Rate limiting middleware
app.use('*', rateLimiter.middleware);

// CORS Middleware setup for remote MCP access
app.use(
  '*',
  cors({
    origin: '*',
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'Mcp-Version', 'X-Requested-With'],
    exposeHeaders: ['Content-Type', 'Mcp-Version'],
    maxAge: 86400,
  })
);

// Health Check Endpoint
app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    service: 'braude-mcp',
    timestamp: new Date().toISOString(),
  });
});

// Root Info Endpoint
app.get('/', (c) => {
  return c.json({
    name: 'braude-mcp',
    description: 'Remote MCP Server for Ort Braude College with Universal Database Architecture',
    endpoints: {
      mcp: '/mcp',
      health: '/health',
      sync: '/sync',
    },
  });
});

// Manual Sync Trigger Endpoint
app.all('/sync', async (c) => {
  try {
    const result = await syncCatalogAndCalendar(c.env?.DB);
    return c.json({
      status: 'success',
      message: 'Scraper sync completed successfully',
      result,
    });
  } catch (error: any) {
    return c.json(
      {
        status: 'error',
        message: error?.message || 'Sync failed',
      },
      500
    );
  }
});

// Main MCP JSON-RPC Handler Endpoint
app.post('/mcp', async (c) => {
  const contentType = c.req.header('content-type') || '';
  if (contentType && !contentType.toLowerCase().includes('application/json')) {
    return c.json(
      createJsonRpcError(null, -32700, 'Parse error: Content-Type header must be application/json'),
      400
    );
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json(
      createJsonRpcError(null, -32700, 'Parse error: Invalid JSON payload'),
      400
    );
  }

  try {
    const response = await handleMcpRequest(body, c.env?.DB);
    return c.json(response);
  } catch (error: any) {
    return c.json(
      createJsonRpcError(
        null,
        -32603,
        `Internal error: ${error?.message || 'Unknown error'}`
      ),
      500
    );
  }
});

// Cloudflare Worker export with Scheduled (Cron) Trigger handler
export default {
  fetch: app.fetch,
  scheduled: async (event: any, env: Env, ctx: any) => {
    ctx.waitUntil(syncCatalogAndCalendar(env.DB));
  },
};

