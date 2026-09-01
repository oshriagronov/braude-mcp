import { describe, it, expect, vi } from 'vitest';
import app from '../../src/index.js';
import type { CourseSummary, CourseScheduleDetail, AcademicCalendarData } from '../../src/types/index.js';

describe('MCP Pure Database Query Integration Tests', () => {
  it('serves search_courses directly from database with zero network calls', async () => {
    // Spy on global fetch to verify 0 network requests occur during user tool call
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const req = new Request('http://localhost/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'req-search-db-1',
        method: 'tools/call',
        params: {
          name: 'search_courses',
          arguments: { query: 'אלגברה' },
        },
      }),
    });

    const res = await app.fetch(req);
    expect(res.status).toBe(200);

    const json = (await res.json()) as any;
    expect(json.jsonrpc).toBe('2.0');
    expect(json.id).toBe('req-search-db-1');
    expect(json.result.isError).toBe(false);

    const courses: CourseSummary[] = JSON.parse(json.result.content[0].text);
    expect(courses.length).toBeGreaterThan(0);
    expect(courses.some((c) => c.courseName.includes('אלגברה'))).toBe(true);

    // Assert that NO live network request was made to Braude servers
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('serves get_course_schedule directly from database with zero network calls', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const req = new Request('http://localhost/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'req-schedule-db-1',
        method: 'tools/call',
        params: {
          name: 'get_course_schedule',
          arguments: { courseCode: '61767' },
        },
      }),
    });

    const res = await app.fetch(req);
    expect(res.status).toBe(200);

    const json = (await res.json()) as any;
    expect(json.jsonrpc).toBe('2.0');
    expect(json.id).toBe('req-schedule-db-1');
    expect(json.result.isError).toBe(false);

    const schedule: CourseScheduleDetail = JSON.parse(json.result.content[0].text);
    expect(schedule.courseCode).toBe('61767');
    expect(schedule.courseName).toBe('אבטחת מידע וקריפטולוגיה');
    expect(schedule.groups.length).toBeGreaterThan(0);

    // Assert zero outbound network calls
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('serves get_academic_calendar directly from database with zero network calls', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const req = new Request('http://localhost/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'req-calendar-db-1',
        method: 'tools/call',
        params: {
          name: 'get_academic_calendar',
          arguments: { year: '2025-2026' },
        },
      }),
    });

    const res = await app.fetch(req);
    expect(res.status).toBe(200);

    const json = (await res.json()) as any;
    expect(json.result.isError).toBe(false);

    const calendar: AcademicCalendarData = JSON.parse(json.result.content[0].text);
    expect(calendar.years.length).toBe(1);
    expect(calendar.years[0].academicYear).toContain('תשפ"ו');

    // Assert zero outbound network calls
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('serves braude://calendar/current resource directly from database with zero network calls', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const req = new Request('http://localhost/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'req-resource-db-1',
        method: 'resources/read',
        params: {
          uri: 'braude://calendar/current',
        },
      }),
    });

    const res = await app.fetch(req);
    expect(res.status).toBe(200);

    const json = (await res.json()) as any;
    expect(json.result.contents[0].uri).toBe('braude://calendar/current');

    const calendar: AcademicCalendarData = JSON.parse(json.result.contents[0].text);
    expect(calendar.years.length).toBeGreaterThan(0);

    // Assert zero outbound network calls
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
