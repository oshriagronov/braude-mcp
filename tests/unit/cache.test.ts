import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MemoryCache } from '../../src/utils/cache.js';

describe('MemoryCache Unit Tests', () => {
  let cache: MemoryCache;

  beforeEach(() => {
    cache = new MemoryCache();
    vi.useRealTimers();
  });

  it('should store and retrieve a value within TTL', () => {
    cache.set('test_key', { data: 'hello' }, 10);
    expect(cache.has('test_key')).toBe(true);
    expect(cache.get('test_key')).toEqual({ data: 'hello' });
  });

  it('should return undefined for non-existent key', () => {
    expect(cache.get('missing')).toBeUndefined();
    expect(cache.has('missing')).toBe(false);
  });

  it('should expire entries after TTL', () => {
    vi.useFakeTimers();
    const now = Date.now();
    vi.setSystemTime(now);

    cache.set('expiring_key', 'val', 5); // 5 seconds TTL
    expect(cache.get('expiring_key')).toBe('val');

    // Advance system time by 6 seconds
    vi.setSystemTime(now + 6000);

    expect(cache.get('expiring_key')).toBeUndefined();
    expect(cache.has('expiring_key')).toBe(false);
    expect(cache.isExpired('expiring_key')).toBe(true);
    expect(cache.getStale('expiring_key')).toBe('val');
  });

  it('should return undefined for getStale when key does not exist', () => {
    expect(cache.getStale('unknown_key')).toBeUndefined();
    expect(cache.isExpired('unknown_key')).toBe(true);
  });

  it('should delete keys explicitly', () => {
    cache.set('to_delete', 'value', 60);
    expect(cache.delete('to_delete')).toBe(true);
    expect(cache.get('to_delete')).toBeUndefined();
    expect(cache.getStale('to_delete')).toBeUndefined();
  });

  it('should clear all entries', () => {
    cache.set('k1', 'v1', 60);
    cache.set('k2', 'v2', 60);
    expect(cache.size).toBe(2);

    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.get('k1')).toBeUndefined();
    expect(cache.getStale('k1')).toBeUndefined();
  });
});

