import { createSignal } from 'solid-js';
import { AbortStream, AddUserChatMessage, type Model, Stream, type TypedChatMessages } from 'llm-support-core';
import LLMWorker from 'llm-support-core/worker?worker';
import { loadChat, removeChat, saveChat } from '../llm/history';
import { systemPrompt } from '../llm/prompt';
import { type ReviewContext, TOOL_SET, runToolCalls } from '../llm/tools';
import { reviewNotes } from './library';
import { apiKeyFor } from './review';

const SAVE_DELAY = 500;

const emptyChat = (model: Model) => ({ type: model.provider.api, messages: [] }) as unknown as TypedChatMessages;

/**
 * one puzzle's review chat. Stream() edits the transcript it's given in place
 * and calls back after each batch of writes; we hand it a plain working copy
 * and publish a fresh clone each time, so the signal never shares objects
 * with the stream.
 */
export const createReviewSession = (puzzleId: string, ctx: ReviewContext) => {
  const [chat, setChat] = createSignal<TypedChatMessages | undefined>(loadChat(puzzleId));
  const [busy, setBusy] = createSignal(false);

  let worker: Worker | undefined;
  /** bumped by New chat, so a stopped stream's last writes don't bring the old chat back */
  let generation = 0;
  let saveTimer: ReturnType<typeof setTimeout> | undefined;

  const save = () => {
    clearTimeout(saveTimer);
    saveTimer = undefined;
    const current = chat();
    if (current) saveChat(puzzleId, current);
  };

  const publish = (next: TypedChatMessages) => {
    setChat(structuredClone(next));
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, SAVE_DELAY);
  };

  /** the chat continues with this model only if it speaks the same API */
  const compatible = (model: Model) => {
    const current = chat();
    return !current?.messages.length || current.type === model.provider.api;
  };

  const send = async (text: string, model: Model) => {
    if (busy() || !text.trim()) return;
    const gen = ++generation;
    const update = (next: TypedChatMessages) => {
      if (gen === generation) publish(next);
    };
    const current = chat();
    const working: TypedChatMessages = current && compatible(model) ? structuredClone(current) : emptyChat(model);
    AddUserChatMessage(working, text.trim());
    publish(working);

    const api_key = apiKeyFor(model);
    if (!api_key) {
      working.messages.push({ type: 'client-side-error', message: `Add an API key for ${model.provider.name} in the settings (⚙).` });
      publish(working);
      return;
    }

    worker ??= new LLMWorker();
    setBusy(true);
    try {
      await Stream({
        worker,
        model,
        api_key,
        system_prompt: systemPrompt(reviewNotes()),
        messages: working,
        tools: TOOL_SET,
        tool_call_fn: (calls, partial) => runToolCalls(ctx, calls, partial),
        changed: update,
      });
    }
    catch (err) {
      working.messages.push({ type: 'client-side-error', message: err instanceof Error ? err.message : String(err) });
      update(working);
    }
    finally {
      if (gen === generation) setBusy(false);
    }
  };

  /** stop the reply: unwind the stream, and drop the worker so the request goes with it */
  const stop = () => {
    if (!busy()) return;
    AbortStream();
    worker?.terminate();
    worker = undefined;
  };

  const clear = () => {
    stop();
    generation++;
    setBusy(false);
    clearTimeout(saveTimer);
    saveTimer = undefined;
    setChat(undefined);
    removeChat(puzzleId);
  };

  const dispose = () => {
    stop();
    if (saveTimer) save();
    worker?.terminate();
    worker = undefined;
  };

  return { chat, busy, send, stop, clear, compatible, dispose };
};

export type ReviewSession = ReturnType<typeof createReviewSession>;
