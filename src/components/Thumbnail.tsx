import { For, createMemo } from 'solid-js';

/** tiny grid preview from a summary thumb string ('#' block, '.' white, 'r'/'b'/'+' bars) */
export const Thumbnail = (props: { rows: number; cols: number; thumb: string }) => {
  const parts = createMemo(() => {
    const blocks: Array<{ r: number; c: number }> = [];
    const bars: string[] = [];
    for (let i = 0; i < props.thumb.length; i++) {
      const ch = props.thumb[i];
      const r = Math.floor(i / props.cols);
      const c = i % props.cols;
      if (ch === '#') blocks.push({ r, c });
      if ((ch === 'r' || ch === '+') && c < props.cols - 1) bars.push(`M${c + 1} ${r}v1`);
      if ((ch === 'b' || ch === '+') && r < props.rows - 1) bars.push(`M${c} ${r + 1}h1`);
    }
    return { blocks, bars: bars.join('') };
  });
  return (
    <svg viewBox={`0 0 ${props.cols} ${props.rows}`} role="img" aria-label="Grid preview" style={{ display: 'block', width: '100%', height: '100%' }}>
      <rect width={props.cols} height={props.rows} fill="var(--cell)" stroke="var(--grid-line)" stroke-width="0.08" />
      <For each={parts().blocks}>
        {b => <rect x={b.c} y={b.r} width="1" height="1" fill="var(--block)" />}
      </For>
      <path d={parts().bars} stroke="var(--block)" stroke-width="0.22" stroke-linecap="square" fill="none" />
    </svg>
  );
};
