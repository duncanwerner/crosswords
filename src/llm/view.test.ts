import { describe, expect, it } from 'vitest';
import type { TypedChatMessages } from 'llm-support-core';
import { chatItems } from './view';

describe('chatItems', () => {
  it('reads an Anthropic transcript', () => {
    const chat = {
      type: 'anthropic',
      messages: [
        { role: 'user', content: 'Review 5a' },
        { role: 'assistant', content: [{ type: 'text', text: 'Looking.' }, { type: 'tool_use', id: 't1', name: 'get_entry', input: { ref: '5a' } }] },
        { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: '"5a ..."' }] },
        { role: 'assistant', content: [{ type: 'tool_use', id: 't2', name: 'set_mark', input: { ref: '9a', mark: 'good' } }] },
        { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't2', content: '"There\'s no 9 across."', is_error: true }] },
        { role: 'assistant', content: [{ type: 'text', text: 'Fine.' }, { type: 'text', text: 'Really.' }] },
        { type: 'client-side-error', message: 'boom' },
      ],
    } as TypedChatMessages;
    expect(chatItems(chat)).toEqual([
      { kind: 'user', text: 'Review 5a' },
      { kind: 'assistant', text: 'Looking.' },
      { kind: 'tool', label: 'read 5a', done: true },
      { kind: 'tool', label: 'marked 9a good', done: true, error: "There's no 9 across." },
      { kind: 'assistant', text: 'Fine.\n\nReally.' },
      { kind: 'error', text: 'boom' },
    ]);
  });

  it('shows a call still waiting for its result', () => {
    const chat = {
      type: 'anthropic',
      messages: [{ role: 'assistant', content: [{ type: 'tool_use', id: 't1', name: 'get_puzzle', input: '' }] }],
    } as TypedChatMessages;
    expect(chatItems(chat)).toEqual([{ kind: 'tool', label: 'read the puzzle', done: false }]);
  });

  it('reads a Gemini transcript', () => {
    const chat = {
      type: 'gemini',
      messages: [
        { role: 'user', parts: [{ text: 'Hi' }] },
        { role: 'model', parts: [{ text: 'hmm', thought: true }, { functionCall: { name: 'get_puzzle', args: {} } }] },
        { role: 'user', parts: [{ functionResponse: { name: 'get_puzzle', response: { content: '...' } } }] },
        { role: 'model', parts: [{ text: 'Done' }] },
      ],
    } as TypedChatMessages;
    expect(chatItems(chat)).toEqual([
      { kind: 'user', text: 'Hi' },
      { kind: 'tool', label: 'read the puzzle', done: true },
      { kind: 'assistant', text: 'Done' },
    ]);
  });

  it('reads an OpenAI Responses transcript', () => {
    const chat = {
      type: 'openai-responses',
      messages: [
        { role: 'user', content: 'Hi' },
        { type: 'reasoning', summary: [] },
        { type: 'function_call', call_id: 'c1', name: 'get_entry', arguments: '{"ref":"3d"}' },
        { type: 'function_call_output', call_id: 'c1', output: JSON.stringify({ type: 'error', content: 'nope', index: 0 }) },
        { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Sorry' }] },
      ],
    } as TypedChatMessages;
    expect(chatItems(chat)).toEqual([
      { kind: 'user', text: 'Hi' },
      { kind: 'tool', label: 'read 3d', done: true, error: 'nope' },
      { kind: 'assistant', text: 'Sorry' },
    ]);
  });
});
