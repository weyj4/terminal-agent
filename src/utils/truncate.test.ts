import { describe, it, expect } from 'vitest';
import { truncateToolResult } from './truncate.js';

describe('truncateToolResult', () => {
  it('should return short text unchanged', () => {
    expect(truncateToolResult('hello world')).toBe('hello world');
  });

  it('should return text at exactly max length unchanged', () => {
    const text = 'a'.repeat(30_000);
    expect(truncateToolResult(text)).toBe(text);
  });

  it('should truncate text exceeding max length', () => {
    const text = 'a'.repeat(50_000);
    const result = truncateToolResult(text);

    expect(result.length).toBeLessThan(text.length);
    expect(result).toContain('... [truncated: 20000 characters omitted] ...');
  });

  it('should respect custom max length', () => {
    const text = 'x'.repeat(500);
    const result = truncateToolResult(text, 200);

    expect(result).toContain('truncated');
    expect(result).toContain('300 characters omitted');
  });

  it('should preserve head and tail content', () => {
    const head = 'HEAD'.repeat(5_000);
    const middle = 'MID'.repeat(10_000);
    const tail = 'TAIL'.repeat(5_000);
    const text = head + middle + tail;

    const result = truncateToolResult(text);

    expect(result.startsWith(head.slice(0, 20_000))).toBe(true);
    expect(result).toContain('truncated');
  });
});
