
import type { Square, Direction, CellAddress, ClueAddress, Symmetry, ClueData, ChecksumEntry } from './types';

import adler32 from 'adler-32';

// type IterateFunction = (row: number, column: number, cell: Square) => boolean;

export interface CheckResult {
  number: number;
  correct: boolean;
}

export interface CheckResultList {
  across: CheckResult[];
  down: CheckResult[];
}


/**
 * 
 */
export class Grid {

  public rows = 0;
  public columns = 0;
  public squares: Square[][] = [];
  public name = '';
  public nonce = '';

  public checksums?: ChecksumEntry[];

  public clue_list: {
      across: ClueData[];
      down: ClueData[];
    } = {across: [], down: []};

  public clue_text: {
    across: string[];
    down: string[];
  } = {
    across: [], down: [],
  };

  public AnswerText(clue: ClueAddress) {

    let text = '';

    if (clue.direction === 'across') {
      for (const check of this.clue_list.across) {
        if (check.number === clue.number) {
          for (let c = 0; c < check.length; c++) {
            const square = this.squares[check.start.row][check.start.column + c];
            text += (square.answer || ' ');
          }
          return text;
        }
      }
    }
    else {
      for (const check of this.clue_list.down) {
        if (check.number === clue.number) {
          for (let r = 0; r < check.length; r++) {
            const square = this.squares[check.start.row + r][check.start.column];
            text += (square.answer || ' ');
          }
          return text;
        }
      }
    }

    return '';
  }

  /**
   * check solve data (answers) against actual data. this version uses 
   * checksums.
   */
  public CompareChecksums(): CheckResultList {

    const results: CheckResultList = {across: [], down: []};

    if (this.checksums) {
      for (const entry of this.checksums) {
        const answer = this.AnswerText(entry);
        const checksum = adler32.str(`${this.nonce} ${answer}`);

        const list = entry.direction === 'down' ? results.down : results.across;
        list.push({
          number: entry.number,
          correct: checksum === entry.checksum,
        });
      }

    }

    console.info({results});

    return results;

  }

  public CalculateChecksums() {

    // always generate a new nonce when we do this, so we don't 
    // accidentally inherit from a base or source grid

    this.nonce = Math.round(Math.random() * 2e16).toString(16);

    // don't calculate partial. if a word is incomplete, set the checksum to 0

    this.checksums = [];
    const checksums: ChecksumEntry[] = [];

    for (const group of [
      {direction: 'down', list: this.clue_list.down}, 
      {direction: 'across', list: this.clue_list.across}]) {

      for (const clue of group.list) {

        const checksum: ChecksumEntry = {
          number: clue.number, direction: group.direction as Direction, checksum: 0,
        };

        if (clue.text && !/[\s.]/.test(clue.text)) {
          checksum.checksum = adler32.str(`${this.nonce} ${clue.text}`);
        }

        checksums.push(checksum);

      }  
    }

    this.checksums = checksums;
    console.info({checksums});

  }

  public Stats() {

    let across = 0;
    let down = 0;
    let clues = 0;

    const lengths: number[] = [];

    for (const row of this.squares) {
      for (const cell of row) {
        if (cell.gray) { continue; }

        if (cell.across && cell.across === cell.number) {
          clues++;
          across++;
          const length = cell.across_length || 0;
          lengths[length] = (lengths[length] || 0) + 1;
        }
        if (cell.down && cell.down === cell.number) {
          clues++;
          down++;
          const length = cell.down_length || 0;
          lengths[length] = (lengths[length] || 0) + 1;
        }
      }
    }

    return {
      rows: this.rows, 
      columns: this.columns,
      clues, 
      across, 
      down,
      lengths,
    };

  }

  public UpdateClue(target: ClueAddress) {
    for (const clue of this.clue_list.across) {
      if (clue.direction === target.direction && clue.number === target.number) {
        clue.text = '';
        for (let c = 0; c < clue.length; c++) {
          const square = this.squares[clue.start.row][clue.start.column + c];
          clue.text += (square.letter || '.');
        }
      }
    }
    for (const clue of this.clue_list.down) {
      if (clue.direction === target.direction && clue.number === target.number) {
        clue.text = '';
        for (let r = 0; r < clue.length; r++) {
          const square = this.squares[clue.start.row + r][clue.start.column];
          clue.text += (square.letter || '.');
        }
      }
    }
  }

  public UpdateClues() {
    for (const clue of this.clue_list.across) {
      clue.text = '';
     for (let c = 0; c < clue.length; c++) {
        const square = this.squares[clue.start.row][clue.start.column + c];
        clue.text += (square.letter || '.');
      }
    }
    for (const clue of this.clue_list.down) {
      clue.text = '';
      for (let r = 0; r < clue.length; r++) {
        const square = this.squares[clue.start.row + r][clue.start.column];
        clue.text += (square.letter || '.');
      }
    }
  }

  public GetClueList() {

    const across: ClueData[] = [];
    const down: ClueData[] = [];

    for (const {cell, row, column} of this.List()) {
      if (cell.number) {
        if (cell.number === cell.across) {
          across.push({ 
            number: cell.number, 
            direction: 'across',
            length: cell.across_length || 0,
            start: { row, column },
            clue: this.clue_text.across[cell.number] || '',
          });
        }
        if (cell.number === cell.down) {
          down.push({
            number: cell.number,
            direction: 'down',
            length: cell.down_length || 0,
            start: { row, column },
            clue: this.clue_text.down[cell.number] || '',
          });
        }
      }
    }

    return {across, down};
  }

  public GridSize(delta: number) {
    if (delta > 0) {

      for (const row of this.squares) {
        for (let i = 0; i < delta; i++) {
          row.push({});
        }
      }

      const new_row: Square[] = [];
      for (let i = 0; i < this.columns + delta; i++) {
        new_row.push({});
      }

      for (let i = 0; i < delta; i++) {
        this.squares.push(JSON.parse(JSON.stringify(new_row)));
      }


    }
    else if (delta < 0) {

      if (this.rows + delta < 1 || this.columns + delta < 1) {
        // throw new Error('too small');
        return;
      }

      this.squares = this.squares.map(row => row.slice(0, row.length + delta)).slice(0, this.squares.length + delta);



    }

    this.rows += delta;
    this.columns += delta;
    this.Renumber();

  }

  public SetGray(row: number, column: number, gray: boolean, symmetry: Symmetry = 'none') {
    
    if (row >= this.rows || row < 0) {
      return;
    }

    if (column >= this.columns || column < 0) {
      return;
    }

    this.squares[row][column].gray = gray;

    if (symmetry === 'diagonal') {

      // FIXME: validate

      this.squares[this.rows - row - 1][this.columns - column - 1].gray = gray;
    }

  }

  public ClearClues() {
    for (const clue of this.clue_list.across) {
      clue.clue = '';
    }
    for (const clue of this.clue_list.down) {
      clue.clue = '';
    }
    this.clue_text = { across: [], down: [] };
  }

  public List(direction: Direction = 'across', reverse = false) {

    const list: Array<{ row: number, column: number, cell: Square}> = [];

    if (direction === 'across'){
      for (let r = 0; r < this.rows; r++) {
        for (let c = 0; c < this.columns; c++) {
          list.push({row: r, column: c, cell: this.squares[r][c]});
        }
      }
    }
    else {
      for (let c = 0; c < this.columns; c++) {
        for (let r = 0; r < this.rows; r++) {
          list.push({row: r, column: c, cell: this.squares[r][c]});
        }
      }
    }

    if (reverse) {
      list.reverse();
    }
    
    return list;

  }

  /**
   * for use with fillers (temp)
   */
  public UpdateFromSquares(squares: Square[][]) {
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.columns; c++) {
        if (!this.squares[r][c].committed || !this.squares[r][c].letter) {
          this.squares[r][c].letter = squares[r][c].letter;
          this.squares[r][c].committed = squares[r][c].committed;
        }
      }
    }
    this.UpdateClues();
  }

  /**
   * clear letters. only clears uncomitted, unless parameter is set.
   */
  public ClearLetters(committed = false) {
    for (const {cell} of this.List()) {
      if (cell.letter && (committed || !cell.committed)) {
        cell.letter = '';
      }
    }
    this.UpdateClues();
  }

  /**
   * get clue from square
   */
  public SquareClue(cell: CellAddress, prefer: Direction = 'across'): ClueAddress|undefined {
    const square = this.squares[cell.row][cell.column];
    if (prefer === 'across' && square.across) {
      return { direction: 'across', number: square.across };
    }
    if (prefer === 'down' && square.down) {
      return { direction: 'down', number: square.down };
    }
    if (square.across) {
      return { direction: 'across', number: square.across }
    }
    if (square.down) {
      return { direction: 'down', number: square.down };
    }
  }

  /**
   * advance rows/columns (for arrow keys). jumps clues but doesn't cycle around
   */
  public Advance(current: CellAddress, rows: 1|0|-1 = 0, columns: 1|0|-1 = 0): CellAddress {

    const cell = {...current};

    if (rows !== 0) {
      for (let row = cell.row + rows; row >= 0 && row < this.rows; row += rows) {
        if (!this.squares[row][cell.column].gray) {
          cell.row = row;
          break;
        }
      }
    }

    if (columns !== 0) {
      for (let column = cell.column + columns; column >= 0 && column < this.columns; column += columns) {
        if (!this.squares[cell.row][column].gray) {
          cell.column = column;
          break;
        }
      }
    }

    return cell;

  }

  public SetClueText(clue: ClueAddress, text: string) {
    if (clue.direction === 'across') {
      this.clue_text.across[clue.number] = text;
      for (const test of this.clue_list.across) {
        if (test.number === clue.number) {
          test.clue = text;
          break;
        }
      }
    }
    else {
      this.clue_text.down[clue.number] = text;
      for (const test of this.clue_list.down) {
        if (test.number === clue.number) {
          test.clue = text;
          break;
        }
      }
    }
  }

  public GetSquares(clue: ClueAddress) {
    const list = this.List(clue.direction);
    for (let i = 0; i < list.length; i++) {
      const {cell} = list[i];
      if (cell.number === clue.number && ((clue.direction === 'across' && cell.across === clue.number) || (clue.direction === 'down' && cell.down === clue.number))) {
        const result: Square[] = [cell];
        const length = (clue.direction === 'down' ? cell.down_length : cell.across_length) || 0;
        for (let j = 1; j < length; j++) {
          result.push(list[i+j].cell);
        }
        return result;
      }
    }
    return [];
  }

  /**
   * 
   * @param clue - selected clue
   * @param first - return the first square. set to false to return the last square. 
   * @returns 
   */
  public ClueSquare(clue?: ClueAddress, first = true): CellAddress {
    if (clue) {
      for (const {cell, row, column} of this.List()) {
        if (cell.number === clue.number && 
            ((clue.direction === 'across' && cell.across === clue.number) || (clue.direction === 'down' && cell.down === clue.number))) {

          if (!first) {
            if (clue.direction === 'across') {
              return {row, column: column + (cell.across_length || 0) - 1};
            }
            return {row: row + (cell.down_length || 0) - 1, column};
          }
          return {row, column};
        }
      }
    }
    return { row: -1, column: -1 };
  }

  /**
   * clear all solve data
   */
  public ClearAnswers() {
    for (const row of this.squares) {
      for (const cell of row) {
        cell.answer = undefined;
      }
    }
  }

  public SetAnswer(letter: string|undefined, row: number, column: number) {
    if (row >= 0 && row < this.rows && column >= 0 && column < this.columns) {
      const cell = this.squares[row][column];
      cell.answer = letter;
    }
  }

  public SetLetter(letter: string|undefined, row: number, column: number, commit = true) {
    if (row >= 0 && row < this.rows && column >= 0 && column < this.columns) {
      const cell = this.squares[row][column];
      cell.letter = letter;
      cell.committed = commit;

      if (cell.across) {
        this.UpdateClue({direction: 'across', number: cell.across});
      }
      if (cell.down) {
        this.UpdateClue({direction: 'down', number: cell.down});
      }
    }
  }

  public NextSquare(current?: CellAddress, clue?: ClueAddress, forward = true): {cell: CellAddress, clue: ClueAddress} {
    
    // some validation: should not be current w/o clue
    // current should not be gray

    if (!current || !clue) {
      clue = this.NextClue(clue);
      return {clue, cell: this.ClueSquare(clue)};
    }

    if (!forward) {
      if (clue.direction === 'across' && current.column > 0) {
        const next = this.squares[current.row][current.column - 1];
        if (!next.gray) {
          return {clue, cell: { row: current.row, column: current.column - 1}};
        }
      }
      else if (clue.direction === 'down' && current.row > 0) {
        const next = this.squares[current.row - 1][current.column];
        if (!next.gray) {
          return {clue, cell: { row: current.row - 1, column: current.column}};
        }
      }
    }
    else {    
      if (clue.direction === 'across' && current.column < this.columns - 1) {
        const next = this.squares[current.row][current.column + 1];
        if (!next.gray) {
          return {clue, cell: { row: current.row, column: current.column + 1}};
        }
      }
      else if (clue.direction === 'down' && current.row < this.rows - 1) {
        const next = this.squares[current.row + 1][current.column];
        if (!next.gray) {
          return {clue, cell: { row: current.row + 1, column: current.column}};
        }
      }
    }

    clue = this.NextClue(clue, forward ? 1 : -1);
    return {clue, cell: this.ClueSquare(clue, forward)};

  }

  public NextClue(current?: ClueAddress, delta: 1|-1 = 1): ClueAddress {
    
    const clue: ClueAddress = current ? { ...current } : {
      direction: 'across', number: 0,
    };

    const list = this.List('across', delta === -1);

    if (clue.direction === 'across') {

      // find next across clue. if we don't find it, drop into 
      // the next section.

      for (const {cell} of list) {
        if (cell.number && cell.across === cell.number && ((delta > 0 && cell.across > clue.number) || (delta < 0 && cell.across < clue.number))) {
          return { direction: 'across', number: cell.number };
        }
      }
      
      // get ready for next. we don't actually have to set
      // direction here, it's not checked... helpful for dev tho

      clue.direction = 'down';
      clue.number = delta > 0 ? 0 : Number.MAX_SAFE_INTEGER;

    }

    // check down

    for (const {cell} of list) {
      if (cell.number && cell.down === cell.number && ((delta > 0 && cell.down > clue.number) || (delta < 0 && cell.down < clue.number))) {
        return { direction: 'down', number: cell.number };
      }
    }

    // if you get here we're out of down answers, so we need 
    // the first across answer. assuming there is one.

    clue.direction = 'across';
    clue.number = delta > 0 ? 0 : Number.MAX_SAFE_INTEGER;

    for (const {cell} of list) {
      if (cell.number && cell.across === cell.number && ((delta > 0 && cell.across > clue.number) || (delta < 0 && cell.across < clue.number))) {
        return { direction: 'across', number: cell.number };
      }
    }

    // should not happen, but I guess it could

    return {
      direction: 'down', number: 0,
    };

  }

  public Renumber() {
    
    let current = 0;

    // start by clearing all numbers. we do this because when setting in 
    // the next step we want to walk ahead, so we can't clear them inline 
    // (actually we could if we went backwards?)

    for (let row = 0; row < this.rows; row++) {
      for (let column = 0; column < this.columns; column++) {
        const cell = this.squares[row][column];
        cell.number = undefined;
        cell.across = undefined;
        cell.down = undefined;
        cell.across_length = undefined;
        cell.down_length = undefined;
      }
    }

    for (let row = 0; row < this.rows; row++) {
      for (let column = 0; column < this.columns; column++) {

        const cell = this.squares[row][column];
        if (cell.gray) { continue; }

        if (row === 0 || this.squares[row - 1][column].gray) {

          if (this.rows > (row + 1) && !this.squares[row + 1][column].gray) {
            cell.number = ++current;
            cell.down = cell.number;

            for (let i = row + 1; i <= this.rows; i++ ) {
              if (i === this.rows || this.squares[i][column].gray) {
                cell.down_length = i - row;
                break;
              }
              this.squares[i][column].down = cell.number; // forward
            }
          }

        }

          if (column === 0 || this.squares[row][column - 1].gray) {

            if (this.columns > (column + 1) && !this.squares[row][column + 1].gray) {
              if (!cell.number) {
                cell.number = ++current;
              }
              cell.across = cell.number;

              for (let i = column + 1; i <= this.columns; i++ ) {
                if (i === this.columns || this.squares[row][i].gray) {
                  cell.across_length = i - column;
                  break;
                }
                this.squares[row][i].across = cell.number; // forward
              }


            }
          }


      }
    }

    this.clue_list = this.GetClueList();

    // console.info("TCL", this.clue_list);

    this.UpdateClues();

  }

  public toJSON(): Partial<Grid> {
    return {
      rows: this.rows,
      columns: this.columns,
      squares: this.squares,
      clue_text: this.clue_text,
      name: this.name || undefined,
      checksums: this.checksums,
      nonce: this.nonce || undefined,
    };
  }

  public static FromJSON(src: Partial<Grid>) {
    const grid = new Grid(src.rows, src.columns);
    
    if (src.squares) {
      for (let r = 0; r < grid.rows; r++) {
        for (let c = 0; c < grid.columns; c++) {
          if(src.squares[r][c]) {
            grid.squares[r][c] = src.squares[r][c];
          }
        }
      }
    }
    
    if (src.clue_text) {
      grid.clue_text = JSON.parse(JSON.stringify(src.clue_text));
      // console.info("SCT", src.clue_text);
    }

    if (src.checksums) {
      grid.checksums = JSON.parse(JSON.stringify(src.checksums));
    }

    grid.nonce = src.nonce || '';
    grid.name = src.name || '';

    grid.Renumber();
    return grid;
  }

  public constructor(rows?: number, columns?: number) {
    this.Reset(rows, columns);
  }

  public Reset(rows = 9, columns = 9) {

    this.rows = rows;
    this.columns = columns;
    this.squares = [];

    for (let r = 0; r < rows; r++) {
      const row: Square[] = [];
      for (let c = 0; c < columns; c++) {
        row.push({});
      }
      this.squares.push(row);
    }

    this.Renumber();

  }
  
}

