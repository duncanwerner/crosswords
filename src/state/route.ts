import { createSignal } from 'solid-js';
import type { LightKey } from '../model/types';

/**
 * minimal hash routing: '#/p/<id>' opens a puzzle in the editor,
 * '#/play/<id>' plays it, anything else is the library. '#/p/<id>/<light>'
 * opens the editor at a light (from a library search). no router
 * dependency while Solid 2 is in RC.
 */
export type Route = { view: 'library' } | { view: 'editor' | 'play'; id: string; light?: LightKey };

const parse = (hash: string): Route => {
  const match = /^#\/(p|play)\/([^/]+)(?:\/(\d+,\d+,[AD]))?$/.exec(hash);
  if (!match) return { view: 'library' };
  const route: Route = { view: match[1] === 'p' ? 'editor' : 'play', id: decodeURIComponent(match[2]) };
  if (match[3]) route.light = match[3] as LightKey;
  return route;
};

const [route, setRoute] = createSignal<Route>(parse(location.hash));

window.addEventListener('hashchange', () => setRoute(parse(location.hash)));

export { route };

export const openPuzzle = (id: string, light?: LightKey) => {
  location.hash = `#/p/${encodeURIComponent(id)}${light ? `/${light}` : ''}`;
};

/** drop a light from the address once the editor has used it, so a reload doesn't jump back to it */
export const forgetLight = (id: string) => {
  history.replaceState(history.state, '', `#/p/${encodeURIComponent(id)}`);
};

export const playPuzzle = (id: string) => {
  location.hash = `#/play/${encodeURIComponent(id)}`;
};

export const openLibrary = () => {
  location.hash = '';
};
