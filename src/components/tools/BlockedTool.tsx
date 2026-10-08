import { For, Show, createMemo, createSignal, useContext } from 'solid-js';
import { parseWordList } from '../../model/puzzle';
import { EditorContext } from '../../state/editor';
import type { ToolProps } from './common';
import styles from './tools.module.css';

/**
 * the puzzle's block list: words never offered by Words, Anagrams, Regex or
 * the auto-fill. words can be typed here or blocked from any tool's results.
 */
export const BlockedTool = (_props: ToolProps) => {
  const ed = useContext(EditorContext);
  const [text, setText] = createSignal('');

  /** words currently sitting complete in the grid */
  const inGrid = createMemo(() => {
    const cells = ed.puzzle.cells;
    const set = new Set<string>();
    for (const light of ed.map().lights) {
      const word = light.cells.map(i => cells[i].letter).join('');
      if (word.length === light.length) set.add(word);
    }
    return set;
  });

  const pending = createMemo(() => parseWordList(text()));

  const add = (e: SubmitEvent) => {
    e.preventDefault();
    if (!pending().length) return;
    ed.blockWords(pending());
    setText('');
  };

  const clearAll = () => {
    if (confirm(`Unblock all ${ed.blocked().length} words?`)) ed.clearBlocked();
  };

  return (
    <div class={styles.tool}>
      <form class={styles.bar} onSubmit={add}>
        <input
          class={['field', styles.grow, styles.mono, styles.upper]}
          placeholder="Words to block (spaces or commas between)"
          aria-label="Words to block"
          autocomplete="off"
          spellcheck={false}
          value={text()}
          onInput={e => setText(e.currentTarget.value)}
        />
        <button class="btn" type="submit" disabled={!pending().length}>
          Block{pending().length > 1 ? ` ${pending().length}` : ''}
        </button>
      </form>
      <div class={styles.info}>
        <span>
          {ed.blocked().length
            ? `${ed.blocked().length} blocked in this puzzle. They won't be offered by Words, Anagrams, Regex or the auto-fill.`
            : 'Nothing blocked in this puzzle yet.'}
        </span>
        <Show when={ed.blocked().length}>
          <button class={styles.link} onClick={clearAll}>Unblock all</button>
        </Show>
      </div>
      <div class={styles.results}>
        <Show
          when={ed.blocked().length}
          fallback={
            <div class={styles.help}>
              <p>Block words you never want suggested, such as obscure fill or junk dictionary entries. You can also block a word from Words, Anagrams or Regex results with its ⊘ button.</p>
              <p>Blocking doesn't remove a word that's already in the grid.</p>
            </div>
          }
        >
          <div class={styles.group}>
            <div class={styles.chips}>
              <For each={ed.blocked()}>
                {word => (
                  <span
                    class={[styles.blockedChip, { [styles.warn]: inGrid().has(word) }]}
                    title={inGrid().has(word) ? `${word} is blocked but already in the grid` : undefined}
                  >
                    {word}
                    <Show when={inGrid().has(word)}><span class={styles.tag}>in grid</span></Show>
                    <button class={styles.remove} aria-label={`Unblock ${word}`} title="Unblock" onClick={() => ed.unblockWord(word)}>×</button>
                  </span>
                )}
              </For>
            </div>
          </div>
        </Show>
      </div>
    </div>
  );
};
