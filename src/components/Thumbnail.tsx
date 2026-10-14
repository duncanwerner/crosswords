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
  // interior lines at every cell edge; drawn in screen pixels so they stay crisp when scaled down
  const lines = createMemo(() => {
    let d = '';
    for (let c = 1; c < props.cols; c++) d += `M${c} 0v${props.rows}`;
    for (let r = 1; r < props.rows; r++) d += `M0 ${r}h${props.cols}`;
    return d;
  });
  return (
    <svg viewBox={`0 0 ${props.cols} ${props.rows}`} role="img" aria-label="Grid preview" style={{ display: 'block', width: '100%', height: '100%', overflow: 'visible' }}>
      <rect width={props.cols} height={props.rows} fill="var(--cell)" />
      <For each={parts().blocks}>
        {b => <rect x={b.c} y={b.r} width="1" height="1" fill="var(--block)" />}
      </For>
      <path d={lines()} stroke="var(--grid-line)" stroke-width="1" stroke-opacity="0.35" vector-effect="non-scaling-stroke" fill="none" />
      <path d={parts().bars} stroke="var(--block)" stroke-width="0.22" stroke-linecap="square" fill="none" />
      <rect width={props.cols} height={props.rows} fill="none" stroke="var(--grid-line)" stroke-width="1.5" vector-effect="non-scaling-stroke" />
    </svg>
  );
};
