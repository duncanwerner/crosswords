import { For, Match, Show, Switch, createEffect, createMemo, createSignal, flush, onSettled, useContext } from 'solid-js';
import { parseWordList } from '../../model/puzzle';
import { EditorContext } from '../../state/editor';
import { DICTIONARIES, settings } from '../../state/words';
import { words } from '../../words/client';
import type { FillResult } from '../../words/fill';
import type { FillProgress } from '../../words/protocol';
import { BlockButton, DictionaryGate, type ToolProps } from './common';
import styles from './tools.module.css';
import fill from './FillTool.module.css';

const TIME_LIMITS = [5, 15, 30, 60];

// options persist across puzzles for the session
const [timeLimit, setTimeLimit] = createSignal(15);
const [replaceAuto, setReplaceAuto] = createSignal(true);

type State =
  | { kind: 'idle' }
  | { kind: 'running'; progress?: FillProgress; cancel: () => void }
  | { kind: 'done'; result: FillResult; version: number; replaceAuto: boolean }
  | { kind: 'error'; message: string };

const seconds = (ms: number) => (ms < 1000 ? `${Math.max(1, Math.round(ms))} ms` : `${(ms / 1000).toFixed(1)} s`);

/**
 * auto-fill: fills empty squares with dictionary words. your letters stay;
 * earlier auto-fill letters can be replaced. results preview in the grid
 * until applied.
 */
export const FillTool = (props: ToolProps) => {
  const ed = useContext(EditorContext);
  const [state, setState] = createSignal<State>({ kind: 'idle' });
  const [requiredText, setRequiredText] = createSignal('');
  const pendingRequired = createMemo(() => parseWordList(requiredText()));

  const addRequired = (e: SubmitEvent) => {
    e.preventDefault();
    if (!pendingRequired().length) return;
    ed.requireWords(pendingRequired());
    setRequiredText('');
  };

  /** why a required word can't be placed, or that it's already in */
  const requiredNotes = createMemo(() => {
    const cells = ed.puzzle.cells;
    const lengths = new Set<number>();
    const inGrid = new Set<string>();
    for (const light of ed.map().lights) {
      lengths.add(light.length);
      const word = light.cells.map(i => cells[i].letter).join('');
      if (word.length === light.length) inGrid.add(word);
    }
    const notes = new Map<string, { text: string; warn: boolean }>();
    for (const word of ed.required()) {
      if (inGrid.has(word)) notes.set(word, { text: 'in grid', warn: false });
      else if (!lengths.has(word.length)) notes.set(word, { text: `no ${word.length}-letter light`, warn: true });
    }
    return notes;
  });

  const done = () => {
    const s = state();
    return s.kind === 'done' ? s : undefined;
  };
  /** the grid changed after this fill started, so its letters may not fit */
  const stale = () => {
    const d = done();
    return !!d && d.version !== ed.gridVersion();
  };

  /** cells the fill would write, and their letters */
  const changes = createMemo(() => {
    const d = done();
    if (!d) return undefined;
    const cells: number[] = [];
    let letters = '';
    ed.puzzle.cells.forEach((cell, i) => {
      const letter = d.result.letters[i];
      if (cell.block || !letter || letter === '.') return;
      if (cell.letter && !(cell.auto && d.replaceAuto)) return;
      cells.push(i);
      letters += letter;
    });
    return { cells, letters };
  });

  /** words the fill introduces, for review and blocking */
  const newWords = createMemo(() => {
    const d = done();
    const c = changes();
    if (!d || !c) return [];
    const touched = new Set(c.cells);
    const list: string[] = [];
    for (const light of ed.map().lights) {
      if (!light.cells.some(i => touched.has(i))) continue;
      const word = light.cells.map(i => d.result.letters[i]).join('');
      if (!word.includes('.')) list.push(word);
    }
    return list;
  });

  /**
   * the selected word, and what committing it would do: take its letters
   * from the previewed fill, and/or make its auto-fill letters yours
   */
  const selected = createMemo(() => {
    const entry = ed.currentEntry();
    if (!entry) return undefined;
    const c = changes();
    const d = done();
    const preview = c && d && !stale() ? new Set(c.cells) : undefined;
    const letters = entry.cells.map(i => (preview?.has(i) ? d!.result.letters[i] : '.')).join('');
    const cells = ed.puzzle.cells;
    const auto = entry.cells.some(i => cells[i].auto);
    const fromPreview = /[A-Z]/.test(letters);
    return { entry, letters, can: auto || fromPreview, label: `${entry.label} ${entry.lights[0].dir}` };
  });

  /** the fill agrees with the letters being committed, so its preview stays current */
  const commitSelected = () => {
    const s = selected();
    if (!s?.can) return;
    const d = done();
    const keepPreview = !!d && !stale();
    ed.commitLetters(s.entry.cells, s.letters);
    if (keepPreview) {
      flush();
      setState({ ...d!, version: ed.gridVersion() });
    }
    ed.focusGrid();
  };

  // show the result as ghost letters while it's current and this tab is open
  let previewing = false;
  createEffect(
    () => ({ c: changes(), d: done(), stale: stale(), active: props.active }),
    ({ c, d, stale, active }) => {
      if (c && d && !stale && active) {
        ed.setPreview({ cells: c.cells, word: c.letters, replaceAuto: d.replaceAuto });
        previewing = true;
      }
      else if (previewing) {
        ed.setPreview(undefined);
        previewing = false;
      }
    },
  );
  onSettled(() => () => {
    const s = state();
    if (s.kind === 'running') s.cancel();
    if (previewing) ed.setPreview(undefined);
  });

  const start = () => {
    const replace = replaceAuto() && ed.autoFilled() > 0;
    const cells = ed.puzzle.cells;
    const letters = cells.map(c => (!c.block && c.letter && !(replace && c.auto) ? c.letter : '.')).join('');
    const version = ed.gridVersion();
    const job = words.fill(
      {
        rows: ed.puzzle.rows,
        cols: ed.puzzle.cols,
        shape: cells.map(c => ({ block: c.block, barRight: c.barRight, barBottom: c.barBottom })),
        letters,
        required: ed.required(),
        seed: (Math.random() * 2 ** 31) | 0,
        timeMs: timeLimit() * 1000,
        blocked: ed.blocked(),
      },
      progress => setState(s => (s.kind === 'running' ? { ...s, progress } : s)),
    );
    setState({ kind: 'running', cancel: job.cancel });
    job.promise.then(
      result => setState({ kind: 'done', result, version, replaceAuto: replace }),
      (err: Error) => setState({ kind: 'error', message: err.message }),
    );
  };

  const apply = () => {
    const d = done();
    if (!d) return;
    ed.applyFill(d.result.letters, d.replaceAuto);
    setState({ kind: 'idle' });
  };

  const showLight = (key: string) => {
    const light = ed.map().lights.find(l => l.key === key);
    if (!light) return;
    ed.setMode('fill');
    ed.selectLight(light);
    ed.focusGrid();
  };

  const dictionaryName = () => DICTIONARIES.find(d => d.value === settings().dictionary)?.label ?? '';

  const Hardest = (p: { result: FillResult }) => (
    <Show when={p.result.hardest}>
      {h => (
        <p>
          The sticking point was{' '}
          <button class={styles.link} onClick={() => showLight(h().key)}>{h().number} {h().dir}</button>
          . Try changing the grid or letters around it.
        </p>
      )}
    </Show>
  );

  return (
    <div class={styles.tool}>
      <div class={styles.bar}>
        <Show
          when={state().kind === 'running'}
          fallback={<button class="btn primary" onClick={start}>{done() ? 'Try another fill' : 'Fill grid'}</button>}
        >
          <button class="btn" onClick={() => { const s = state(); if (s.kind === 'running') s.cancel(); }}>Cancel</button>
        </Show>
        <Show when={selected()}>
          {s => (
            <button
              class="btn"
              disabled={!s().can || state().kind === 'running'}
              title={s().can
                ? `Make ${s().label} your own letters, so later fills keep it`
                : `${s().label} has no auto-fill letters to commit`}
              onClick={commitSelected}
            >
              Commit {s().label}
            </button>
          )}
        </Show>
        <label class={styles.label}>
          Time limit
          <select class="field" aria-label="Time limit" value={timeLimit()} onChange={e => setTimeLimit(+e.currentTarget.value)}>
            <For each={TIME_LIMITS}>{t => <option value={t}>{t} s</option>}</For>
          </select>
        </label>
        <Show when={ed.autoFilled()}>
          <label class={styles.label} title="Leave unticked to keep earlier auto-fill letters as if you had typed them">
            <input type="checkbox" checked={replaceAuto()} onChange={e => setReplaceAuto(e.currentTarget.checked)} />
            Replace earlier auto-fill
          </label>
        </Show>
      </div>
      <form class={styles.bar} onSubmit={addRequired}>
        <input
          class={['field', styles.grow, styles.mono, styles.upper]}
          placeholder="Required words (spaces or commas between)"
          aria-label="Required words"
          autocomplete="off"
          spellcheck={false}
          value={requiredText()}
          onInput={e => setRequiredText(e.currentTarget.value)}
        />
        <button class="btn" type="submit" disabled={!pendingRequired().length}>Require</button>
      </form>
      <Show when={ed.required().length}>
        <div class={[styles.chips, fill.required]}>
          <For each={ed.required()}>
            {word => (
              <span
                class={[styles.blockedChip, { [styles.warn]: requiredNotes().get(word)?.warn }]}
                title={requiredNotes().get(word)?.warn ? `${word} won't fit: ${requiredNotes().get(word)!.text}` : undefined}
              >
                {word}
                <Show when={requiredNotes().get(word)}>{note => <span class={styles.tag}>{note().text}</span>}</Show>
                <button class={styles.remove} aria-label={`Don't require ${word}`} title="Don't require" onClick={() => ed.unrequireWord(word)}>×</button>
              </span>
            )}
          </For>
        </div>
      </Show>
      <div class={styles.info}>
        <span>
          Fills empty squares from the {dictionaryName()} dictionary
          <Show when={ed.required().length}>, including every required word</Show>
          . No word repeats
          <Show when={ed.blocked().length}>, none of your {ed.blocked().length} blocked words</Show>
          , and your own letters stay put.
        </span>
        <Show when={ed.autoFilled()}>
          <button class={styles.link} onClick={() => ed.clearAutoFill()}>Clear auto-fill letters ({ed.autoFilled()})</button>
        </Show>
      </div>

      <div class={styles.results}>
        <DictionaryGate>
          <Switch>
            <Match when={state().kind === 'running' && (state() as { progress?: FillProgress })}>
              {s => (
                <div class={fill.status}>
                  <Show when={s().progress} fallback={<p>Starting…</p>}>
                    {p => (
                      <>
                        <div class={fill.meter}><div style={{ width: `${(p().filled / Math.max(1, p().total)) * 100}%` }} /></div>
                        <p>
                          Searching… best so far {p().filled} of {p().total} lights · {p().nodes.toLocaleString()} tries
                          {p().restarts ? ` · ${p().restarts} restarts` : ''} · {seconds(p().ms)}
                        </p>
                      </>
                    )}
                  </Show>
                </div>
              )}
            </Match>
            <Match when={state().kind === 'error' && (state() as { message: string })}>
              {s => <div class={[styles.message, styles.error]}>{s().message}</div>}
            </Match>
            <Match when={done()}>
              {d => (
                <div class={fill.status}>
                  <Switch>
                    <Match when={d().result.total === 0}>
                      <p>Every light is already filled.</p>
                    </Match>
                    <Match when={d().result.status === 'complete'}>
                      <p class={fill.ok}>✓ Filled all {d().result.total} lights in {seconds(d().result.ms)}. It's previewed in the grid.</p>
                    </Match>
                    <Match when={d().result.status === 'impossible'}>
                      <p class={fill.bad}>{d().result.message}</p>
                      <Hardest result={d().result} />
                    </Match>
                    <Match when={true}>
                      <p class={fill.bad}>
                        {d().result.status === 'cancelled' ? 'Stopped' : `Couldn't finish in ${timeLimit()} s`}. The best attempt fills{' '}
                        {d().result.filled} of {d().result.total} lights.
                      </p>
                      <Hardest result={d().result} />
                      <p class={fill.tip}>A longer time limit or a bigger dictionary can help.</p>
                    </Match>
                  </Switch>
                  <Show when={stale()}>
                    <p class={fill.bad}>The grid has changed since this fill. Run it again.</p>
                  </Show>
                  <Show when={!stale() && changes()?.cells.length}>
                    <div class={fill.actions}>
                      <button class="btn primary" onClick={apply}>
                        {d().result.status === 'complete' ? 'Apply' : 'Apply partial fill'}
                      </button>
                      <button class="btn ghost" onClick={() => setState({ kind: 'idle' })}>Discard</button>
                    </div>
                  </Show>
                  <Show when={!stale() && newWords().length}>
                    <div class={styles.group}>
                      <h4>New words <span>({newWords().length}) · ⊘ to block, then try another</span></h4>
                      <div class={styles.chips}>
                        <For each={newWords()}>
                          {word => (
                            <span class={[styles.blockable, styles.chip, { [fill.blocked]: ed.blocked().includes(word) }]}>
                              {word}
                              <BlockButton word={word} onBlock={w => ed.blockWords([w])} />
                            </span>
                          )}
                        </For>
                      </div>
                    </div>
                  </Show>
                </div>
              )}
            </Match>
            <Match when={true}>
              <div class={styles.help}>
                <p>The fill can use any word in the dictionary, so some will be obscure. The Standard dictionary gives more familiar words; block any you don't want and try another fill.</p>
                <p>Required words must all go in, each in a light of its own, even if they aren't in the dictionary. If they can't, the fill stops and says why.</p>
                <p>Auto-filled letters are shown in blue. Typing over one makes it yours, and <strong>Commit</strong> makes the selected word yours, so later fills keep it. That works on a previewed fill too.</p>
              </div>
            </Match>
          </Switch>
        </DictionaryGate>
      </div>
    </div>
  );
};
