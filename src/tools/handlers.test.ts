import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileHandler, writeFileHandler, editFileHandler, lsHandler, findFilesHandler, runCommandHandler } from './handlers.js';
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

describe('lsHandler', () => {
  it('should list directory contents', async () => {
    await writeFile(join(testDir, 'file.txt'), 'content');
    await mkdir(join(testDir, 'subdir'));

    const result = await lsHandler({ path: testDir });

    expect(result).toContain('file.txt');
    expect(result).toContain('subdir/');
  });

  it('should sort entries alphabetically', async () => {
    await writeFile(join(testDir, 'zebra.txt'), '');
    await writeFile(join(testDir, 'alpha.txt'), '');

    const result = await lsHandler({ path: testDir });
    const lines = result.split('\n');

    expect(lines[0]).toBe('alpha.txt');
    expect(lines[1]).toBe('zebra.txt');
  });

  it('should return empty directory message', async () => {
    const result = await lsHandler({ path: testDir });

    expect(result).toBe('(empty directory)');
  });

  it('should return error for missing path', async () => {
    const result = await lsHandler({ path: join(testDir, 'nope') });

    expect(result).toContain('Error');
    expect(result).toContain('not found');
  });

  it('should return error for non-directory path', async () => {
    const filePath = join(testDir, 'file.txt');
    await writeFile(filePath, 'content');

    const result = await lsHandler({ path: filePath });

    expect(result).toContain('Error');
    expect(result).toContain('Not a directory');
  });
});

describe('findFilesHandler', () => {
  it('should find files matching a pattern', async () => {
    await writeFile(join(testDir, 'app.ts'), '');
    await writeFile(join(testDir, 'utils.ts'), '');
    await writeFile(join(testDir, 'readme.md'), '');

    const result = await findFilesHandler({ pattern: '*.ts', path: testDir });

    expect(result).toContain('app.ts');
    expect(result).toContain('utils.ts');
    expect(result).not.toContain('readme.md');
  });

  it('should find files in subdirectories', async () => {
    await mkdir(join(testDir, 'src'), { recursive: true });
    await writeFile(join(testDir, 'src', 'index.ts'), '');

    const result = await findFilesHandler({ pattern: '*.ts', path: testDir });

    expect(result).toContain('index.ts');
  });

  it('should return message when no files match', async () => {
    const result = await findFilesHandler({ pattern: '*.xyz', path: testDir });

    expect(result).toBe('No files found matching pattern');
  });
});

describe('runCommandHandler', () => {
  it('should execute a command and return output', async () => {
    const result = await runCommandHandler({ command: 'echo hello' });

    expect(result).toContain('hello');
  });

  it('should return stderr output', async () => {
    const result = await runCommandHandler({ command: 'echo err >&2' });

    expect(result).toContain('err');
  });

  it('should report exit code on failure', async () => {
    const result = await runCommandHandler({ command: 'echo oops && exit 42' });

    expect(result).toContain('oops');
    expect(result).toContain('Exit code: 42');
  });

  it('should report no-output success', async () => {
    const result = await runCommandHandler({ command: 'true' });

    expect(result).toContain('successfully');
  });
});
