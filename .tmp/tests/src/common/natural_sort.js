"use strict";
/* TYPES */
Object.defineProperty(exports, "__esModule", { value: true });
/* NATURAL SORT */
const collator = new Intl.Collator(undefined, {
    numeric: true,
    sensitivity: 'base'
});
const NaturalSort = {
    compareStrings(a = '', b = '') {
        return collator.compare(a, b);
    },
    sortBy(values, iteratee, direction = 'ascending') {
        const sorted = values.slice().sort((a, b) => NaturalSort.compareStrings(iteratee(a), iteratee(b)));
        return direction === 'descending' ? sorted.reverse() : sorted;
    }
};
exports.default = NaturalSort;
