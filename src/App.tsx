import { Show, createMemo } from 'solid-js';
import { Editor } from './components/Editor';
import { Library } from './components/Library';
import { route } from './state/route';

export const App = () => {
  const editorId = createMemo(() => {
    const r = route();
    return r.view === 'editor' ? r.id : undefined;
  });

  // keyed: opening a different puzzle mounts a fresh editor
  return (
    <Show when={editorId()} keyed fallback={<Library />}>
      {id => <Editor id={id} />}
    </Show>
  );
};
