import type {
  JsonRpcRequest,
  JsonRpcResponse,
  McpToolDefinition,
  McpResourceDefinition,
} from '../types/index.js';
import { handleGetAcademicCalendar } from './tools/calendar.js';
import { handleSearchCourses, handleGetCourseSchedule } from './tools/course.js';
import { handleReadCurrentCalendar } from './resources/calendar.js';

export const TOOL_DEFINITIONS: McpToolDefinition[] = [
  {
    name: 'get_academic_calendar',
    description:
      'Fetches and parses the academic calendar from Ort Braude College (semester start/end, exam periods, holidays).',
    inputSchema: {
      type: 'object',
      properties: {
        year: {
          type: 'string',
          description: 'Optional academic year string (e.g. "2024-2025" or "תשפ\"ה")',
        },
      },
    },
  },
  {
    name: 'search_courses',
    description:
      'Searches for courses in Braude public schedule system by keyword, course code, or department name.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search keyword or course code (e.g., "אלגברה" or "61101")',
        },
        department: {
          type: 'string',
          description: 'Optional department filter name',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_course_schedule',
    description:
      'Retrieves detailed schedule info for a course, including lectures, labs, instructors, time slots, and classrooms.',
    inputSchema: {
      type: 'object',
      properties: {
        courseCode: {
          type: 'string',
          description: 'Unique course code (e.g., "61101")',
        },
      },
      required: ['courseCode'],
    },
  },
];

export const RESOURCE_DEFINITIONS: McpResourceDefinition[] = [
  {
    uri: 'braude://calendar/current',
    name: 'Current Academic Calendar',
    description: 'Raw academic calendar data for Ort Braude College',
    mimeType: 'application/json',
  },
];

export function createJsonRpcError(
  id: string | number | null,
  code: number,
  message: string,
  data?: unknown
): JsonRpcResponse {
  return {
    jsonrpc: '2.0',
    id: id ?? null,
    error: {
      code,
      message,
      ...(data !== undefined ? { data } : {}),
    },
  };
}

export function createJsonRpcSuccess(
  id: string | number | null,
  result: unknown
): JsonRpcResponse {
  return {
    jsonrpc: '2.0',
    id: id ?? null,
    result,
  };
}

export async function handleMcpRequest(
  payload: unknown
): Promise<JsonRpcResponse> {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    return createJsonRpcError(null, -32600, 'Invalid Request: Payload must be an object');
  }

  const req = payload as Partial<JsonRpcRequest>;
  const id = req.id ?? null;

  if (req.jsonrpc !== '2.0') {
    return createJsonRpcError(id, -32600, 'Invalid Request: jsonrpc must be "2.0"');
  }

  if (typeof req.method !== 'string') {
    return createJsonRpcError(id, -32600, 'Invalid Request: method is required and must be a string');
  }

  const params = req.params ?? {};

  switch (req.method) {
    case 'initialize': {
      return createJsonRpcSuccess(id, {
        protocolVersion: '2024-11-05',
        capabilities: {
          tools: {},
          resources: {},
        },
        serverInfo: {
          name: 'braude-mcp',
          version: '1.0.0',
        },
      });
    }

    case 'notifications/initialized': {
      return createJsonRpcSuccess(id, {});
    }

    case 'ping': {
      return createJsonRpcSuccess(id, {});
    }

    case 'tools/list': {
      return createJsonRpcSuccess(id, {
        tools: TOOL_DEFINITIONS,
      });
    }

    case 'tools/call': {
      const toolName = (params as { name?: string }).name;
      const toolArgs = (params as { arguments?: Record<string, unknown> }).arguments ?? {};

      if (!toolName || !TOOL_DEFINITIONS.some((t) => t.name === toolName)) {
        return createJsonRpcError(id, -32601, `Tool not found: "${toolName}"`);
      }

      if (toolName === 'get_academic_calendar') {
        const result = await handleGetAcademicCalendar(toolArgs);
        return createJsonRpcSuccess(id, result);
      }

      if (toolName === 'search_courses') {
        const result = await handleSearchCourses(toolArgs);
        return createJsonRpcSuccess(id, result);
      }

      if (toolName === 'get_course_schedule') {
        const result = await handleGetCourseSchedule(toolArgs);
        return createJsonRpcSuccess(id, result);
      }

      const stubData = {
        message: `Placeholder result for tool ${toolName}`,
        arguments: toolArgs,
      };

      return createJsonRpcSuccess(id, {
        content: [
          {
            type: 'text',
            text: JSON.stringify(stubData, null, 2),
          },
        ],
        isError: false,
      });
    }

    case 'resources/list': {
      return createJsonRpcSuccess(id, {
        resources: RESOURCE_DEFINITIONS,
      });
    }

    case 'resources/read': {
      const uri = (params as { uri?: string }).uri;
      if (!uri || !RESOURCE_DEFINITIONS.some((r) => r.uri === uri)) {
        return createJsonRpcError(id, -32602, `Invalid params: Resource "${uri}" not found`);
      }

      if (uri === 'braude://calendar/current') {
        try {
          const result = await handleReadCurrentCalendar();
          return createJsonRpcSuccess(id, result);
        } catch (err: any) {
          return createJsonRpcError(
            id,
            -32603,
            `Failed to read resource "${uri}": ${err?.message || String(err)}`
          );
        }
      }

      return createJsonRpcError(id, -32602, `Invalid params: Resource "${uri}" not found`);
    }

    default: {
      return createJsonRpcError(id, -32601, `Method not found: "${req.method}"`);
    }
  }
}
