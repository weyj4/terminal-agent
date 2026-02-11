import { describe, it, expect, vi } from 'vitest';
import type { GenerateContentResponse } from '@google/genai';
import { Agent } from './gemini-agent.js';

function textResponse(text: string): GenerateContentResponse {
  return {
    candidates: [{
      content: {
        role: 'model',
        parts: [{ text }],
      },
    }],
    usageMetadata: {
      promptTokenCount: 10,
      candidatesTokenCount: 5,
      totalTokenCount: 15,
    },
  } as unknown as GenerateContentResponse;
}

function toolCallResponse(
  toolName: string,
  args: Record<string, string>,
  callId = 'call_test'
): GenerateContentResponse {
  return {
    candidates: [{
      content: {
        role: 'model',
        parts: [{
          functionCall: { name: toolName, args, id: callId },
        }],
      },
    }],
    usageMetadata: {
      promptTokenCount: 15,
      candidatesTokenCount: 10,
      totalTokenCount: 25,
    },
  } as unknown as GenerateContentResponse;
}

function textAndToolResponse(
  text: string,
  toolName: string,
  args: Record<string, string>,
  callId = 'call_test'
): GenerateContentResponse {
  return {
    candidates: [{
      content: {
        role: 'model',
        parts: [
          { text },
          { functionCall: { name: toolName, args, id: callId } },
        ],
      },
    }],
    usageMetadata: {
      promptTokenCount: 15,
      candidatesTokenCount: 10,
      totalTokenCount: 25,
    },
  } as unknown as GenerateContentResponse;
}

describe('Gemini Agent loop', () => {
  it('should handle a simple text response', async () => {
    const texts: string[] = [];

    const agent = new Agent({
      runInference: vi.fn().mockResolvedValueOnce(textResponse('Hello!')),
    });
    agent.onAssistantText = (t) => texts.push(t);

    await agent.sendMessage('Hi');

    expect(texts).toEqual(['Hello!']);
  });

  it('should report usage', async () => {
    const usages: { input: number; output: number }[] = [];

    const agent = new Agent({
      runInference: vi.fn().mockResolvedValueOnce(textResponse('Hi')),
    });
    agent.onUsage = (i, o) => usages.push({ input: i, output: o });

    await agent.sendMessage('Hey');

    expect(usages).toEqual([{ input: 10, output: 5 }]);
  });

  it('should execute a tool and loop back for final text', async () => {
    const toolUses: { name: string; input: unknown }[] = [];
    const toolResults: { name: string; result: string }[] = [];
    const texts: string[] = [];

    const mockInference = vi.fn()
      .mockResolvedValueOnce(
        toolCallResponse('run_command', { command: 'echo hello' })
      )
      .mockResolvedValueOnce(
        textResponse('The command output was hello.')
      );

    const agent = new Agent({ runInference: mockInference });
    agent.onToolUse = (n, i) => toolUses.push({ name: n, input: i });
    agent.onToolResult = (n, r) => toolResults.push({ name: n, result: r });
    agent.onAssistantText = (t) => texts.push(t);

    await agent.sendMessage('Run echo hello');

    expect(mockInference).toHaveBeenCalledTimes(2);
    expect(toolUses).toEqual([{ name: 'run_command', input: { command: 'echo hello' } }]);
    expect(toolResults).toHaveLength(1);
    expect(toolResults[0].name).toBe('run_command');
    expect(toolResults[0].result).toContain('hello');
    expect(texts).toEqual(['The command output was hello.']);
  });

  it('should handle multi-turn tool use', async () => {
    const texts: string[] = [];

    const mockInference = vi.fn()
      .mockResolvedValueOnce(
        toolCallResponse('run_command', { command: 'echo step1' }, 'call_1')
      )
      .mockResolvedValueOnce(
        toolCallResponse('run_command', { command: 'echo step2' }, 'call_2')
      )
      .mockResolvedValueOnce(
        textResponse('Done with both steps.')
      );

    const agent = new Agent({ runInference: mockInference });
    agent.onAssistantText = (t) => texts.push(t);

    await agent.sendMessage('Do two steps');

    expect(mockInference).toHaveBeenCalledTimes(3);
    expect(texts).toEqual(['Done with both steps.']);
  });

  it('should handle unknown tool gracefully', async () => {
    const texts: string[] = [];

    const mockInference = vi.fn()
      .mockResolvedValueOnce(
        toolCallResponse('nonexistent_tool', { foo: 'bar' })
      )
      .mockResolvedValueOnce(
        textResponse('Sorry, that tool does not exist.')
      );

    const agent = new Agent({ runInference: mockInference });
    agent.onAssistantText = (t) => texts.push(t);

    await agent.sendMessage('Use a fake tool');

    expect(mockInference).toHaveBeenCalledTimes(2);
    expect(texts).toEqual(['Sorry, that tool does not exist.']);
  });

  it('should accumulate usage across turns', async () => {
    const usages: { input: number; output: number }[] = [];

    const mockInference = vi.fn()
      .mockResolvedValueOnce(
        toolCallResponse('run_command', { command: 'echo hi' })
      )
      .mockResolvedValueOnce(
        textResponse('Done.')
      );

    const agent = new Agent({ runInference: mockInference });
    agent.onUsage = (i, o) => usages.push({ input: i, output: o });

    await agent.sendMessage('test');

    expect(usages).toHaveLength(2);
    expect(usages[0]).toEqual({ input: 15, output: 10 });
    expect(usages[1]).toEqual({ input: 10, output: 5 });
  });

  it('should handle text + function call in the same response', async () => {
    const texts: string[] = [];
    const toolUses: string[] = [];

    const mockInference = vi.fn()
      .mockResolvedValueOnce(
        textAndToolResponse(
          'Let me check that for you.',
          'run_command',
          { command: 'echo checking' }
        )
      )
      .mockResolvedValueOnce(
        textResponse('All done.')
      );

    const agent = new Agent({ runInference: mockInference });
    agent.onAssistantText = (t) => texts.push(t);
    agent.onToolUse = (n) => toolUses.push(n);

    await agent.sendMessage('Check something');

    expect(texts).toEqual(['Let me check that for you.', 'All done.']);
    expect(toolUses).toEqual(['run_command']);
  });

  it('should propagate inference errors', async () => {
    const agent = new Agent({
      runInference: vi.fn().mockRejectedValueOnce(new Error('API rate limit')),
    });

    await expect(agent.sendMessage('test')).rejects.toThrow('API rate limit');
  });

  it('should deny tool execution when onConfirm returns false', async () => {
    const texts: string[] = [];
    const toolResults: { name: string; result: string }[] = [];

    const mockInference = vi.fn()
      .mockResolvedValueOnce(
        toolCallResponse('run_command', { command: 'rm -rf /' })
      )
      .mockResolvedValueOnce(
        textResponse('Operation was denied.')
      );

    const agent = new Agent({ runInference: mockInference });
    agent.onAssistantText = (t) => texts.push(t);
    agent.onToolResult = (n, r) => toolResults.push({ name: n, result: r });
    agent.onConfirm = vi.fn().mockResolvedValue(false);

    await agent.sendMessage('Delete everything');

    expect(agent.onConfirm).toHaveBeenCalledWith('run_command', { command: 'rm -rf /' });
    expect(toolResults).toHaveLength(0);
    expect(texts).toEqual(['Operation was denied.']);
  });

  it('should allow tool execution when onConfirm returns true', async () => {
    const toolResults: { name: string; result: string }[] = [];

    const mockInference = vi.fn()
      .mockResolvedValueOnce(
        toolCallResponse('run_command', { command: 'echo hello' })
      )
      .mockResolvedValueOnce(
        textResponse('Done.')
      );

    const agent = new Agent({ runInference: mockInference });
    agent.onToolResult = (n, r) => toolResults.push({ name: n, result: r });
    agent.onConfirm = vi.fn().mockResolvedValue(true);

    await agent.sendMessage('Run echo');

    expect(agent.onConfirm).toHaveBeenCalled();
    expect(toolResults).toHaveLength(1);
    expect(toolResults[0].result).toContain('hello');
  });

  it('should not prompt for non-destructive tools', async () => {
    const mockInference = vi.fn()
      .mockResolvedValueOnce(
        toolCallResponse('grep', { pattern: 'hello' })
      )
      .mockResolvedValueOnce(
        textResponse('No matches.')
      );

    const agent = new Agent({ runInference: mockInference });
    agent.onConfirm = vi.fn().mockResolvedValue(true);

    await agent.sendMessage('Search for hello');

    expect(agent.onConfirm).not.toHaveBeenCalled();
  });

  it('should maintain conversation across multiple sendMessage calls', async () => {
    let callCount = 0;
    const mockInference = vi.fn().mockImplementation(() => {
      callCount++;
      return Promise.resolve(textResponse(`Response ${callCount}`));
    });

    const texts: string[] = [];
    const agent = new Agent({ runInference: mockInference });
    agent.onAssistantText = (t) => texts.push(t);

    await agent.sendMessage('First message');
    await agent.sendMessage('Second message');

    expect(texts).toEqual(['Response 1', 'Response 2']);
    expect(mockInference).toHaveBeenCalledTimes(2);
  });
});
