
export type Direction = 'across' | 'down';

export type Symmetry = 'none' | 'diagonal';

/** cell address in grid */
export interface CellAddress {
  row: number;
  column: number;
}

/**
 * number and direction
 */
export interface ClueAddress {
  number: number;
  direction: Direction;
}

export interface ClueData extends ClueAddress {
  length: number;
  start: CellAddress;
  text?: string;
  clue?: string;
}

export interface ChecksumEntry {
  number: number;
  direction: Direction;
  checksum: number;  
}

export interface Square {

  /** square is grayed out */
  gray?: boolean;

  /** square has a number */
  number?: number;

  /** 
   * square has an across answer. we're going to set this for all
   * squares in the answer, so this does not mean it's the first
   * cell in the answer. but you can test if across === number.
   */
  across?: number;

  /** 
   * square has a down answer. as with across, this isn't necessarily
   * the first square; all squares in the down answer have this square set.
   * but you can test down === number.
   */
  down?: number;

  /** 
   * length of the across answer. atm this is only set on the first square.
   */
  across_length?: number;

  /** 
   * length of the down answer. atm this is only set on the first square.
   */
  down_length?: number;

  /** correct letter */
  letter?: string;

  /** answer (letter when solving) */
  answer?: string;

  /** flag for editing */
  committed?: boolean;

}

export type ClueReference = Square[];

export const ClueReferenceSetText = (ref: ClueReference, value: string) => {
  let i = 0;

  for (i = 0; i < value.length && i < ref.length; i++) {
    ref[i].letter = (value[i] === '.') ? undefined : value[i].toUpperCase();
    ref[i].committed = false;
  }
  for (; i < ref.length; i++) {
    ref[i].letter = undefined;
    ref[i].committed = false;
  }

};

export const ClueReferenceGetText = (ref: ClueReference) => {
  return ref.map(square => {
    return square.letter || '.';
  }).join('');
}

/**
 * get clue references from list of squares. this is intended to be
 * used from clones of the squares so we can modify them. 
 * 
 * FIXME: move
 */
export const ClueReferences = (squares: Square[][]): ClueReference[] => {

  const list: ClueReference[] = [];
  const rows = squares.length;
  const columns = rows ? squares[0].length : 0;

  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const cell = squares[row][column];
      if (cell.number) {
        if (cell.across === cell.number) {
          const ref: ClueReference = [];
          for (let i = 0; i < (cell.across_length || 0); i++) {
            ref.push(squares[row][column + i]);
          }
          list.push(ref);
        }
        if (cell.down === cell.number) {
          const ref: ClueReference = [];
          for (let i = 0; i < (cell.down_length || 0); i++) {
            ref.push(squares[row + i][column]);
          }
          list.push(ref);
        }
      }
    }
  }
  return list;
};


