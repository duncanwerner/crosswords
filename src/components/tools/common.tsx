import type { JSX } from '@solidjs/web';
import { Match, Switch, createSignal } from 'solid-js';
import { hasLoaded, loadWords, status } from '../../state/words';
import styles from './tools.module.css';

/** what every tool receives from the dock */
export interface ToolProps {
  /** the tool's tab is showing; inactive tools stay mounted but skip work */
  active: boolean;
}

/** shows children once a dictionary is available, else loading / error */
export const DictionaryGate = (props: { children: JSX.Element }) => (
  <Switch fallback={props.children}>
    <Match when={status().state === 'error'}>
      <div class={[styles.message, styles.error]}>
        <p>{(status() as { message: string }).message}</p>
        <button class="btn" onClick={() => loadWords()}>Retry</button>
      </div>
    </Match>
    <Match when={!hasLoaded()}>
      <div class={styles.message}>Loading dictionary…</div>
    </Match>
  </Switch>
);

/** copy to clipboard with a short-lived confirmation */
export const createCopier = () => {
  const [copied, setCopied] = createSignal('');
  let timer: ReturnType<typeof setTimeout> | undefined;
  const copy = (text: string) => {
    navigator.clipboard?.writeText(text).then(
      () => {
        setCopied(text);
        clearTimeout(timer);
        timer = setTimeout(() => setCopied(''), 1600);
      },
      () => setCopied(''),
    );
  };
  return { copied, copy };
};

export const CopyStatus = (props: { copied: string }) => (
  <p class={styles.status} aria-live="polite">{props.copied ? `Copied “${props.copied}”` : ''}</p>
);

/**
 * run an async query whenever its inputs change, keeping only the latest
 * answer. returns a function to pass to the effect's apply phase.
 */
export const latestOnly = () => {
  let latest = 0;
  return <T,>(promise: () => Promise<T>, done: (value: T) => void, fail: (err: Error) => void) => {
    const id = ++latest;
    promise().then(
      value => {
        if (id === latest) done(value);
      },
      (err: Error) => {
        if (id === latest) fail(err);
      },
    );
  };
};

/** small ⊘ button that adds a word to the puzzle's block list */
export const BlockButton = (props: { word: string; onBlock: (word: string) => void; label?: boolean }) => (
  <button
    class={styles.block}
    title={`Block ${props.word}: never offer it again in this puzzle`}
    aria-label={`Block ${props.word}`}
    onClick={e => {
      e.stopPropagation();
      props.onBlock(props.word);
    }}
  >
    ⊘{props.label ? ` ${props.word}` : ''}
  </button>
);
