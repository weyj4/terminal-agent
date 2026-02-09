// src/tools/index.test.ts
import { describe, it, expect } from 'vitest';
import { getToolHandler, tools } from './index.js';

describe('Tools', () => {
  it('should export read_file tool', () => {
    const handler = getToolHandler('read_file');
    expect(handler).toBeDefined();
  });
  
  it('should export run_command tool', () => {
    const handler = getToolHandler('run_command');
    expect(handler).toBeDefined();
  });
  
  it('should return undefined for unknown tool', () => {
    const handler = getToolHandler('fake_tool');
    expect(handler).toBeUndefined();
  });
});

describe('read_file handler', () => {
  it('should read package.json', async () => {
    const handler = getToolHandler('read_file');
    const result = await handler!({ path: 'package.json' });
    
    expect(result).toContain('"name"');
    expect(result).toContain('terminal-agent');
  });
  
  it('should return error for missing file', async () => {
    const handler = getToolHandler('read_file');
    const result = await handler!({ path: 'does-not-exist.txt' });
    
    expect(result).toContain('Error');
    expect(result).toContain('not found');
  });
});
