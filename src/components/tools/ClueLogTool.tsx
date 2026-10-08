import { For, Match, Show, Switch, createMemo, createSignal, useContext } from 'solid-js';
import { type ClueRecord, searchLog } from '../../model/clue-log';
import { clueLog, clueLogStatus, deleteClue, exportClueLog, importClueLog, loadClueLog } from '../../state/clue-log';
import { EditorContext } from '../../state/editor';
import { CopyStatus, type ToolProps, createCopier } from './common';
import styles from './ClueLog.module.css';
import shared from './tools.module.css';

const dateFormat = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

/**
 * the clue log: clues saved from any puzzle, by answer. with nothing typed
 * it shows what you've written for the selected answer (or answers that
 * fit its letters so far); typing searches answers and clue text.
 */
export const ClueLogTool = (_props: ToolProps) => {
  const ed = useContext(EditorContext);
  const { copied, copy } = createCopier();
  const [query, setQuery] = createSignal('');
  const [message, setMessage] = createSignal('');
  let fileInput!: HTMLInputElement;

  /** the selected answer: its letters so far, as a pattern */
  const current = createMemo(() => {
    const entry = ed.currentEntry();
    if (!entry) return undefined;
    const pattern = entry.cells.map(i => ed.puzzle.cells[i].letter || '.').join('');
    return { entry, pattern, complete: !pattern.includes('.'), label: `${entry.label} ${entry.lights[0].dir}` };
  });

  const results = createMemo(() => {
    const q = query().trim();
    const list = clueLog().list;
    if (q) return searchLog(list, q);
    const c = current();
    if (!c) return list;
    if (c.complete) return clueLog().byWord.get(c.pattern) ?? [];
    // an empty light would match every answer of its length: not useful
    return /[A-Z]/.test(c.pattern) ? searchLog(list, c.pattern) : [];
  });

  const heading = () => {
    if (query().trim()) return `${results().length} matching`;
    const c = current();
    if (!c) return `All ${clueLog().list.length} saved clues`;
    if (c.complete) return `Your clues for ${c.pattern} (${c.label})`;
    return /[A-Z]/.test(c.pattern) ? `Answers fitting ${c.pattern.replace(/\./g, '·')} (${c.label})` : `${c.label} has no letters yet`;
  };

  /** put a logged clue into the selected answer's clue */
  const use = (r: ClueRecord) => {
    const c = current();
    if (!c) return;
    const patch: { text: string; enumeration?: string } = { text: r.clue };
    if (r.word === c.pattern) patch.enumeration = r.enumeration;
    ed.setClue(c.entry.key, patch);
  };

  const remove = (r: ClueRecord) => {
    if (!confirm(`Delete this clue for ${r.word} from the log?\n\n${r.clue}`)) return;
    deleteClue(r.id).catch((err: Error) => setMessage(err.message));
  };

  const onImport = async (file: File | undefined) => {
    if (!file) return;
    try {
      const n = await importClueLog(file);
      setMessage(n ? `Imported ${n} clue${n === 1 ? '' : 's'}.` : 'Nothing new to import.');
    }
    catch (err) {
      setMessage((err as Error).message);
    }
    fileInput.value = '';
  };

  return (
    <div class={shared.tool}>
      <div class={shared.bar}>
        <input
          class={['field', shared.grow]}
          placeholder="Search answers or clues (S?OP for patterns)"
          aria-label="Search the clue log"
          value={query()}
          onInput={e => setQuery(e.currentTarget.value)}
        />
        <Show when={query()}>
          <button class={shared.link} onClick={() => setQuery('')}>
            {current() ? 'Show selected answer' : 'Clear'}
          </button>
        </Show>
      </div>
      <div class={shared.info}><span>{heading()}</span></div>

      <Switch>
        <Match when={clueLogStatus().state === 'error'}>
          <div class={[shared.message, shared.error]}>
            <p>{(clueLogStatus() as { message: string }).message}</p>
            <button class="btn" onClick={() => loadClueLog()}>Retry</button>
          </div>
        </Match>
        <Match when={clueLogStatus().state !== 'ready'}>
          <div class={shared.message}>Loading clue log…</div>
        </Match>
        <Match when={!clueLog().list.length}>
          <div class={shared.message}>
            <p>No saved clues yet.</p>
            <p>Fill an answer, write its clue, then use <strong>Save to log</strong> on the clue.</p>
          </div>
        </Match>
        <Match when={!results().length}>
          <div class={shared.message}>
            {query().trim() || current()?.complete ? 'Nothing in the log matches.' : 'Select an answer, or search.'}
          </div>
        </Match>
        <Match when={true}>
          <ul class={[shared.results, styles.list]}>
            <For each={results()} keyed={r => r.id}>
              {r => (
                <li class={styles.item}>
                  <div class={styles.head}>
                    <span class={styles.word}>{r().word}</span>
                    <Show when={r().enumeration}><span class={styles.enum}>({r().enumeration})</span></Show>
                    <span class={styles.source}>
                      {r().puzzleTitle || 'Imported'}
                      <Show when={r().puzzleId === ed.puzzle.id}> (this puzzle)</Show>
                      {' · '}{dateFormat.format(r().saved)}
                    </span>
                  </div>
                  <p class={styles.clue}>{r().clue}</p>
                  <div class={styles.actions}>
                    <Show when={current()}>
                      <button class={shared.link} title={`Make this the clue for ${current()!.label}`} onClick={() => use(r())}>
                        Use for {current()!.entry.label}
                      </button>
                    </Show>
                    <button class={shared.link} onClick={() => copy(r().clue)}>Copy</button>
                    <button class={[shared.link, styles.delete]} onClick={() => remove(r())}>Delete</button>
                  </div>
                </li>
              )}
            </For>
          </ul>
        </Match>
      </Switch>

      <div class={styles.foot}>
        <span>{clueLog().list.length} saved · kept in this browser</span>
        <span class={styles.spacer} />
        <button class="btn ghost" disabled={!clueLog().list.length} onClick={exportClueLog}>Export</button>
        <button class="btn ghost" onClick={() => fileInput.click()}>Import</button>
        <input ref={fileInput} type="file" accept=".json,application/json" hidden onChange={e => onImport(e.currentTarget.files?.[0])} />
      </div>
      <Show when={message()} fallback={<CopyStatus copied={copied()} />}>
        <p class={shared.status} role="status">{message()}</p>
      </Show>
    </div>
  );
};
