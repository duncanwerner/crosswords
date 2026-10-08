import type { Component } from 'solid-js';
import { AnagramsTool } from './AnagramsTool';
import { BlockedTool } from './BlockedTool';
import { ClueLogTool } from './ClueLogTool';
import { FillTool } from './FillTool';
import type { ToolProps } from './common';
import { RegexTool } from './RegexTool';
import { WordsTool } from './WordsTool';

/**
 * the tools shown in the dock, in tab order. to add one: write a component
 * taking ToolProps (see common.tsx for the dictionary gate, copy helper and
 * latest-only query runner) and list it here.
 */
export interface ToolDef {
  id: string;
  label: string;
  /** tooltip on the tab */
  description: string;
  Component: Component<ToolProps>;
}

export const TOOLS: ToolDef[] = [
  { id: 'words', label: 'Words', description: 'Words that fit the selected light', Component: WordsTool },
  { id: 'anagrams', label: 'Anagrams', description: 'Anagrams of the selected answer or any letters', Component: AnagramsTool },
  { id: 'regex', label: 'Regex', description: 'Search the dictionary with a regular expression', Component: RegexTool },
  { id: 'log', label: 'Clue log', description: "Clues you've saved, from every puzzle", Component: ClueLogTool },
  { id: 'fill', label: 'Auto-fill', description: 'Fill the empty squares with dictionary words', Component: FillTool },
  { id: 'blocked', label: 'Blocked', description: "Words this puzzle should never offer", Component: BlockedTool },
];
