import { For, createMemo } from 'solid-js';

/** tiny grid preview from a summary thumb string ('#' block, '.' white) */
export const Thumbnail = (props: { rows: number; cols: number; thumb: string }) => {
  const blocks = createMemo(() => {
    const list: Array<{ r: number; c: number }> = [];
    for (let i = 0; i < props.thumb.length; i++) {
      if (props.thumb[i] === '#') list.push({ r: Math.floor(i / props.cols), c: i % props.cols });
    }
    return list;
  });
  return (
    <svg viewBox={`0 0 ${props.cols} ${props.rows}`} role="img" aria-label="Grid preview" style={{ display: 'block', width: '100%', height: '100%' }}>
      <rect width={props.cols} height={props.rows} fill="var(--cell)" stroke="var(--grid-line)" stroke-width="0.08" />
      <For each={blocks()}>
        {b => <rect x={b.c} y={b.r} width="1" height="1" fill="var(--block)" />}
      </For>
    </svg>
  );
};
