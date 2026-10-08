import { For, Repeat, Show, createMemo, createSignal, onSettled, untrack, useContext } from 'solid-js';
import { toLetters } from '../model/ascii';
import { breaks, validate } from '../model/enumeration';
import { lightAt } from '../model/lights';
import { advance, move, nextLight, step } from '../model/navigation';
import type { FeatureAt } from '../model/symmetry';
import type { Direction } from '../model/types';
import { EditorContext } from '../state/editor';
import styles from './GridView.module.css';

/** cell size in SVG units */
const S = 32;
/** how close to an edge (fraction of a cell) a click must be to hit a bar */
const EDGE = 0.25;

const ARROWS: Record<string, { dRow: number; dCol: number; dir: Direction }> = {
  ArrowLeft: { dRow: 0, dCol: -1, dir: 'across' },
  ArrowRight: { dRow: 0, dCol: 1, dir: 'across' },
  ArrowUp: { dRow: -1, dCol: 0, dir: 'down' },
  ArrowDown: { dRow: 1, dCol: 0, dir: 'down' },
};

/** the bar feature on a given side of a cell, normalized to right/bottom bars */
const barOnSide = (row: number, col: number, side: 'left' | 'right' | 'top' | 'bottom'): FeatureAt => {
  switch (side) {
    case 'right': return { feature: 'barRight', row, col };
    case 'left': return { feature: 'barRight', row, col: col - 1 };
    case 'bottom': return { feature: 'barBottom', row, col };
    case 'top': return { feature: 'barBottom', row: row - 1, col };
  }
};

export const GridView = () => {
  const ed = useContext(EditorContext);
  const p = ed.puzzle;
  // dimensions are fixed for the life of an editor
  const rows = untrack(() => p.rows);
  const cols = untrack(() => p.cols);

  let svg!: SVGSVGElement;
  let input!: HTMLInputElement;

  const [focused, setFocused] = createSignal(false);
  const [hover, setHover] = createSignal<FeatureAt>();

  const barred = () => p.style === 'barred';
  const design = () => ed.mode() === 'design';

  const highlight = createMemo(() => new Set(ed.currentLight()?.cells ?? []));

  /** an auto-fill preview that will replace earlier auto letters hides them */
  const hideAuto = () => !!ed.preview()?.replaceAuto;

  /** cell -> ghost letter from a hovered suggestion or fill preview */
  const ghosts = createMemo(() => {
    const map = new Map<number, string>();
    const pv = ed.preview();
    pv?.cells.forEach((cell, i) => map.set(cell, pv.word[i]));
    return map;
  });

  /** word breaks and hyphens from valid enumerations */
  const breakMarks = createMemo(() => {
    const marks: Array<{ cell: number; dir: Direction; type: ',' | '-' }> = [];
    for (const light of ed.map().lights) {
      const text = p.clues[light.key]?.enumeration ?? '';
      if (validate(text, light.length) !== 'ok') continue;
      for (const b of breaks(text)) {
        if (b.after < light.length - 1) marks.push({ cell: light.cells[b.after], dir: light.dir, type: b.type });
      }
    }
    return marks;
  });

  /** right/bottom bars to draw, ignoring the outer edge */
  const bars = createMemo(() => {
    const list: FeatureAt[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cell = p.cells[r * cols + c];
        if (cell.barRight && c < cols - 1) list.push({ feature: 'barRight', row: r, col: c });
        if (cell.barBottom && r < rows - 1) list.push({ feature: 'barBottom', row: r, col: c });
      }
    }
    return list;
  });

  const focus = () => input.focus({ preventScroll: true });
  ed.registerGridFocus(focus);

  onSettled(() => {
    focus();
  });

  // --- pointer ---------------------------------------------------------

  const locate = (e: PointerEvent) => {
    const rect = svg.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * cols;
    const y = ((e.clientY - rect.top) / rect.height) * rows;
    const col = Math.min(cols - 1, Math.max(0, Math.floor(x)));
    const row = Math.min(rows - 1, Math.max(0, Math.floor(y)));
    return { row, col, fx: x - col, fy: y - row };
  };

  /** in barred design mode, the bar a pointer position would toggle */
  const barHit = (e: PointerEvent): FeatureAt | undefined => {
    if (!design() || !barred()) return undefined;
    const { row, col, fx, fy } = locate(e);
    const sides = [
      { side: 'left', d: fx }, { side: 'right', d: 1 - fx },
      { side: 'top', d: fy }, { side: 'bottom', d: 1 - fy },
    ] as const;
    const nearest = sides.reduce((a, b) => (b.d < a.d ? b : a));
    if (nearest.d > EDGE) return undefined;
    const bar = barOnSide(row, col, nearest.side);
    if (bar.row < 0 || bar.col < 0) return undefined;
    if (bar.feature === 'barRight' && bar.col >= cols - 1) return undefined;
    if (bar.feature === 'barBottom' && bar.row >= rows - 1) return undefined;
    return bar;
  };

  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    focus();
    const { row, col } = locate(e);
    const index = row * cols + col;

    if (design()) {
      const bar = barHit(e);
      if (bar) ed.toggleFeature(bar.feature, bar.row, bar.col);
      else if (!barred()) ed.toggleFeature('block', row, col);
      ed.select(index);
      return;
    }

    if (p.cells[index].block) return;
    const sel = ed.selection();
    if (sel.cell === index) toggleDirection();
    else ed.select(index);
  };

  // --- keyboard --------------------------------------------------------

  const toggleDirection = () => {
    const sel = ed.selection();
    const dir: Direction = sel.dir === 'across' ? 'down' : 'across';
    if (lightAt(ed.map(), sel.cell, dir)) ed.setSelection({ cell: sel.cell, dir });
  };

  const typeLetter = (letter: string) => {
    const sel = ed.selection();
    const light = lightAt(ed.map(), sel.cell, sel.dir);
    ed.setLetter(sel.cell, letter, `fill:${light?.key ?? sel.cell}`);
    ed.setSelection(advance(ed.map(), sel, 1));
  };

  const backspace = () => {
    const sel = ed.selection();
    const light = lightAt(ed.map(), sel.cell, sel.dir);
    const group = `fill:${light?.key ?? sel.cell}`;
    if (p.cells[sel.cell].letter) {
      ed.setLetter(sel.cell, '', group);
      return;
    }
    const prev = advance(ed.map(), sel, -1);
    ed.setSelection(prev);
    ed.setLetter(prev.cell, '', group);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return; // undo etc. handled by the editor
    const sel = ed.selection();
    const arrow = ARROWS[e.key];

    if (design()) {
      if (arrow) {
        e.preventDefault();
        const row = Math.floor(sel.cell / cols);
        const col = sel.cell % cols;
        if (e.shiftKey && barred()) {
          const side = ({ ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'top', ArrowDown: 'bottom' } as const)[e.key as 'ArrowLeft'];
          const bar = barOnSide(row, col, side);
          ed.toggleFeature(bar.feature, bar.row, bar.col);
        }
        else ed.select(step(p, sel.cell, arrow.dRow, arrow.dCol));
      }
      else if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        ed.toggleFeature('block', Math.floor(sel.cell / cols), sel.cell % cols);
      }
      return;
    }

    if (arrow) {
      e.preventDefault();
      if (sel.dir !== arrow.dir && lightAt(ed.map(), sel.cell, arrow.dir)) {
        ed.setSelection({ cell: sel.cell, dir: arrow.dir });
      }
      else ed.select(move(p, sel.cell, arrow.dRow, arrow.dCol), arrow.dir);
    }
    else if (/^[a-z]$/i.test(e.key)) {
      e.preventDefault();
      typeLetter(e.key.toUpperCase());
    }
    else if (e.key === 'Backspace') {
      e.preventDefault();
      backspace();
    }
    else if (e.key === 'Delete') {
      e.preventDefault();
      const light = lightAt(ed.map(), sel.cell, sel.dir);
      ed.setLetter(sel.cell, '', `fill:${light?.key ?? sel.cell}`);
    }
    else if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      toggleDirection();
    }
    else if (e.key === 'Tab') {
      e.preventDefault();
      const next = nextLight(ed.map(), ed.currentLight(), e.shiftKey ? -1 : 1);
      if (next) ed.selectLight(next);
    }
    else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      const light = ed.currentLight();
      if (light) ed.selectLight(light, light.cells[e.key === 'Home' ? 0 : light.length - 1]);
    }
  };

  /** mobile keyboards often send 'Unidentified' keydowns; pick letters up here instead */
  const onInput = () => {
    const letters = toLetters(input.value);
    input.value = '';
    if (design()) return;
    for (const letter of letters) typeLetter(letter);
  };

  // --- render ----------------------------------------------------------

  const x = (i: number) => (i % cols) * S;
  const y = (i: number) => Math.floor(i / cols) * S;

  const barLine = (f: FeatureAt) =>
    f.feature === 'barRight'
      ? { x1: (f.col + 1) * S, y1: f.row * S, x2: (f.col + 1) * S, y2: (f.row + 1) * S }
      : { x1: f.col * S, y1: (f.row + 1) * S, x2: (f.col + 1) * S, y2: (f.row + 1) * S };

  return (
    <div class={styles.wrap}>
      <svg
        ref={svg}
        class={[styles.svg, { [styles.design]: design(), [styles.barred]: design() && barred(), [styles.unfocused]: !focused() }]}
        viewBox={`-2 -2 ${cols * S + 4} ${rows * S + 4}`}
        role="grid"
        aria-label="Crossword grid"
        onPointerDown={onPointerDown}
        onPointerMove={e => setHover(barHit(e))}
        onPointerLeave={() => setHover(undefined)}
      >
        <Repeat count={rows * cols}>
          {i => (
            <g>
              <rect
                x={x(i)}
                y={y(i)}
                width={S}
                height={S}
                class={[styles.cell, {
                  [styles.block]: p.cells[i].block,
                  [styles.light]: highlight().has(i),
                  [styles.selected]: ed.selection().cell === i,
                  [styles.flagged]: ed.flagged().has(i),
                }]}
              />
              <Show when={!p.cells[i].block && ed.map().numbers[i]}>
                <text class={styles.number} x={x(i) + 2} y={y(i) + 9}>{ed.map().numbers[i]}</text>
              </Show>
              <Show when={!p.cells[i].block && p.cells[i].letter && !(p.cells[i].auto && hideAuto())}>
                <text class={[styles.letter, { [styles.auto]: p.cells[i].auto }]} x={x(i) + S / 2} y={y(i) + S / 2 + 3}>{p.cells[i].letter}</text>
              </Show>
              <Show when={!p.cells[i].block && (!p.cells[i].letter || (p.cells[i].auto && hideAuto())) && ghosts().get(i)}>
                <text class={[styles.letter, styles.ghost]} x={x(i) + S / 2} y={y(i) + S / 2 + 3}>{ghosts().get(i)}</text>
              </Show>
            </g>
          )}
        </Repeat>

        <For each={breakMarks()}>
          {m => {
            const right = x(m.cell) + S;
            const bottom = y(m.cell) + S;
            const midX = x(m.cell) + S / 2;
            const midY = y(m.cell) + S / 2;
            if (m.type === ',') {
              return m.dir === 'across'
                ? <line class={styles.wordBreak} x1={right} y1={y(m.cell)} x2={right} y2={bottom} />
                : <line class={styles.wordBreak} x1={x(m.cell)} y1={bottom} x2={x(m.cell) + S} y2={bottom} />;
            }
            return m.dir === 'across'
              ? <line class={styles.hyphen} x1={right - 5} y1={midY} x2={right + 5} y2={midY} />
              : <line class={styles.hyphen} x1={midX} y1={bottom - 5} x2={midX} y2={bottom + 5} />;
          }}
        </For>

        <For each={bars()}>
          {b => <line class={styles.bar} {...barLine(b)} />}
        </For>

        <Show when={hover()}>
          {h => <line class={styles.preview} {...barLine(h())} />}
        </Show>

        <rect class={styles.border} x={0} y={0} width={cols * S} height={rows * S} />
      </svg>

      <input
        ref={input}
        class={styles.input}
        aria-label="Grid input"
        data-grid-input
        autocomplete="off"
        autocapitalize="characters"
        spellcheck={false}
        onKeyDown={onKeyDown}
        onInput={onInput}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
    </div>
  );
};
