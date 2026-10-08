import { createSignal } from 'solid-js';

/**
 * minimal hash routing: '#/p/<id>' opens a puzzle, anything else is the
 * library. no router dependency while Solid 2 is in RC.
 */
export type Route = { view: 'library' } | { view: 'editor'; id: string };

const parse = (hash: string): Route => {
  const match = /^#\/p\/(.+)$/.exec(hash);
  return match ? { view: 'editor', id: decodeURIComponent(match[1]) } : { view: 'library' };
};

const [route, setRoute] = createSignal<Route>(parse(location.hash));

window.addEventListener('hashchange', () => setRoute(parse(location.hash)));

export { route };

export const openPuzzle = (id: string) => {
  location.hash = `#/p/${encodeURIComponent(id)}`;
};

export const openLibrary = () => {
  location.hash = '';
};
