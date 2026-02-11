import { describe, it, expect, vi } from 'vitest';
import type OpenAI from 'openai';
import { Agent } from './openai-agent.js';

type Response = OpenAI.Responses.Response;

function textResponse(text: string): Response {
  return {
    id: 'resp_test',
    object: 'response',
    created_at: Date.now(),
    status: 'completed',
    model: 'gpt-5.3-codex',
    output: [
      {
        type: 'message',
        id: 'msg_test',
        role: 'assistant',
        status: 'completed',
        content: [{ type: 'output_text', text, annotations: [] }],
      },
    ],
    usage: {
      input_tokens: 10,
      output_tokens: 5,
      total_tokens: 15,
      input_tokens_details: { cached_tokens: 0 },
      output_tokens_details: { reasoning_tokens: 0 },
    },
    tool_choice: 'auto',
    tools: [],
    text: { format: { type: 'text' } },
    parallel_tool_calls: true,
    temperature: 1,
    top_p: 1,
    max_output_tokens: 1024,
    truncation: 'disabled',
    error: null,
    incomplete_details: null,
    instructions: null,
    metadata: {},
    reasoning: null,
    user: undefined,
  } as unknown as Response;
}

function toolCallResponse(
  toolName: string,
  args: Record<string, string>,
  callId = 'call_test'
): Response {
  return {
    id: 'resp_test',
    object: 'response',
    created_at: Date.now(),
    status: 'completed',
    model: 'gpt-5.3-codex',
    output: [
      {
        type: 'function_call',
        id: 'fc_test',
        call_id: callId,
        name: toolName,
        arguments: JSON.stringify(args),
        status: 'completed',
      },
    ],
    usage: {
      input_tokens: 15,
      output_tokens: 10,
      total_tokens: 25,
      input_tokens_details: { cached_tokens: 0 },
      output_tokens_details: { reasoning_tokens: 0 },
    },
    tool_choice: 'auto',
    tools: [],
    text: { format: { type: 'text' } },
    parallel_tool_calls: true,
    temperature: 1,
    top_p: 1,
    max_output_tokens: 1024,
    truncation: 'disabled',
    error: null,
    incomplete_details: null,
    instructions: null,
    metadata: {},
    reasoning: null,
    user: undefined,
  } as unknown as Response;
}

describe('OpenAI Agent loop', () => {
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
    expect(toolUses).toHaveLength(1);
    expect(toolUses[0].name).toBe('run_command');
    expect(toolResults).toHaveLength(1);
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
