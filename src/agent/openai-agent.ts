import OpenAI from 'openai';
import { toolSpecs, getToolHandler } from './openai-tools.js';
import { systemPrompt } from '../prompts/index.js'

type InputItem = OpenAI.Responses.ResponseInputItem;
type OutputItem = OpenAI.Responses.ResponseOutputItem;

export class Agent {
  private client?: OpenAI;
  private conversation: InputItem[];
  private systemPrompt: string;
  private inferenceFn?: () => Promise<OpenAI.Responses.Response>;

  constructor(options?: { apiKey?: string; runInference?: () => Promise<OpenAI.Responses.Response> }) {
    this.conversation = [];
    this.systemPrompt = systemPrompt;

    if (options?.runInference) {
      this.inferenceFn = options.runInference;
    } else {
      this.client = new OpenAI({ apiKey: options?.apiKey });
    }
  }

  async sendMessage(userInput: string): Promise<void> {
    this.conversation.push({
      role: 'user',
      content: [{ type: 'input_text', text: userInput }],
    });

    while (true) {
      const response = await this.runInference();

      if (response.usage) {
        this.onUsage?.(response.usage.input_tokens, response.usage.output_tokens);
      }

      this.conversation.push(...response.output);

      const toolCalls: Extract<OutputItem, { type: 'function_call' }>[] = [];

      for (const item of response.output) {
        if (item.type === 'message') {
          for (const part of item.content) {
            if (part.type === 'output_text') {
              this.onAssistantText?.(part.text);
            }
          }
        } else if (item.type === 'function_call') {
          toolCalls.push(item);
        }
      }

      if (toolCalls.length === 0) break;

      const toolOutputs: InputItem[] = [];

      for (const call of toolCalls) {
        this.onToolUse?.(call.name, call.arguments);

        const handler = getToolHandler(call.name);

        if (!handler) {
          toolOutputs.push({
            type: 'function_call_output',
            call_id: call.call_id,
            output: `Error: Unknown tool: '${call.name}'`
          });
          continue;
        }

        const args = JSON.parse(call.arguments ?? '{}') as Record<string, string>;
        const result = await handler(args);
        this.onToolResult?.(call.name, result);

        toolOutputs.push({
          type: 'function_call_output',
          call_id: call.call_id,
          output: result
        });
      }
      this.conversation.push(...toolOutputs);
    }
  }

  private async runInference(): Promise<OpenAI.Responses.Response> {
    if (this.inferenceFn) {
      return await this.inferenceFn();
    }

    const stream = await this.client!.responses.create({
      model: 'gpt-5.2',
      instructions: this.systemPrompt,
      input: [...this.conversation],
      tools: toolSpecs,
      max_output_tokens: 1024,
      stream: true,
    });

    let completedResponse: OpenAI.Responses.Response | undefined;

    for await (const event of stream) {
      if (event.type === 'response.output_text.delta') {
        this.onAssistantTextDelta?.(event.delta);
      } else if (event.type === 'response.completed') {
        completedResponse = event.response;
      }
    }

    if (!completedResponse) {
      throw new Error('Stream ended without a completed response');
    }

    return completedResponse;
  }

  onAssistantText?: (text: string) => void;
  onAssistantTextDelta?: (delta: string) => void;
  onToolUse?: (name: string, input: unknown) => void;
  onToolResult?: (name: string, result: string) => void;
  onUsage?: (inputTokens: number, outputTokens: number) => void;
}
