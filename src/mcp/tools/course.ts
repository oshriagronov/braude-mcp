import { z } from 'zod';
import { searchCourses, getCourseSchedule } from '../../scrapers/course_search.js';

/**
 * Zod Schema for search_courses tool arguments
 */
export const searchCoursesSchema = z.object({
  query: z
    .string({
      required_error: 'Query parameter is required',
      invalid_type_error: 'Query parameter must be a string',
    })
    .trim()
    .min(1, 'Query parameter cannot be empty'),
  department: z.string().trim().optional(),
});

export type SearchCoursesArgs = z.infer<typeof searchCoursesSchema>;

/**
 * Zod Schema for get_course_schedule tool arguments
 */
export const getCourseScheduleSchema = z.object({
  courseCode: z
    .string({
      required_error: 'Course code parameter is required',
      invalid_type_error: 'Course code parameter must be a string',
    })
    .trim()
    .min(1, 'Course code parameter cannot be empty'),
});

export type GetCourseScheduleArgs = z.infer<typeof getCourseScheduleSchema>;

/**
 * Handler for search_courses MCP tool
 */
export async function handleSearchCourses(
  args: Record<string, unknown>
): Promise<{ content: Array<{ type: 'text'; text: string }>; isError: boolean }> {
  try {
    const parseResult = searchCoursesSchema.safeParse(args);
    if (!parseResult.success) {
      const errorDetails = parseResult.error.errors.map((e) => e.message).join('; ');
      return {
        content: [
          {
            type: 'text',
            text: `Invalid arguments for search_courses: ${errorDetails}`,
          },
        ],
        isError: true,
      };
    }

    const { query, department } = parseResult.data;
    const courses = await searchCourses(query, department);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(courses, null, 2),
        },
      ],
      isError: false,
    };
  } catch (error: any) {
    return {
      content: [
        {
          type: 'text',
          text: `Error searching courses: ${error?.message || String(error)}`,
        },
      ],
      isError: true,
    };
  }
}

/**
 * Handler for get_course_schedule MCP tool
 */
export async function handleGetCourseSchedule(
  args: Record<string, unknown>
): Promise<{ content: Array<{ type: 'text'; text: string }>; isError: boolean }> {
  try {
    const parseResult = getCourseScheduleSchema.safeParse(args);
    if (!parseResult.success) {
      const errorDetails = parseResult.error.errors.map((e) => e.message).join('; ');
      return {
        content: [
          {
            type: 'text',
            text: `Invalid arguments for get_course_schedule: ${errorDetails}`,
          },
        ],
        isError: true,
      };
    }

    const { courseCode } = parseResult.data;
    const schedule = await getCourseSchedule(courseCode);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(schedule, null, 2),
        },
      ],
      isError: false,
    };
  } catch (error: any) {
    return {
      content: [
        {
          type: 'text',
          text: `Error fetching course schedule: ${error?.message || String(error)}`,
        },
      ],
      isError: true,
    };
  }
}

/**
 * Registration helper exporting course tool handlers
 */
export function registerCourseTools() {
  return {
    search_courses: handleSearchCourses,
    get_course_schedule: handleGetCourseSchedule,
  };
}
