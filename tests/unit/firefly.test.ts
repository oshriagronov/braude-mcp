import { describe, it, expect } from 'vitest';
import {
  academicYearRange,
  fallbackAcademicYear,
  parseYearDropdown,
} from '../../src/scrapers/firefly.js';

describe('FireFly session helpers', () => {
  it('reads the latest year from ChangeYear / R1C39 dropdowns without hardcoding', () => {
    const html = `
      <select name="ChangeYear">
        <option selected value="2027">2027 - תשפ"ז</option>
        <option value="2026">2026 - תשפ"ו</option>
      </select>
      <select name="R1C39">
        <option value="2027">2027</option>
        <option value="2026">2026</option>
      </select>
    `;
    expect(parseYearDropdown(html)[0]).toBe('2027');
    expect(academicYearRange('2027')).toBe('2026-2027');
  });

  it('computes a fallback year from the current date instead of a constant', () => {
    expect(fallbackAcademicYear(new Date('2026-03-01'))).toBe('2026');
    expect(fallbackAcademicYear(new Date('2026-09-01'))).toBe('2027');
  });
});
