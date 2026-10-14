import type { TypedChatMessages } from 'llm-support-core';

/**
 * review chats, one per puzzle, kept in this browser only. a chat is in
 * its provider's own message format, so it only continues with a model
 * that speaks the same API.
 */

export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export const chatKey = (puzzleId: string) => `cross:chat:${puzzleId}`;

const API_TYPES = ['anthropic', 'gemini', 'openai-responses'];

const defaultStorage = (): StorageLike | undefined => {
  try {
    return globalThis.localStorage;
  }
  catch {
    return undefined;
  }
};

export const loadChat = (puzzleId: string, storage = defaultStorage()): TypedChatMessages | undefined => {
  try {
    const raw = JSON.parse(storage?.getItem(chatKey(puzzleId)) || 'null');
    if (raw && API_TYPES.includes(raw.type) && Array.isArray(raw.messages) && raw.messages.length) return raw;
  }
  catch {
    // a damaged chat is just dropped
  }
  return undefined;
};

export const saveChat = (puzzleId: string, chat: TypedChatMessages, storage = defaultStorage()) => {
  try {
    if (chat.messages.length) storage?.setItem(chatKey(puzzleId), JSON.stringify(chat));
    else storage?.removeItem(chatKey(puzzleId));
  }
  catch (err) {
    console.error('saving the review chat failed', err);
  }
};

export const removeChat = (puzzleId: string, storage = defaultStorage()) => {
  try {
    storage?.removeItem(chatKey(puzzleId));
  }
  catch {
    // ignore
  }
};
