import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileHandler, writeFileHandler, editFileHandler, runCommandHandler } from './handlers.js';
import { writeFile, mkdir, rm, readFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

let testDir: string;

beforeEach(async () => {
  testDir = join(tmpdir(), `terminal-agent-test-${Date.now()}`);
  await mkdir(testDir, { recursive: true });
});

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true });
});

describe('readFileHandler', () => {
  it('should read package.json', async () => {
    const result = await readFileHandler({ path: 'package.json' });

    expect(result).toContain('"name"');
    expect(result).toContain('terminal-agent');
  });

  it('should return error for missing file', async () => {
    const result = await readFileHandler({ path: join(testDir, 'does-not-exist.txt') });

    expect(result).toContain('Error');
    expect(result).toContain('not found');
  });
});

describe('writeFileHandler', () => {
  it('should write a new file', async () => {
    const filePath = join(testDir, 'test.txt');
    const result = await writeFileHandler({ path: filePath, content: 'hello world' });

    expect(result).toContain('Successfully wrote');
    expect(result).toContain('11 bytes');

    const written = await readFile(filePath, 'utf-8');
    expect(written).toBe('hello world');
  });

  it('should create parent directories', async () => {
    const filePath = join(testDir, 'nested', 'deep', 'file.txt');
    const result = await writeFileHandler({ path: filePath, content: 'nested content' });

    expect(result).toContain('Successfully wrote');

    const written = await readFile(filePath, 'utf-8');
    expect(written).toBe('nested content');
  });

  it('should overwrite existing file', async () => {
    const filePath = join(testDir, 'overwrite.txt');
    await writeFile(filePath, 'original');

    await writeFileHandler({ path: filePath, content: 'replaced' });

    const written = await readFile(filePath, 'utf-8');
    expect(written).toBe('replaced');
  });
});

describe('editFileHandler', () => {
  it('should replace matching text', async () => {
    const filePath = join(testDir, 'edit.txt');
    await writeFile(filePath, 'hello world');

    const result = await editFileHandler({ path: filePath, oldText: 'world', newText: 'there' });

    expect(result).toContain('Successfully edited');

    const edited = await readFile(filePath, 'utf-8');
    expect(edited).toBe('hello there');
  });

  it('should return error when text not found', async () => {
    const filePath = join(testDir, 'edit.txt');
    await writeFile(filePath, 'hello world');

    const result = await editFileHandler({ path: filePath, oldText: 'missing', newText: 'replacement' });

    expect(result).toContain('Error');
    expect(result).toContain('Could not find');
  });

  it('should return error for multiple matches', async () => {
    const filePath = join(testDir, 'edit.txt');
    await writeFile(filePath, 'foo bar foo');

    const result = await editFileHandler({ path: filePath, oldText: 'foo', newText: 'baz' });

    expect(result).toContain('Error');
    expect(result).toContain('multiple matches');
  });

  it('should return error for missing file', async () => {
    const result = await editFileHandler({ path: join(testDir, 'nope.txt'), oldText: 'a', newText: 'b' });

    expect(result).toContain('Error');
    expect(result).toContain('not found');
  });
});

describe('runCommandHandler', () => {
  it('should execute a command and return stdout', async () => {
    const result = await runCommandHandler({ command: 'echo hello' });

    expect(result).toContain('STDOUT');
    expect(result).toContain('hello');
  });

  it('should return stderr', async () => {
    const result = await runCommandHandler({ command: 'echo err >&2' });

    expect(result).toContain('STDERR');
    expect(result).toContain('err');
  });
});
