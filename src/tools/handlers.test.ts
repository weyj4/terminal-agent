// src/tools/handlers.test.ts
import { describe, it, expect } from 'vitest';
import { readFileHandler, runCommandHandler } from './handlers.js';

describe('readFileHandler', () => {
  it('should read package.json', async () => {
    const result = await readFileHandler({ path: 'package.json' });

    expect(result).toContain('"name"');
    expect(result).toContain('terminal-agent');
  });

  it('should return error for missing file', async () => {
    const result = await readFileHandler({ path: 'does-not-exist.txt' });

    expect(result).toContain('Error');
    expect(result).toContain('not found');
  });
});

describe('runCommandHandler', () => {
  it('should be defined', () => {
    expect(runCommandHandler).toBeDefined();
  });
});
