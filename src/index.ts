import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { handleMcpRequest, createJsonRpcError } from './mcp/server.js';
import { createRateLimiter } from './middleware/rate_limit.js';

const app = new Hono();

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
    description: 'Remote MCP Server for Ort Braude College',
    endpoints: {
      mcp: '/mcp',
      health: '/health',
    },
  });
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
  } catch (err) {
    return c.json(
      createJsonRpcError(null, -32700, 'Parse error: Invalid JSON payload'),
      400
    );
  }

  try {
    const response = await handleMcpRequest(body);
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

export default app;
