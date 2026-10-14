import { createSignal } from 'solid-js';
import { type Model, Models } from 'llm-support-core';

/**
 * settings for the Review tool's LLM: the model and an API key per provider.
 * a per-browser preference, kept out of puzzles and the library backup (keys
 * are secrets). the reviewer notes are library data; see library.ts.
 */

export interface ReviewSettings {
  /** a model name from MODELS */
  model: string;
  /** API key per provider name */
  keys: Record<string, string>;
}

/** the models the library can stream from (its chat-completions providers aren't wired up) */
export const MODELS: readonly Model[] = Models.filter(m => m.provider.api !== 'openai-chat-completion');

const DEFAULT_MODEL = MODELS.find(m => m.name === 'claude-sonnet-5-5')?.name ?? MODELS[0].name;

const KEY = 'cross:review';

const read = (): ReviewSettings => {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
    const keys: Record<string, string> = {};
    if (raw.keys && typeof raw.keys === 'object') {
      for (const [k, v] of Object.entries(raw.keys)) if (typeof v === 'string') keys[k] = v;
    }
    return {
      model: MODELS.some(m => m.name === raw.model) ? raw.model : DEFAULT_MODEL,
      keys,
    };
  }
  catch {
    return { model: DEFAULT_MODEL, keys: {} };
  }
};

const [reviewSettings, setSettingsSignal] = createSignal<ReviewSettings>(read());

export { reviewSettings };

export const setReviewSettings = (patch: Partial<ReviewSettings>) => {
  const next = { ...reviewSettings(), ...patch };
  setSettingsSignal(next);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  }
  catch {
    // preference only
  }
};

export const findModel = (name: string) => MODELS.find(m => m.name === name) ?? MODELS[0];

/** a server on this machine needs no key */
export const isLocal = (model: Model) => /\/\/(localhost|127\.0\.0\.1)\b/.test(model.provider.base_url ?? '');

/** the key to send for a model: the provider's, or a stand-in for a local server (the SDKs insist on one) */
export const apiKeyFor = (model: Model) => reviewSettings().keys[model.provider.name]?.trim() || (isLocal(model) ? 'local' : '');
