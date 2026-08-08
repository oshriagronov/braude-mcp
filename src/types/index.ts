/**
 * Shared Type Definitions for Braude MCP Server
 */

// --- Academic Calendar Types (R2) ---
export type CalendarEventCategory =
  | 'semester_start'
  | 'semester_end'
  | 'exam_period'
  | 'holiday'
  | 'registration'
  | 'other';

export interface CalendarEvent {
  title: string;
  startDate: string;
  endDate?: string;
  category: CalendarEventCategory;
  rawDateStr?: string;
}

export interface AcademicYearCalendar {
  academicYear: string;
  semesterA: CalendarEvent[];
  semesterB: CalendarEvent[];
  summerSemester?: CalendarEvent[];
  generalEvents: CalendarEvent[];
}

export interface AcademicCalendarData {
  sourceUrl: string;
  fetchedAt: string;
  years: AcademicYearCalendar[];
}

// --- Course Schedule & Search Types (R3) ---
export type GroupType = 'lecture' | 'recitation' | 'lab' | 'other';

export interface CourseGroup {
  groupNumber: string;
  groupType: GroupType;
  groupTypeHebrew: string;
  instructor: string;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  location: string;
}

export interface CourseSummary {
  courseCode: string;
  courseName: string;
  department?: string;
  credits?: number;
}

export interface CourseScheduleDetail {
  courseCode: string;
  courseName: string;
  credits: number;
  description?: string;
  syllabusUrl?: string;
  prerequisites?: string[];
  groups: CourseGroup[];
  fetchedAt: string;
}

// --- MCP JSON-RPC Protocol Types ---
export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: Record<string, any>;
}

export interface JsonRpcError {
  code: number;
  message: string;
  data?: any;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: any;
  error?: JsonRpcError;
}

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

export interface McpResourceDefinition {
  uri: string;
  name: string;
  description?: string;
  mimeType: string;
}
