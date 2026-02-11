import { GoogleGenAI, type Content, type Part, type GenerateContentResponse, type FunctionCall } from '@google/genai';
import { toolSpecs, getToolHandler } from './gemini-tools.js';
import { systemPrompt } from '../prompts/index.js';
import { truncateToolResult } from '../utils/truncate.js';
import { destructiveTools } from '../tools/handlers.js';

type InferenceFn = () => Promise<GenerateContentResponse>;

export class Agent {
  private client?: GoogleGenAI;
  private conversation: Content[];
  private systemPrompt: string;
  private inferenceFn?: InferenceFn;

  constructor(options?: { apiKey?: string; runInference?: InferenceFn }) {
    if (options?.runInference) {
      this.inferenceFn = options.runInference;
    } else {
      this.client = new GoogleGenAI({ apiKey: options?.apiKey });
    }
    this.conversation = [];
    this.systemPrompt = systemPrompt;
  }

  async sendMessage(userInput: string): Promise<void> {
    this.conversation.push({
      role: 'user',
      parts: [{ text: userInput }]
    });

    while (true) {
      const response = await this.runInference();

      const usage = response.usageMetadata;
      if (usage) {
        this.onUsage?.(usage.promptTokenCount ?? 0, usage.candidatesTokenCount ?? 0);
      }

      const parts = response.candidates?.[0]?.content?.parts ?? [];

      this.conversation.push({
        role: 'model',
        parts
      });

      const textParts = parts.filter(p => p.text != null && !p.thought);
      const fullText = textParts.map(p => p.text).join('');
      if (fullText) {
        this.onAssistantText?.(fullText);
      }

      const functionCalls = parts.filter(
        (p): p is typeof p & { functionCall: FunctionCall } => p.functionCall != null
      );

      if (functionCalls.length === 0) {
        break;
      }

      const functionResponses: Content = {
        role: 'user',
        parts: []
      };

      for (const part of functionCalls) {
        const fc = part.functionCall;
        this.onToolUse?.(fc.name!, fc.args);

        if (destructiveTools.has(fc.name!) && this.onConfirm) {
          const allowed = await this.onConfirm(fc.name!, fc.args);
          if (!allowed) {
            functionResponses.parts!.push({
              functionResponse: {
                name: fc.name!,
                id: fc.id,
                response: { output: 'Tool execution denied by user.' }
              }
            });
            continue;
          }
        }

        const handler = getToolHandler(fc.name!);

        if (!handler) {
          functionResponses.parts!.push({
            functionResponse: {
              name: fc.name!,
              id: fc.id,
              response: { error: `Error: Unknown tool: '${fc.name}'` }
            }
          });
          continue;
        }

        const result = await handler((fc.args ?? {}) as Record<string, string>);
        this.onToolResult?.(fc.name!, result);

        functionResponses.parts!.push({
          functionResponse: {
            name: fc.name!,
            id: fc.id,
            response: { output: truncateToolResult(result) }
          }
        });
      }

      this.conversation.push(functionResponses);
    }
  }

  private async runInference(): Promise<GenerateContentResponse> {
    if (this.inferenceFn) {
      return await this.inferenceFn();
    }

    const stream = await this.client!.models.generateContentStream({
      model: 'gemini-2.5-flash',
      contents: this.conversation,
      config: {
        systemInstruction: this.systemPrompt,
        tools: [{ functionDeclarations: toolSpecs }],
        maxOutputTokens: 8192,
      }
    });

    const allParts: Part[] = [];
    let usageMetadata: GenerateContentResponse['usageMetadata'];

    for await (const chunk of stream) {
      const text = chunk.text;
      if (text) {
        this.onAssistantTextDelta?.(text);
      }
      const parts = chunk.candidates?.[0]?.content?.parts;
      if (parts) {
        allParts.push(...parts);
      }
      if (chunk.usageMetadata) {
        usageMetadata = chunk.usageMetadata;
      }
    }

    return {
      candidates: [{ content: { role: 'model', parts: allParts } }],
      usageMetadata,
    } as GenerateContentResponse;
  }

  onAssistantText?: (text: string) => void;
  onAssistantTextDelta?: (delta: string) => void;
  onToolUse?: (name: string, input: unknown) => void;
  onToolResult?: (name: string, result: string) => void;
  onUsage?: (inputTokens: number, outputTokens: number) => void;
  onConfirm?: (toolName: string, input: unknown) => Promise<boolean>;
}
