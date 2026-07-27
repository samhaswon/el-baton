/* TYPES */

type SortDirection = 'ascending' | 'descending';

/* NATURAL SORT */

const collator = new Intl.Collator ( undefined, {
  numeric: true,
  sensitivity: 'base'
});

const NaturalSort = {

  /**
   * Compares two strings with locale-aware numeric sorting.
   */
  compareStrings ( a: string = '', b: string = '' ): number {

    return collator.compare ( a, b );

  },

  /**
   * Sorts values by a string key using natural ordering.
   */
  sortBy<T> ( values: T[], iteratee: ( value: T ) => string, direction: SortDirection = 'ascending' ): T[] {

    const sorted = values.slice ().sort ( ( a, b ) => NaturalSort.compareStrings ( iteratee ( a ), iteratee ( b ) ) );

    return direction === 'descending' ? sorted.reverse () : sorted;

  }

};

/* EXPORT */

export type {SortDirection};
export default NaturalSort;
