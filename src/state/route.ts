import { createSignal } from 'solid-js';

/**
 * minimal hash routing: '#/p/<id>' opens a puzzle in the editor,
 * '#/play/<id>' plays it, anything else is the library. no router
 * dependency while Solid 2 is in RC.
 */
export type Route = { view: 'library' } | { view: 'editor' | 'play'; id: string };

const parse = (hash: string): Route => {
  const match = /^#\/(p|play)\/(.+)$/.exec(hash);
  if (!match) return { view: 'library' };
  return { view: match[1] === 'p' ? 'editor' : 'play', id: decodeURIComponent(match[2]) };
};

const [route, setRoute] = createSignal<Route>(parse(location.hash));

window.addEventListener('hashchange', () => setRoute(parse(location.hash)));

export { route };

export const openPuzzle = (id: string) => {
  location.hash = `#/p/${encodeURIComponent(id)}`;
};

export const playPuzzle = (id: string) => {
  location.hash = `#/play/${encodeURIComponent(id)}`;
};

export const openLibrary = () => {
  location.hash = '';
};
