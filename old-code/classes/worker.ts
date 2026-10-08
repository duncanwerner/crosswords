
import * as Filler from './filler';
import type { WorkerMessage } from './worker-messages';

const DEFAULT_LIMIT = 2048;

const PostMessage = (message: WorkerMessage) => {
  postMessage(message);
};

onmessage = (message: MessageEvent<WorkerMessage>) => {
  if (message.data.dictionary) {
    Filler.SetDictionary(message.data.dictionary);
  }

  switch (message.data.type) {
    case 'all-candidates':
      PostMessage({
        type: 'all-candidates-response',
        result: Filler.AllCandidates(message.data.list),
        user: message.data.user,
      });
      break;
      
    case 'candidates':
      PostMessage({
        type: 'candidates-response', 
        list: Filler.Candidates(message.data.text),
        user: message.data.user,
      });
      break;

    case 'regexp':
      PostMessage({
        type: 'regexp-response',
        list: Filler.MatchRegexp(message.data.pattern),
        user: message.data.user,
      });
      break;

    case 'fit':
      PostMessage({
        type: 'fit-response',
        list: Filler.Fit(message.data.text),
        user: message.data.user,
      });
      break;

    case 'anagrams':
      PostMessage({
        type: 'anagrams-response',
        list: Filler.Anagrams(message.data.text),
        user: message.data.user,
      });
      break;

    case 'fill':
      // filler.Init(message.data.squares);
      PostMessage({
        type: 'fill-response',
        ...Filler.Fill(
            message.data.squares, 
            message.data.limit || DEFAULT_LIMIT, 
            message.data.force || [], 
            message.data.block || [],
            message.data.common),
        id: message.data.id,
        user: message.data.user,
      });
      break;
  }  
};

export {};
