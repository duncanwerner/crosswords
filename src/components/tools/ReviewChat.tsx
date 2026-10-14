import { For, Match, Show, Switch, createEffect, createMemo, createSignal, onSettled, untrack, useContext } from 'solid-js';
import DOMPurify from 'dompurify';
import { Format } from 'llm-support-core';
import 'katex/dist/katex.min.css';
import { entryRef } from '../../model/describe';
import { chatItems } from '../../llm/view';
import { EditorContext } from '../../state/editor';
import { reviewNotes, setReviewNotes } from '../../state/library';
import { MODELS, apiKeyFor, findModel, isLocal, reviewSettings, setReviewSettings } from '../../state/review';
import { createReviewSession } from '../../state/review-session';
import type { ToolProps } from './common';
import styles from './tools.module.css';
import local from './ReviewChat.module.css';

/** rendered markdown by source text: while a reply streams, only its last paragraph changes */
const rendered = new Map<string, string>();
const markdown = (text: string) => {
  let html = rendered.get(text);
  if (html === undefined) {
    html = DOMPurify.sanitize(Format(text));
    if (rendered.size > 200) rendered.clear();
    rendered.set(text, html);
  }
  return html;
};

/** providers in the order the models list them, each with its models */
const PROVIDERS = [...new Set(MODELS.map(m => m.provider.name))].map(name => ({
  name,
  models: MODELS.filter(m => m.provider.name === name),
}));

/**
 * chat with an LLM about the puzzle. it reads clues and letters through
 * tools, and can set the review marks when asked. one chat per puzzle,
 * kept in this browser.
 */
export const ReviewChat = (_props: ToolProps) => {
  const ed = useContext(EditorContext);
  // the editor is made for one puzzle, so its id never changes under us
  const session = createReviewSession(untrack(() => ed.puzzle.id), ed);
  onSettled(() => () => session.dispose());

  const [draft, setDraft] = createSignal('');
  const [showSettings, setShowSettings] = createSignal(false);
  /** the API key shown as plain text; hidden again whenever settings close */
  const [showKey, setShowKey] = createSignal(false);

  const model = createMemo(() => findModel(reviewSettings().model));
  const items = createMemo(() => {
    const chat = session.chat();
    return chat ? chatItems(chat) : [];
  });
  const needsKey = createMemo(() => !apiKeyFor(model()));

  /** what the model is doing, while it isn't writing text */
  const activity = createMemo(() => {
    if (!session.busy()) return '';
    const last = items()[items().length - 1];
    if (last?.kind === 'tool' && !last.done) return `${last.label[0].toUpperCase()}${last.label.slice(1)}…`;
    return last?.kind === 'assistant' ? '' : 'Thinking…';
  });

  const send = (text: string) => {
    if (!text.trim() || session.busy()) return;
    session.send(text, model());
    setDraft('');
  };

  const reviewSelected = () => {
    const entry = ed.currentEntry();
    if (entry) send(`Review ${entryRef(entry)}.`);
  };

  // follow the reply as it streams, unless the setter has scrolled up to read
  let scroller!: HTMLDivElement;
  let stuck = true;
  createEffect(
    () => [items().length, items()[items().length - 1], activity()],
    () => {
      if (stuck) scroller.scrollTop = scroller.scrollHeight;
    },
  );

  return (
    <div class={styles.tool}>
      <div class={styles.bar}>
        <select
          class={['field', styles.grow]}
          aria-label="Model"
          value={model().name}
          onChange={e => setReviewSettings({ model: e.currentTarget.value })}
        >
          <For each={PROVIDERS}>
            {p => (
              <optgroup label={p.name}>
                <For each={p.models}>{m => <option value={m.name}>{m.label}</option>}</For>
              </optgroup>
            )}
          </For>
        </select>
        <button class="btn" disabled={!items().length} onClick={() => session.clear()}>New chat</button>
        <button
          class={['btn', 'ghost']}
          title="Review settings"
          aria-label="Review settings"
          aria-expanded={String(showSettings()) as 'true' | 'false'}
          onClick={() => {
            setShowSettings(s => !s);
            setShowKey(false);
          }}
        >
          ⚙
        </button>
      </div>

      <Show when={showSettings()}>
        <div class={local.settings}>
          <Show
            when={!isLocal(model())}
            fallback={<p class={local.hint}>{model().label} runs on this computer and needs no key.</p>}
          >
            <div class={local.field}>
              <label for="review-api-key">{model().provider.name} API key</label>
              <div class={local.key}>
                {/* a key, not a login: name it, and ask for "new-password" since browsers ignore "off" on password fields */}
                <input
                  id="review-api-key"
                  class="field"
                  type={showKey() ? 'text' : 'password'}
                  name="review-api-key"
                  autocomplete="new-password"
                  spellcheck={false}
                  value={reviewSettings().keys[model().provider.name] ?? ''}
                  onInput={e => setReviewSettings({ keys: { ...reviewSettings().keys, [model().provider.name]: e.currentTarget.value } })}
                />
                <button
                  type="button"
                  class="btn"
                  aria-controls="review-api-key"
                  aria-pressed={String(showKey()) as 'true' | 'false'}
                  onClick={() => setShowKey(v => !v)}
                >
                  {showKey() ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>
            <p class={local.hint}>Kept in this browser only, and sent only to {model().provider.name}. Not included in library backups.</p>
          </Show>
          <label class={local.field}>
            <span>Notes for the reviewer</span>
            <textarea
              class="field"
              rows={3}
              value={reviewNotes()}
              onInput={e => setReviewNotes(e.currentTarget.value)}
            />
          </label>
          <p class={local.hint}>Used for every puzzle, and included in library backups.</p>
        </div>
      </Show>

      <div
        class={[styles.results, local.chat]}
        ref={scroller}
        aria-live="polite"
        onScroll={() => {
          stuck = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 24;
        }}
      >
        <Show when={items().length} fallback={
          <div class={styles.help}>
            <p>Ask about any clue, or the whole puzzle. The reviewer can read the grid, the clues and your marks, and can set marks when you ask it to.</p>
            <Show when={needsKey()}>
              <p>Add an API key for {model().provider.name} in the settings (⚙) first.</p>
            </Show>
          </div>
        }>
          <For each={items()} keyed={false}>
            {item => (
              <Switch>
                <Match when={item().kind === 'user'}>
                  <div class={local.user}>{(item() as { text: string }).text}</div>
                </Match>
                <Match when={item().kind === 'assistant'}>
                  <div class={local.assistant} innerHTML={markdown((item() as { text: string }).text)} />
                </Match>
                <Match when={item().kind === 'tool'}>
                  <div class={[local.call, { [local.failed]: !!(item() as { error?: string }).error }]}>
                    {(item() as { label: string }).label}
                    <Show when={(item() as { error?: string }).error}>{error => <>: {error()}</>}</Show>
                  </div>
                </Match>
                <Match when={item().kind === 'error'}>
                  <div class={[local.call, local.failed]}>{(item() as { text: string }).text}</div>
                </Match>
              </Switch>
            )}
          </For>
        </Show>
        <Show when={activity()}>
          <div class={local.activity}>{activity()}</div>
        </Show>
      </div>

      <Show when={!session.compatible(model())}>
        <p class={styles.note}>This chat was with a different provider. Sending starts a new chat.</p>
      </Show>

      <form
        class={local.compose}
        onSubmit={e => {
          e.preventDefault();
          send(draft());
        }}
      >
        <div class={local.quick}>
          <button type="button" class={styles.link} disabled={session.busy()} onClick={() => send('Review all the clues.')}>
            Review all clues
          </button>
          <button type="button" class={styles.link} disabled={session.busy() || !ed.currentEntry()} onClick={reviewSelected}>
            Review {ed.currentEntry() ? entryRef(ed.currentEntry()!) : 'the selected clue'}
          </button>
        </div>
        <div class={local.row}>
          <textarea
            class={['field', local.input]}
            rows={2}
            placeholder="Ask about a clue…"
            aria-label="Message"
            value={draft()}
            onInput={e => setDraft(e.currentTarget.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
                e.preventDefault();
                send(draft());
              }
            }}
          />
          <Show
            when={session.busy()}
            fallback={<button class={['btn', 'primary']} type="submit" disabled={!draft().trim()}>Send</button>}
          >
            <button class="btn" type="button" onClick={() => session.stop()}>Stop</button>
          </Show>
        </div>
      </form>
    </div>
  );
};
