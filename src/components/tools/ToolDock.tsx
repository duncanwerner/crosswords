import { For, Show, createSignal, onSettled, useContext } from 'solid-js';
import { EditorContext } from '../../state/editor';
import { DICTIONARIES, loadWords, setWordSettings, settings, status } from '../../state/words';
import type { Dictionary } from '../../words/protocol';
import { TOOLS } from './registry';
import styles from './ToolDock.module.css';

const TAB_KEY = 'cross:tool';

const readTab = () => {
  try {
    const id = localStorage.getItem(TAB_KEY);
    return TOOLS.some(t => t.id === id) ? id! : TOOLS[0].id;
  }
  catch {
    return TOOLS[0].id;
  }
};

/**
 * tabbed helpers under the clue list. every tool stays mounted (so typed
 * input survives switching tabs); only the visible one does any work.
 * dictionary settings here apply to all tools.
 */
export const ToolDock = (props: { collapsed: boolean; onToggle: () => void }) => {
  const [tab, setTabSignal] = createSignal(readTab());

  const setTab = (id: string) => {
    setTabSignal(id);
    if (props.collapsed) props.onToggle();
    try {
      localStorage.setItem(TAB_KEY, id);
    }
    catch {
      // preference only
    }
  };

  const ed = useContext(EditorContext);
  ed.registerShowTool(setTab);

  onSettled(() => {
    if (status().state === 'idle') loadWords();
  });

  return (
    <section class={[styles.dock, { [styles.collapsed]: props.collapsed }]} aria-label="Tools">
      <header class={styles.head}>
        <div class={styles.tabs} role="tablist" aria-label="Tools">
          <For each={TOOLS}>
            {t => (
              <button
                role="tab"
                id={`tool-tab-${t.id}`}
                aria-controls={`tool-pane-${t.id}`}
                aria-selected={String(tab() === t.id) as 'true' | 'false'}
                title={t.description}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            )}
          </For>
        </div>
        <div class={styles.settings}>
          <select
            class="field"
            aria-label="Dictionary"
            value={settings().dictionary}
            onChange={e => setWordSettings({ dictionary: e.currentTarget.value as Dictionary })}
          >
            <For each={DICTIONARIES}>{d => <option value={d.value}>{d.label} dictionary</option>}</For>
          </select>
          <label class={styles.check} title="Include proper nouns and abbreviations">
            <input type="checkbox" checked={settings().proper} onChange={e => setWordSettings({ proper: e.currentTarget.checked })} />
            Proper nouns
          </label>
          <Show when={status().state === 'loading'}>
            <span class={styles.check} aria-live="polite">Loading…</span>
          </Show>
        </div>
        <button
          class={['btn', 'ghost', styles.toggle]}
          aria-expanded={String(!props.collapsed) as 'true' | 'false'}
          title={props.collapsed ? 'Show tools' : 'Hide tools'}
          onClick={() => props.onToggle()}
        >
          {props.collapsed ? '▴' : '▾'}
        </button>
      </header>
      <div class={styles.body} hidden={props.collapsed}>
        <For each={TOOLS}>
          {t => (
            <div class={styles.pane} role="tabpanel" id={`tool-pane-${t.id}`} aria-labelledby={`tool-tab-${t.id}`} hidden={tab() !== t.id}>
              <t.Component active={!props.collapsed && tab() === t.id} />
            </div>
          )}
        </For>
      </div>
    </section>
  );
};
