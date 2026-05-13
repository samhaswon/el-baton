/* TYPES */

export type MarkdownTableAlignment = 'default' | 'left' | 'center' | 'right';
export type MarkdownTableBlock = { startLineNumber: number, endLineNumber: number };

/* MARKDOWN TABLE */

const MarkdownTable = {

  /**
   * Returns whether a line contains a pipe that should be treated as a table
   * delimiter rather than an escaped literal.
   */
  hasUnescapedPipe ( line: string ): boolean {

    for ( let index = 0, length = line.length; index < length; index++ ) {
      if ( line[index] !== '|' ) continue;
      if ( index > 0 && line[index - 1] === '\\' ) continue;
      return true;
    }

    return false;

  },

  /**
   * Detects markdown code fence delimiters and returns their marker details.
   */
  isFenceLine ( line: string ): false | { marker: string, size: number } {

    const match = line.match ( /^\s*(`{3,}|~{3,})/ );

    if ( !match ) return false;

    return {
      marker: match[1][0],
      size: match[1].length
    };

  },

  /**
   * Returns whether the requested line is inside a fenced code block.
   */
  isInsideFence ( lines: string[], lineIndex: number ): boolean {

    let fence: false | { marker: string, size: number } = false;

    for ( let index = 0; index < lineIndex; index++ ) {
      const lineFence = MarkdownTable.isFenceLine ( lines[index] );

      if ( !lineFence ) continue;

      if ( !fence ) {
        fence = lineFence;
      } else if ( fence.marker === lineFence.marker && lineFence.size >= fence.size ) {
        fence = false;
      }
    }

    return !!fence;

  },

  /**
   * Checks whether a line can participate in a markdown table block.
   */
  isTableCandidateLine ( lines: string[], lineIndex: number ): boolean {

    if ( lineIndex < 0 || lineIndex >= lines.length ) return false;

    const line = lines[lineIndex];

    if ( !line.trim () ) return false;
    if ( MarkdownTable.isFenceLine ( line ) ) return false;
    if ( MarkdownTable.isInsideFence ( lines, lineIndex ) ) return false;

    return MarkdownTable.hasUnescapedPipe ( line );

  },

  /**
   * Splits a markdown table row into cells while respecting escaped pipes and
   * optional leading/trailing table pipes.
   */
  splitRow ( line: string ): string[] | undefined {

    if ( !MarkdownTable.hasUnescapedPipe ( line ) ) return;

    const trimmed = line.trim (),
          cells: string[] = [];

    let current = '',
        escaped = false;

    for ( let index = 0, length = line.length; index < length; index++ ) {
      const character = line[index];

      if ( escaped ) {
        current += character;
        escaped = false;
        continue;
      }

      if ( character === '\\' ) {
        current += character;
        escaped = true;
        continue;
      }

      if ( character === '|' ) {
        cells.push ( current );
        current = '';
        continue;
      }

      current += character;
    }

    cells.push ( current );

    if ( trimmed.startsWith ( '|' ) ) cells.shift ();
    if ( trimmed.endsWith ( '|' ) ) cells.pop ();

    return cells.map ( cell => cell.trim () );

  },

  /**
   * Parses a delimiter-row cell into the column alignment it represents.
   */
  getAlignment ( cell: string ): MarkdownTableAlignment | undefined {

    const value = cell.trim ();

    if ( !/^:?-{1,}:?$/.test ( value ) ) return;

    const isLeft = value.startsWith ( ':' ),
          isRight = value.endsWith ( ':' );

    if ( isLeft && isRight ) return 'center';
    if ( isLeft ) return 'left';
    if ( isRight ) return 'right';

    return 'default';

  },

  /**
   * Returns whether a parsed row is a valid markdown table delimiter row.
   */
  isDelimiterRow ( row: string[] | undefined ): row is string[] {

    return !!row && !!row.length && row.every ( cell => !!MarkdownTable.getAlignment ( cell ) );

  },

  /**
   * Pads or truncates parsed rows so every row has the same column count.
   */
  normalizeRows ( rows: string[][], columnCount: number ): string[][] {

    return rows.map ( row => {
      const nextRow = row.slice ( 0, columnCount );

      while ( nextRow.length < columnCount ) {
        nextRow.push ( '' );
      }

      return nextRow;
    });

  },

  /**
   * Finds the table block that contains a one-based editor line number.
   */
  getBlockAtLine ( lines: string[], lineNumber: number ): MarkdownTableBlock | undefined {

    const lineIndex = lineNumber - 1;

    if ( !MarkdownTable.isTableCandidateLine ( lines, lineIndex ) ) return;

    let startIndex = lineIndex,
        endIndex = lineIndex;

    while ( MarkdownTable.isTableCandidateLine ( lines, startIndex - 1 ) ) {
      startIndex--;
    }

    while ( MarkdownTable.isTableCandidateLine ( lines, endIndex + 1 ) ) {
      endIndex++;
    }

    for ( let candidateStart = startIndex; candidateStart < endIndex; candidateStart++ ) {
      const headerRow = MarkdownTable.splitRow ( lines[candidateStart] ),
            delimiterRow = MarkdownTable.splitRow ( lines[candidateStart + 1] );

      if ( !headerRow || !MarkdownTable.isDelimiterRow ( delimiterRow ) ) continue;

      let candidateEnd = candidateStart + 1;

      while ( candidateEnd + 1 <= endIndex && MarkdownTable.splitRow ( lines[candidateEnd + 1] ) ) {
        candidateEnd++;
      }

      if ( lineIndex >= candidateStart && lineIndex <= candidateEnd ) {
        return {
          startLineNumber: candidateStart + 1,
          endLineNumber: candidateEnd + 1
        };
      }
    }

  },

  /**
   * Pads a cell value to the requested display width according to its alignment.
   */
  getPaddedCell ( value: string, width: number, alignment: MarkdownTableAlignment ): string {

    const padding = Math.max ( 0, width - value.length );

    if ( alignment === 'right' ) {
      return `${' '.repeat ( padding )}${value}`;
    }

    if ( alignment === 'center' ) {
      const leftPadding = Math.floor ( padding / 2 ),
            rightPadding = padding - leftPadding;

      return `${' '.repeat ( leftPadding )}${value}${' '.repeat ( rightPadding )}`;
    }

    return `${value}${' '.repeat ( padding )}`;

  },

  /**
   * Builds a markdown delimiter cell for a formatted column.
   */
  getDelimiterCell ( width: number, alignment: MarkdownTableAlignment ): string {

    const finalWidth = Math.max ( 3, width );

    if ( alignment === 'left' ) {
      return `:${'-'.repeat ( finalWidth - 1 )}`;
    }

    if ( alignment === 'right' ) {
      return `${'-'.repeat ( finalWidth - 1 )}:`;
    }

    if ( alignment === 'center' ) {
      return `:${'-'.repeat ( finalWidth - 2 )}:`;
    }

    return '-'.repeat ( finalWidth );

  },

  /**
   * Formats a complete markdown table block while preserving the block indent.
   */
  formatBlock ( markdown: string ): string {

    const lines = markdown.split ( '\n' );

    if ( lines.length < 2 ) return markdown;

    const indent = lines[0].match ( /^\s*/ )?.[0] || '',
          normalizedLines = lines.map ( line => line.startsWith ( indent ) ? line.slice ( indent.length ) : line.trimStart () ),
          rows = normalizedLines.map ( MarkdownTable.splitRow ),
          headerRow = rows[0],
          delimiterRow = rows[1];

    if ( !headerRow || !MarkdownTable.isDelimiterRow ( delimiterRow ) ) return markdown;
    if ( rows.slice ( 2 ).some ( row => !row ) ) return markdown;

    const columnCount = Math.max ( ...rows.map ( row => row ? row.length : 0 ) ),
          normalizedRows = MarkdownTable.normalizeRows ( rows as string[][], columnCount ),
          alignments = Array.from ({ length: columnCount }, ( _value, index ) => MarkdownTable.getAlignment ( normalizedRows[1][index] ) || 'default' ),
          widths = Array.from ({ length: columnCount }, ( _value, index ) => {
            const maxContentWidth = Math.max ( ...normalizedRows.filter ( ( _row, rowIndex ) => rowIndex !== 1 ).map ( row => row[index].length ) ),
                  minWidth = alignments[index] === 'center' ? 3 : 3;

            return Math.max ( maxContentWidth, minWidth );
          } );

    const formattedRows = normalizedRows.map ( ( row, rowIndex ) => {
      const cells = row.map ( ( cell, columnIndex ) => {
        if ( rowIndex === 1 ) {
          return MarkdownTable.getDelimiterCell ( widths[columnIndex], alignments[columnIndex] );
        }

        return MarkdownTable.getPaddedCell ( cell, widths[columnIndex], alignments[columnIndex] );
      });

      return `${indent}| ${cells.join ( ' | ' )} |`;
    });

    return formattedRows.join ( '\n' );

  }

};

/* EXPORT */

export default MarkdownTable;
