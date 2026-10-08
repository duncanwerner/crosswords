
import type { Square } from './types';
import type { StepResult } from './filler';

export interface FillResponse {
  type: 'fill-response';
  result: StepResult;
  count: number;
  squares?: Square[][];
  id: number;
}

export interface AllCandidatesMessage {
  type: 'all-candidates';
  list: string[];
}

export interface AllCandidatesResponse {
  type: 'all-candidates-response';
  result: Record<string, string[]>;
}

export interface CandidatesMessage {
  type: 'candidates';
  text: string;
}

export interface CandidatesResponse {
  type: 'candidates-response';
  list: string[];
}

export interface CandidatesMessage {
  type: 'candidates';
  text: string;
}

export interface FitResponse {
  type: 'fit-response';
  list: string[][];
}

export interface FitMessage {
  type: 'fit';
  text: string;
}

export interface AnagramsResponse {
  type: 'anagrams-response';
  list: string[][];
}

export interface AnagramsMessage {
  type: 'anagrams';
  text: string;
}

export interface RegexpResponse {
  type: 'regexp-response';
  list: string[];
}

export interface RegexpMessage {
  type: 'regexp';
  pattern: string;
}

export interface FillMessage {
  type: 'fill';
  squares: Square[][];
  limit?: number;
  id: number;
  force?: string[];
  block?: string[];
  common?: boolean;
}

export type WorkerMessage
  = (FitMessage
  |  FitResponse
  |  FillMessage 
  |  FillResponse
  |  RegexpMessage
  |  RegexpResponse
  |  AnagramsMessage
  |  AnagramsResponse
  |  CandidatesMessage 
  |  CandidatesResponse
  |  AllCandidatesMessage
  |  AllCandidatesResponse) & { user?: boolean, dictionary?: 'base'|'large'|'insane' } 
  ;
