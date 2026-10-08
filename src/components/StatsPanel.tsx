import { For, Show, createMemo, useContext } from 'solid-js';
import { EditorContext } from '../state/editor';
import styles from './StatsPanel.module.css';

export const StatsPanel = () => {
  const ed = useContext(EditorContext);
  const s = () => ed.stats();

  const lengths = createMemo(() =>
    s().lengths.flatMap((count, length) => (count ? [{ length, count }] : [])));

  const uncheckedPct = () => {
    const total = s().checked + s().unchecked;
    return total ? Math.round((s().unchecked / total) * 100) : 0;
  };

  return (
    <section class={styles.panel} aria-label="Grid statistics">
      <dl class={styles.numbers}>
        <div><dt>Lights</dt><dd>{s().across + s().down}</dd></div>
        <div><dt>Across</dt><dd>{s().across}</dd></div>
        <div><dt>Down</dt><dd>{s().down}</dd></div>
        <div><dt>Unchecked</dt><dd>{s().unchecked} ({uncheckedPct()}%)</dd></div>
        <Show when={ed.puzzle.style === 'blocked'} fallback={<div><dt>Bars</dt><dd>{s().bars}</dd></div>}>
          <div><dt>Blocks</dt><dd>{s().blocks}</dd></div>
        </Show>
        <div><dt>Filled</dt><dd>{ed.filled()}/{s().whites}</dd></div>
      </dl>

      <Show when={lengths().length}>
        <div class={styles.lengths}>
          Lengths
          <For each={lengths()}>
            {l => <span class={styles.chip} title={`${l.count} light${l.count > 1 ? 's' : ''} of ${l.length}`}>{l.length}×{l.count}</span>}
          </For>
        </div>
      </Show>

      <Show when={s().warnings.length} fallback={<div class={styles.ok}>✓ No grid problems found</div>}>
        <ul class={styles.warnings}>
          <For each={s().warnings} keyed={w => w.kind}>
            {w => (
              <li>
                <button
                  class={styles.warning}
                  aria-pressed={String(ed.flaggedKind() === w().kind) as 'true' | 'false'}
                  title="Show these cells in the grid"
                  onClick={() => { ed.setFlaggedKind(k => (k === w().kind ? undefined : w().kind)); }}
                >
                  {w().message}
                </button>
              </li>
            )}
          </For>
        </ul>
      </Show>
    </section>
  );
};
