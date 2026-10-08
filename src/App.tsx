import { Match, Switch, createMemo } from 'solid-js';
import { Editor } from './components/Editor';
import { Library } from './components/Library';
import { Play } from './components/Play';
import { route } from './state/route';

export const App = () => {
  /** the open puzzle and view, as one string so either changing remounts */
  const open = createMemo(() => {
    const r = route();
    return r.view === 'library' ? undefined : `${r.view}:${r.id}`;
  });
  const id = (key: string) => key.slice(key.indexOf(':') + 1);

  // keyed: opening a different puzzle, or switching between editing and
  // playing, mounts a fresh view
  return (
    <Switch fallback={<Library />}>
      <Match when={open()?.startsWith('editor:') && open()} keyed>
        {key => <Editor id={id(key)} />}
      </Match>
      <Match when={open()?.startsWith('play:') && open()} keyed>
        {key => <Play id={id(key)} />}
      </Match>
    </Switch>
  );
};
