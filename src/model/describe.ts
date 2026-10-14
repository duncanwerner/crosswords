import { display } from './enumeration';
import type { LightMap } from './lights';
import { type Entries, type Entry, formatRef } from './links';
import type { Cell, ClueEntry, Light, LightKey, Puzzle } from './types';

/**
 * plain-text views of a puzzle, for an LLM reviewer. terse on purpose:
 * one line per entry, so a whole puzzle fits a small context window.
 */

export type DescribedPuzzle = Pick<Puzzle, 'title' | 'setter' | 'rows' | 'cols' | 'style' | 'cells' | 'clues'>;

const MARK: Record<string, string> = { rework: 'needs work', unsure: 'not sure', good: 'good' };

/** an entry's ref, "5a" or "12d", from its head light */
export const entryRef = (entry: Entry) => formatRef(entry.lights[0]);

/** where a light starts, "r1c3": row and column from 1, top left */
export const startSquare = (light: Light) => `r${light.row + 1}c${light.col + 1}`;

/** letters so far, '.' for an empty square */
export const entryPattern = (cells: readonly Cell[], entry: Entry) =>
  entry.cells.map(i => cells[i].letter || '.').join('');

const quote = (s: string) => JSON.stringify(s.trim());

/**
 * one line: ref, start square, label and direction, enumeration, letters,
 * clue, mark, explanation. the start square saves a model from counting
 * across the grid text to place an answer, which they do badly.
 */
const entryLine = (puzzle: DescribedPuzzle, entry: Entry) => {
  const head = entry.lights[0];
  const clue: ClueEntry | undefined = puzzle.clues[entry.key];
  const parts = [
    `${entryRef(entry)} ${startSquare(head)}`,
    entry.lights.length > 1 ? `(${entry.label} ${head.dir})` : '',
    display(clue?.enumeration ?? '', entry.cells.length),
    entryPattern(puzzle.cells, entry),
    clue?.text.trim() ? `clue: ${quote(clue.text)}` : 'clue: none',
    clue?.status ? `mark: ${MARK[clue.status]}` : '',
    clue?.explanation?.trim() ? `explanation: ${quote(clue.explanation)}` : '',
  ];
  return parts.filter(Boolean).join(' ');
};

/** the grid, a row per line: '#' block, '.' empty, else the letter; '|' marks a bar to a cell's right */
export const describeGrid = (puzzle: DescribedPuzzle) => {
  const lines: string[] = [];
  const below: string[] = [];
  for (let r = 0; r < puzzle.rows; r++) {
    let line = '';
    for (let c = 0; c < puzzle.cols; c++) {
      const cell = puzzle.cells[r * puzzle.cols + c];
      line += cell.block ? '#' : cell.letter || '.';
      if (cell.barRight && c < puzzle.cols - 1) line += '|';
      if (cell.barBottom && r < puzzle.rows - 1) below.push(`r${r + 1}c${c + 1}`);
    }
    lines.push(line);
  }
  if (below.length) lines.push(`bars below: ${below.join(' ')}`);
  return lines.join('\n');
};

/** the whole puzzle: heading, grid, then every entry in order (across, then down) */
export const describePuzzle = (puzzle: DescribedPuzzle, map: LightMap, entries: Entries) => {
  const filled = puzzle.cells.filter(c => !c.block && c.letter).length;
  const white = puzzle.cells.filter(c => !c.block).length;
  const heading = [
    `Title: ${puzzle.title.trim() ? quote(puzzle.title) : 'untitled'}${puzzle.setter.trim() ? ` by ${puzzle.setter.trim()}` : ''}`,
    `${puzzle.rows}x${puzzle.cols} ${puzzle.style} grid, ${filled}/${white} squares filled, ${entries.list.length} answers`,
  ];
  const across = entries.list.filter(e => e.lights[0].dir === 'across');
  const down = entries.list.filter(e => e.lights[0].dir === 'down');
  const members = map.lights.filter(l => entries.byLight.get(l.key)?.key !== l.key);
  return [
    ...heading,
    '',
    'Grid (# block, . empty, | bar; rows and columns count from 1 at the top left, so r1c3 is row 1, column 3):',
    describeGrid(puzzle),
    '',
    'Across:',
    ...across.map(e => entryLine(puzzle, e)),
    '',
    'Down:',
    ...down.map(e => entryLine(puzzle, e)),
    ...(members.length
      ? ['', `Linked: ${members.map(l => `${formatRef(l)} ${startSquare(l)} see ${entryRef(entries.byLight.get(l.key)!)}`).join(', ')}`]
      : []),
  ].join('\n');
};

/** one entry in detail, with what crosses each square */
export const describeEntry = (puzzle: DescribedPuzzle, map: LightMap, entries: Entries, entry: Entry) => {
  const crossings = entry.cells.map((cell, i) => {
    const own = entry.lights.find(l => l.cells.includes(cell))!;
    const other = own.dir === 'across' ? map.down[cell] : map.across[cell];
    const letter = puzzle.cells[cell].letter || '.';
    if (other < 0) return `${i + 1} ${letter} unchecked`;
    const crossing = entries.byLight.get(map.lights[other].key);
    return `${i + 1} ${letter} crosses ${formatRef(map.lights[other])}${crossing && crossing.key !== map.lights[other].key ? ` (part of ${entryRef(crossing)})` : ''}`;
  });
  return [entryLine(puzzle, entry), `Squares: ${crossings.join('; ')}`].join('\n');
};

const REF = /^\s*(\d+)\s*(a|ac|acr|across|d|dn|down)?\b/i;

/**
 * the entry a ref names: "5a", "5 across", "5ac", "12d", "1/5", "1/5 down".
 * a bare number is fine when only one light has it.
 */
export const resolveRef = (text: string, map: LightMap, entries: Entries): Entry | { error: string } => {
  // a linked answer's label ("1/5", "1/5 down") picks out its head, even where 1 is also down
  const label = text.trim().toLowerCase().replace(/\s+/g, ' ');
  if (label.includes('/')) {
    const linked = entries.list.find(e => e.label === label || `${e.label} ${e.lights[0].dir}` === label);
    if (linked) return linked;
  }
  // otherwise the head is the first number; any direction after a '/' belongs to a later part
  const m = REF.exec(text.split('/')[0]);
  if (!m) return { error: `Couldn't read "${text}". Use refs like 5a or 12d.` };
  const number = Number(m[1]);
  const dir = m[2] ? (m[2][0].toLowerCase() === 'a' ? 'across' : 'down') : undefined;
  const matches = map.lights.filter(l => l.number === number && (!dir || l.dir === dir));
  if (!matches.length) return { error: `There's no ${number}${dir ? ` ${dir}` : ''}.` };
  if (matches.length > 1) return { error: `${number} is both across and down. Say ${number}a or ${number}d.` };
  const entry = entries.byLight.get(matches[0].key as LightKey);
  return entry ?? { error: `There's no ${number}${dir ? ` ${dir}` : ''}.` };
};
