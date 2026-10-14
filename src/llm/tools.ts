// llm-support-core's modules, not its index: the index also loads its markdown renderer (highlight.js, KaTeX)
import type { GenericToolCall, IndexedToolResult } from 'llm-support-core/src/stream.ts';
import { defineTool } from 'llm-support-core/src/tool-definition.ts';
import { CreateToolExecutor, type ToolHandlerMap } from 'llm-support-core/src/tool-executor.ts';
import * as v from 'valibot';
import { describeEntry, describePuzzle, entryRef, resolveRef, type DescribedPuzzle } from '../model/describe';
import type { LightMap } from '../model/lights';
import type { Entries, Entry } from '../model/links';
import type { ClueStatus, LightKey } from '../model/types';

/**
 * what the reviewer's tools can see and do. the editor satisfies this; tests
 * pass a fake. to give the reviewer a new power, define the tool, add a
 * handler, and list it in TOOL_SET.
 */
export interface ReviewContext {
  puzzle: DescribedPuzzle;
  map(): LightMap;
  entries(): Entries;
  /** the selected answer; undefined in design mode */
  currentEntry(): Entry | undefined;
  setStatus(key: LightKey, status?: ClueStatus): void;
}

const ref = v.pipe(v.string(), v.description('The answer\'s reference, e.g. "5a", "12d" or "1/5"'));

const getPuzzle = defineTool(
  'get_puzzle',
  'Read the whole puzzle: title, grid, and every answer with its enumeration, current letters ("." = empty), clue, review mark and explanation.',
  v.object({}),
);

const getEntry = defineTool(
  'get_entry',
  'Read one answer in detail, including which squares are checked by crossing answers.',
  v.object({ ref }),
);

const getSelection = defineTool(
  'get_selection',
  'Read the answer the setter has selected in the grid, if any. Use this when they say "this clue".',
  v.object({}),
);

/** the reviewer's names for marks; plainer than the stored ones */
const MARKS = { needs_work: 'rework', not_sure: 'unsure', good: 'good', none: undefined } as const;

const setMark = defineTool(
  'set_mark',
  'Set the review mark shown beside a clue: needs_work (red), not_sure (yellow), good (green), or none to clear it. Only do this when the setter asks you to mark clues.',
  v.object({
    ref,
    mark: v.picklist(Object.keys(MARKS) as Array<keyof typeof MARKS>),
  }),
);

export const TOOL_SET = [getPuzzle, getEntry, getSelection, setMark];

const text = (content: string) => ({ type: 'object' as const, content });
const error = (content: string) => ({ type: 'error' as const, content });

const lookup = (ctx: ReviewContext, r: string) => resolveRef(r, ctx.map(), ctx.entries());

export const HANDLERS: ToolHandlerMap<ReviewContext> = {
  get_puzzle: ctx => text(describePuzzle(ctx.puzzle, ctx.map(), ctx.entries())),

  get_entry: (ctx, input: { ref: string }) => {
    const entry = lookup(ctx, input.ref);
    return 'error' in entry ? error(entry.error) : text(describeEntry(ctx.puzzle, ctx.map(), ctx.entries(), entry));
  },

  get_selection: ctx => {
    const entry = ctx.currentEntry();
    return entry
      ? text(describeEntry(ctx.puzzle, ctx.map(), ctx.entries(), entry))
      : text('Nothing is selected (the grid may be in design mode).');
  },

  set_mark: (ctx, input: { ref: string; mark: keyof typeof MARKS }) => {
    const entry = lookup(ctx, input.ref);
    if ('error' in entry) return error(entry.error);
    ctx.setStatus(entry.key, MARKS[input.mark]);
    return text(`Marked ${entryRef(entry)} ${input.mark.replace('_', ' ')}.`);
  },
};

const execute = CreateToolExecutor(TOOL_SET, HANDLERS);

/**
 * Stream()'s tool callback: run each finished call against the puzzle.
 * partial calls (arguments still streaming) are ignored; none of these tools
 * shows anything while it's being written.
 */
export const runToolCalls = async (ctx: ReviewContext, calls: GenericToolCall[], partial?: boolean): Promise<IndexedToolResult[]> => {
  if (partial) return [];
  return Promise.all(
    calls.filter(Boolean).map(async call => {
      try {
        const result = await execute(ctx, { type: 'tool_use', name: call.name, input: call.params, id: '' });
        return { index: call.index, ...result };
      }
      catch (err) {
        return { index: call.index, type: 'error' as const, content: String(err) };
      }
    }),
  );
};

/** a short label for a tool call in the transcript: "read the puzzle", "marked 12d good" */
export const describeCall = (name: string, input: unknown) => {
  let args: Record<string, unknown> = {};
  try {
    args = typeof input === 'string' ? (input ? JSON.parse(input) : {}) : ((input as Record<string, unknown>) ?? {});
  }
  catch {
    // arguments still streaming
  }
  const r = typeof args.ref === 'string' ? args.ref : '…';
  switch (name) {
    case 'get_puzzle': return 'read the puzzle';
    case 'get_entry': return `read ${r}`;
    case 'get_selection': return 'read the selection';
    case 'set_mark': return `marked ${r} ${typeof args.mark === 'string' ? args.mark.replace('_', ' ') : '…'}`;
    default: return name;
  }
};
