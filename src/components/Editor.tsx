import { Show, createSignal, onSettled, untrack } from 'solid-js';
import { createEditor, EditorContext } from '../state/editor';
import { loadPuzzle } from '../state/library';
import { openLibrary } from '../state/route';
import { CluePanel } from './CluePanel';
import styles from './Editor.module.css';
import { GridView } from './GridView';
import { StatsPanel } from './StatsPanel';
import { ToolDock } from './tools/ToolDock';
import { Toolbar } from './Toolbar';

export const Editor = (props: { id: string }) => {
  const initial = loadPuzzle(untrack(() => props.id));

  return (
    <Show
      when={initial}
      fallback={
        <div class={styles.missing}>
          <p>That puzzle doesn't exist (it may have been deleted).</p>
          <button class="btn" onClick={openLibrary}>Back to library</button>
        </div>
      }
    >
      {p => <EditorView editor={createEditor(p())} />}
    </Show>
  );
};

const isTextField = (el: EventTarget | null) =>
  el instanceof HTMLElement &&
  !el.hasAttribute('data-grid-input') &&
  (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement || el.isContentEditable);

/**
 * drag a splitter handle: calls onDrag with the pointer's offset (px) from
 * where the drag started, along the given axis, until release.
 */
const startDrag = (e: PointerEvent, axis: 'x' | 'y', onDrag: (delta: number) => void) => {
  if (e.button !== 0) return;
  e.preventDefault();
  const handle = e.currentTarget as HTMLElement;
  handle.setPointerCapture(e.pointerId);
  const start = axis === 'x' ? e.clientX : e.clientY;
  const onMove = (m: PointerEvent) => onDrag((axis === 'x' ? m.clientX : m.clientY) - start);
  const onUp = () => {
    handle.removeEventListener('pointermove', onMove);
    handle.removeEventListener('pointerup', onUp);
    handle.removeEventListener('pointercancel', onUp);
  };
  handle.addEventListener('pointermove', onMove);
  handle.addEventListener('pointerup', onUp);
  handle.addEventListener('pointercancel', onUp);
};

/** a remembered number (a panel size), stored per browser */
const storedNumber = (key: string, fallback: number) => {
  let initial = fallback;
  try {
    const raw = Number(localStorage.getItem(key));
    if (raw > 0) initial = raw;
  }
  catch {
    // use the fallback
  }
  const [value, setValue] = createSignal(initial);
  const set = (next: number) => {
    setValue(next);
    try {
      localStorage.setItem(key, String(next));
    }
    catch {
      // preference only
    }
  };
  return [value, set] as const;
};

const PANEL_KEY = 'cross:panel-width';
const PANEL_DEFAULT = 440;
const MIN_PANEL = 320;
/** room the grid column keeps when the panel is dragged wide */
const MIN_GRID_COLUMN = 360;

interface DockState {
  height: number;
  collapsed: boolean;
}
const DOCK_KEY = 'cross:dock';
const MIN_DOCK = 160;
const MIN_CLUES = 160;

const readDock = (): DockState => {
  try {
    const raw = JSON.parse(localStorage.getItem(DOCK_KEY) || '{}');
    return {
      height: Number.isFinite(raw.height) ? raw.height : 340,
      collapsed: !!raw.collapsed,
    };
  }
  catch {
    return { height: 340, collapsed: false };
  }
};

const EditorView = (props: { editor: ReturnType<typeof createEditor> }) => {
  const ed = untrack(() => props.editor);

  // clue list above, tools dock below, split by a draggable handle
  const [dock, setDockSignal] = createSignal<DockState>(readDock());
  const setDock = (patch: Partial<DockState>) => {
    const next = { ...dock(), ...patch };
    setDockSignal(next);
    try {
      localStorage.setItem(DOCK_KEY, JSON.stringify(next));
    }
    catch {
      // preference only
    }
  };
  let right!: HTMLDivElement;
  const clampDock = (height: number) =>
    Math.round(Math.max(MIN_DOCK, Math.min(height, right.clientHeight - MIN_CLUES)));

  const onSplitDown = (e: PointerEvent) => {
    const startHeight = dock().height;
    startDrag(e, 'y', delta => setDock({ height: clampDock(startHeight - delta), collapsed: false }));
  };

  // grid on the left, clues and tools on the right, split by a draggable handle
  const [panelWidth, setPanelWidth] = storedNumber(PANEL_KEY, PANEL_DEFAULT);
  let main!: HTMLDivElement;
  const clampPanel = (width: number) =>
    Math.round(Math.max(MIN_PANEL, Math.min(width, main.clientWidth - MIN_GRID_COLUMN)));

  const onPanelDown = (e: PointerEvent) => {
    const startWidth = right.getBoundingClientRect().width;
    startDrag(e, 'x', delta => setPanelWidth(clampPanel(startWidth - delta)));
  };

  const onPanelKey = (e: KeyboardEvent) => {
    const delta = e.key === 'ArrowLeft' ? 24 : e.key === 'ArrowRight' ? -24 : 0;
    if (!delta) return;
    e.preventDefault();
    setPanelWidth(clampPanel(right.getBoundingClientRect().width + delta));
  };

  const onSplitKey = (e: KeyboardEvent) => {
    const delta = e.key === 'ArrowUp' ? 24 : e.key === 'ArrowDown' ? -24 : 0;
    if (!delta) return;
    e.preventDefault();
    setDock({ height: clampDock(dock().height + delta), collapsed: false });
  };

  // undo/redo everywhere except text fields, which keep their native undo
  onSettled(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || isTextField(e.target)) return;
      const key = e.key.toLowerCase();
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault();
        ed.undo();
      }
      else if ((key === 'z' && e.shiftKey) || key === 'y') {
        e.preventDefault();
        ed.redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <EditorContext value={ed}>
      <div class={styles.page}>
        <Toolbar />
        <div ref={main} class={styles.main} style={{ '--panel-width': `${panelWidth()}px` }}>
          <div class={styles.left}>
            <div class={styles.gridBox}>
              <GridView />
            </div>
            <p class={styles.hint}>
              <Show
                when={ed.mode() === 'design'}
                fallback={<>Type to fill · <kbd>Space</kbd> switch direction · <kbd>Tab</kbd> next light · arrows to move</>}
              >
                <Show
                  when={ed.puzzle.style === 'barred'}
                  fallback={<>Click a square or press <kbd>Space</kbd> to toggle a block · arrows to move</>}
                >
                  Click near an edge to toggle a bar · <kbd>Shift</kbd>+arrow toggles the bar on that side · <kbd>Space</kbd> toggles a block
                </Show>
              </Show>
            </p>
            <StatsPanel />
          </div>
          <div
            class={styles.panelSplitter}
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize side panel"
            title="Drag to resize · double-click to reset"
            tabindex={0}
            onPointerDown={onPanelDown}
            onKeyDown={onPanelKey}
            onDblClick={() => setPanelWidth(PANEL_DEFAULT)}
          />
          <div
            ref={right}
            class={[styles.right, { [styles.dockCollapsed]: dock().collapsed }]}
            style={{ '--dock-height': `${dock().height}px` }}
          >
            <div class={styles.clues}>
              <CluePanel />
            </div>
            <Show when={!dock().collapsed}>
              <div
                class={styles.splitter}
                role="separator"
                aria-orientation="horizontal"
                aria-label="Resize tools"
                tabindex={0}
                onPointerDown={onSplitDown}
                onKeyDown={onSplitKey}
              />
            </Show>
            <div class={styles.dock}>
              <ToolDock collapsed={dock().collapsed} onToggle={() => setDock({ collapsed: !dock().collapsed })} />
            </div>
          </div>
        </div>
      </div>
    </EditorContext>
  );
};
