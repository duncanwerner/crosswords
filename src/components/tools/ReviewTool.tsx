import { Loading, lazy } from 'solid-js';
import type { ToolProps } from './common';
import styles from './tools.module.css';

/** the chat and its LLM libraries (markdown, highlighting, KaTeX) load with the tool, not the app */
const ReviewChat = lazy(() => import('./ReviewChat').then(m => ({ default: m.ReviewChat })));

export const ReviewTool = (props: ToolProps) => (
  <Loading fallback={<div class={styles.message}>Loading…</div>}>
    <ReviewChat active={props.active} />
  </Loading>
);
