import { describe, it, expect, vi } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import { Agent } from './claude-agent.js';

function textResponse(text: string): Anthropic.Message {
  return {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    model: 'claude-opus-4-6-20250527',
    stop_reason: 'end_turn',
    stop_sequence: null,
    content: [{ type: 'text', text }],
    usage: { input_tokens: 10, output_tokens: 5 },
  } as unknown as Anthropic.Message;
}

function toolUseResponse(
  toolName: string,
  input: Record<string, string>,
  toolUseId = 'toolu_test'
): Anthropic.Message {
  return {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    model: 'claude-opus-4-6-20250527',
    stop_reason: 'tool_use',
    stop_sequence: null,
    content: [
      { type: 'tool_use', id: toolUseId, name: toolName, input },
    ],
    usage: { input_tokens: 15, output_tokens: 10 },
  } as unknown as Anthropic.Message;
}

function textAndToolResponse(
  text: string,
  toolName: string,
  input: Record<string, string>,
  toolUseId = 'toolu_test'
): Anthropic.Message {
  return {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    model: 'claude-opus-4-6-20250527',
    stop_reason: 'tool_use',
    stop_sequence: null,
    content: [
      { type: 'text', text },
      { type: 'tool_use', id: toolUseId, name: toolName, input },
    ],
    usage: { input_tokens: 15, output_tokens: 10 },
  } as unknown as Anthropic.Message;
}

describe('Claude Agent loop', () => {
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
        toolUseResponse('run_command', { command: 'echo hello' })
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
        toolUseResponse('run_command', { command: 'echo step1' }, 'toolu_1')
      )
      .mockResolvedValueOnce(
        toolUseResponse('run_command', { command: 'echo step2' }, 'toolu_2')
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
        toolUseResponse('nonexistent_tool', { foo: 'bar' })
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
        toolUseResponse('run_command', { command: 'echo hi' })
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

  it('should handle text + tool_use in the same response', async () => {
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
