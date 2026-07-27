type ShallowComparable = object | string | number | boolean | bigint | symbol;

/**
 * Return true when two values have the same own enumerable keys and
 * the corresponding values are strictly equal.
 *
 * This is a shallow comparison. Nested objects are compared by reference.
 *
 * :param a: The first object to compare.
 * :param b: The second object to compare.
 * :returns: True if the objects are shallowly equal.
 */
export function isShallowEqual(
  a: ShallowComparable,
  b: ShallowComparable,
): boolean {
  if (a === b) {
    return true;
  }

  const left = Object(a) as Record<PropertyKey, unknown>,
        right = Object(b) as Record<PropertyKey, unknown>;

  for (const key in left) {
    if (!(key in right)) {
      return false;
    }
  }

  for (const key in right) {
    if (left[key] !== right[key]) {
      return false;
    }
  }

  return true;
}
