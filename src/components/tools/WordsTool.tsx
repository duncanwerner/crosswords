import { For, Match, Show, Switch, createEffect, createMemo, createSignal, onSettled, useContext } from 'solid-js';
import { toLetters } from '../../model/ascii';
import { lightAt } from '../../model/lights';
import type { Light } from '../../model/types';
import { EditorContext } from '../../state/editor';
import { status } from '../../state/words';
import { words } from '../../words/client';
import type { Crossing, SuggestResult, Suggestion } from '../../words/protocol';
import { FLAG_ABBREVIATION, FLAG_PROPER } from '../../words/word-index';
import { DictionaryGate, type ToolProps, latestOnly } from './common';
import shared from './tools.module.css';
import styles from './WordsTool.module.css';

const LIMIT = 200;

interface Query {
  key: string;
  cells: number[];
  pattern: string;
  crossings: Crossing[];
  used: string[];
}

/** crossing health in 0-4 bars from the fewest options left to any crossing */
const bars = (min: number) => (min === Infinity ? 4 : min === 0 ? 0 : min < 3 ? 1 : min < 10 ? 2 : min < 50 ? 3 : 4);

/** fill helper: words that fit the selected light, ranked by what they leave the crossings */
export const WordsTool = (props: ToolProps) => {
  const ed = useContext(EditorContext);
  const [filter, setFilter] = createSignal('');
  const [result, setResult] = createSignal<{ query: Query; filter: string; result: SuggestResult }>();
  const [error, setError] = createSignal('');

  onSettled(() => () => ed.setPreview(undefined));

  /** the current light, its crossings at empty cells, and words already used */
  const query = createMemo<Query | undefined>(
    () => {
      const light = ed.currentLight();
      if (!light) return undefined;
      const map = ed.map();
      const cells = ed.puzzle.cells;
      const patternOf = (l: Light) => l.cells.map(i => cells[i].letter || '.').join('');
      const crossings: Crossing[] = [];
      light.cells.forEach((cell, index) => {
        if (cells[cell].letter) return;
        const cross = lightAt(map, cell, light.dir === 'across' ? 'down' : 'across');
        if (cross) crossings.push({ index, pattern: patternOf(cross), position: cross.cells.indexOf(cell) });
      });
      const used = map.lights
        .filter(l => l.key !== light.key)
        .map(patternOf)
        .filter(w => !w.includes('.'));
      return { key: light.key, cells: light.cells, pattern: patternOf(light), crossings, used };
    },
    { equals: (a, b) => JSON.stringify(a) === JSON.stringify(b) },
  );

  const run = latestOnly();
  createEffect(
    () => ({ q: query(), f: filter(), s: status(), active: props.active }),
    ({ q, f, s, active }) => {
      if (!active || !q || s.state !== 'ready') return;
      run(
        () => words.suggest({ pattern: q.pattern, crossings: q.crossings, used: q.used, filter: f, limit: LIMIT }),
        r => {
          setError('');
          setResult({ query: q, filter: f, result: r });
        },
        err => setError(err.message),
      );
    },
  );

  const current = () => {
    const r = result();
    return r && r.query.key === query()?.key ? r : undefined;
  };
  const stale = () => {
    const r = current();
    return !r || r.query !== query() || r.filter !== filter();
  };

  const choose = (s: Suggestion) => {
    const light = ed.currentLight();
    if (!light) return;
    ed.setPreview(undefined);
    ed.fillLight(light, s.word);
    ed.focusGrid();
  };

  const hover = (s?: Suggestion) => {
    const q = query();
    ed.setPreview(s && q ? { cells: q.cells, word: s.word } : undefined);
  };

  return (
    <div class={shared.tool}>
      <div class={shared.bar}>
        <input
          class={['field', shared.grow, shared.upper]}
          placeholder="Filter (contains…)"
          aria-label="Filter suggestions"
          value={filter()}
          onInput={e => setFilter(toLetters(e.currentTarget.value))}
        />
      </div>
      <Show when={query()}>
        {q => (
          <div class={shared.info}>
            <strong aria-label="Pattern">{q().pattern.replace(/\./g, '·')}</strong>
            <span>{ed.currentLight()?.number} {ed.currentLight()?.dir}</span>
            <Show when={current()}>
              {r => (
                <span>
                  · {r().result.matched.toLocaleString()} {r().result.matched === 1 ? 'word fits' : 'words fit'}
                  <Show when={r().result.matched !== r().result.viable && r().query.crossings.length}>
                    {' '}· {r().result.viable.toLocaleString()} keep every crossing open
                  </Show>
                </span>
              )}
            </Show>
          </div>
        )}
      </Show>

      <DictionaryGate>
        <Switch>
          <Match when={error()}>
            <div class={[shared.message, shared.error]}>{error()}</div>
          </Match>
          <Match when={!query()}>
            <div class={shared.message}>
              <p>Select a light in Fill mode to see words that fit.</p>
              <Show when={ed.mode() === 'design'}>
                <button class="btn" onClick={() => { ed.setMode('fill'); ed.focusGrid(); }}>Switch to Fill</button>
              </Show>
            </div>
          </Match>
          <Match when={current()}>
            {r => (
              <Show
                when={r().result.items.length}
                fallback={<div class={shared.message}>No words fit {r().query.pattern.replace(/\./g, '·')}.</div>}
              >
                <div class={[shared.results, { [shared.stale]: stale() }]}>
                  <ul class={styles.list} onPointerLeave={() => hover()}>
                    <For each={r().result.items} keyed={s => s.word}>
                      {s => <SuggestionRow item={s()} pattern={r().query.pattern} onChoose={choose} onHover={hover} />}
                    </For>
                  </ul>
                  <Show when={r().result.matched > r().result.items.length}>
                    <div class={shared.note}>
                      Showing the best {r().result.items.length} of {r().result.matched.toLocaleString()}; filter to narrow down.
                    </div>
                  </Show>
                </div>
              </Show>
            )}
          </Match>
        </Switch>
      </DictionaryGate>
    </div>
  );
};

const SuggestionRow = (props: {
  item: Suggestion;
  pattern: string;
  onChoose: (s: Suggestion) => void;
  onHover: (s?: Suggestion) => void;
}) => {
  const level = () => bars(props.item.min);
  const letters = () => props.item.word.split('').map((ch, i) => ({ ch, fixed: props.pattern[i] !== '.' }));
  const title = () =>
    props.item.min === 0 ? 'Leaves a crossing light with no words'
      : props.item.min === Infinity ? 'No open crossings'
      : `Every crossing keeps at least ${props.item.min} option${props.item.min === 1 ? '' : 's'}`;

  return (
    <li class={{ [styles.dead]: props.item.min === 0 }}>
      <button
        class={styles.item}
        onClick={() => props.onChoose(props.item)}
        onPointerEnter={() => props.onHover(props.item)}
        onFocus={() => props.onHover(props.item)}
        onBlur={() => props.onHover()}
      >
        <span class={styles.word}>
          <For each={letters()} keyed={false}>
            {l => <span class={{ [styles.fixed]: l().fixed }}>{l().ch}</span>}
          </For>
        </span>
        <span>
          <Show when={props.item.used}><span class={[styles.tag, styles.used]}>in grid</span></Show>
          <Show when={props.item.flags & FLAG_PROPER}><span class={styles.tag}>proper</span></Show>
          <Show when={props.item.flags & FLAG_ABBREVIATION}><span class={styles.tag}>abbr.</span></Show>
        </span>
        <span class={[styles.meter, { [styles.low]: level() === 1, [styles.dead]: level() === 0 }]} title={title()}>
          <For each={[1, 2, 3, 4]}>{n => <i class={{ [styles.on]: n <= level() }} />}</For>
        </span>
      </button>
    </li>
  );
};
