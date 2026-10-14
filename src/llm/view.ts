import type { TypedChatMessages } from 'llm-support-core';
import { describeCall } from './tools';

/**
 * a chat transcript, flattened for display. transcripts stay in their
 * provider's own format (Anthropic, Gemini or OpenAI Responses); this reads
 * each into the same few kinds of row.
 */
export type ChatItem =
  | { kind: 'user'; text: string }
  | { kind: 'assistant'; text: string }
  /** a tool call: done once its result is in, with error text if it failed */
  | { kind: 'tool'; label: string; done: boolean; error?: string }
  | { kind: 'error'; text: string };

type Any = Record<string, any>;

/** a tool error as sent to the model: JSON of a string, or of { message, detail } */
export const toolErrorText = (raw: unknown): string => {
  let value = raw;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    }
    catch {
      return value as string;
    }
  }
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    const { message, detail } = value as Any;
    const parts = [message, Array.isArray(detail) ? detail.join('; ') : detail].filter(p => typeof p === 'string' && p);
    if (parts.length) return parts.join(': ');
  }
  return JSON.stringify(value ?? 'error');
};

const isClientError = (m: Any) => m?.type === 'client-side-error';

/** the last text item is still being written while a reply streams; merge runs of text so markdown renders whole */
const push = (items: ChatItem[], item: ChatItem) => {
  const last = items[items.length - 1];
  if (item.kind === 'assistant' && last?.kind === 'assistant') last.text += `\n\n${item.text}`;
  else items.push(item);
};

export const chatItems = (chat: TypedChatMessages): ChatItem[] => {
  const items: ChatItem[] = [];
  /** tool rows by call id, so results can mark them done */
  const calls = new Map<string, Extract<ChatItem, { kind: 'tool' }>>();
  const call = (id: string | undefined, name: string, input: unknown) => {
    const item: ChatItem = { kind: 'tool', label: describeCall(name, input), done: false };
    if (id) calls.set(id, item);
    items.push(item);
  };
  const result = (id: string | undefined, error?: string) => {
    const item = id ? calls.get(id) : undefined;
    if (item) {
      item.done = true;
      if (error !== undefined) item.error = error;
    }
    else if (error !== undefined) items.push({ kind: 'error', text: error });
  };

  for (const m of chat.messages as Any[]) {
    if (isClientError(m)) {
      items.push({ kind: 'error', text: m.message || 'Something went wrong.' });
      continue;
    }
    switch (chat.type) {
      case 'anthropic': {
        const kind = m.role === 'assistant' ? 'assistant' : 'user';
        if (typeof m.content === 'string') {
          push(items, { kind, text: m.content });
          break;
        }
        for (const block of m.content ?? []) {
          if (block.type === 'text' && block.text) push(items, { kind, text: block.text });
          else if (block.type === 'tool_use') call(block.id, block.name, block.input);
          else if (block.type === 'tool_result') result(block.tool_use_id, block.is_error ? toolErrorText(block.content) : undefined);
        }
        break;
      }
      case 'gemini': {
        const kind = m.role === 'model' ? 'assistant' : 'user';
        for (const part of m.parts ?? []) {
          if (part.text && !part.thought) push(items, { kind, text: part.text });
          else if (part.functionCall) call(part.functionCall.id || part.functionCall.name, part.functionCall.name, part.functionCall.args);
          else if (part.functionResponse) {
            const error = part.functionResponse.response?.error;
            result(part.functionResponse.id || part.functionResponse.name, error === undefined ? undefined : toolErrorText(error));
          }
        }
        break;
      }
      case 'openai-responses': {
        if (!m.type || m.type === 'message') {
          const kind = m.role === 'assistant' ? 'assistant' : 'user';
          if (typeof m.content === 'string') push(items, { kind, text: m.content });
          else for (const part of m.content ?? []) {
            if ((part.type === 'output_text' || part.type === 'input_text') && part.text) push(items, { kind, text: part.text });
          }
        }
        else if (m.type === 'function_call') call(m.call_id, m.name, m.arguments);
        else if (m.type === 'function_call_output') {
          let error: string | undefined;
          try {
            const parsed = JSON.parse(m.output);
            if (parsed?.type === 'error') error = toolErrorText(parsed.content);
          }
          catch {
            // not an error payload
          }
          result(m.call_id, error);
        }
        break;
      }
    }
  }
  return items;
};
