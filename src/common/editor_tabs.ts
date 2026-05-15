/* IMPORT */

import * as _ from 'lodash';

/* HELPERS */

/**
 * Removes invalid, empty, and duplicate tab paths while preserving the first
 * occurrence order.
 */
const normalizeOpenTabs = ( openTabs: string[] = [] ): string[] => {

  return _.uniq ( openTabs.filter ( _.isString ).filter ( _.identity ) );

};

/**
 * Returns a normalized tab list that contains `filePath` exactly once.
 */
const ensureOpenTab = ( openTabs: string[] = [], filePath?: string ): string[] => {

  const normalized = normalizeOpenTabs ( openTabs );

  if ( !filePath ) return normalized;
  if ( normalized.includes ( filePath ) ) return normalized;

  return normalized.concat ([filePath]);

};

/**
 * Returns a normalized tab list without the requested file path.
 */
const removeOpenTab = ( openTabs: string[] = [], filePath?: string ): string[] => {

  const normalized = normalizeOpenTabs ( openTabs );

  if ( !filePath ) return normalized;

  return normalized.filter ( openFilePath => openFilePath !== filePath );

};

/**
 * Replaces an existing open tab path, or ensures the new path is present when
 * there is no previous path to replace.
 */
const replaceOpenTab = ( openTabs: string[] = [], previousFilePath?: string, nextFilePath?: string ): string[] => {

  const normalized = normalizeOpenTabs ( openTabs );

  if ( !previousFilePath ) return ensureOpenTab ( normalized, nextFilePath );

  const replaced = normalized.map ( openFilePath => openFilePath === previousFilePath ? nextFilePath : openFilePath ).filter ( _.identity ) as string[];

  return nextFilePath ? ensureOpenTab ( replaced, nextFilePath ) : normalizeOpenTabs ( replaced );

};

/**
 * Moves one tab before or after another tab, leaving the list unchanged when
 * either tab is missing.
 */
const reorderOpenTabs = ( openTabs: string[] = [], sourceFilePath?: string, targetFilePath?: string, position: 'before' | 'after' = 'before' ): string[] => {

  const normalized = normalizeOpenTabs ( openTabs );

  if ( !sourceFilePath || !targetFilePath || sourceFilePath === targetFilePath ) return normalized;

  const sourceIndex = normalized.indexOf ( sourceFilePath ),
        targetIndex = normalized.indexOf ( targetFilePath );

  if ( sourceIndex < 0 || targetIndex < 0 ) return normalized;

  const reordered = normalized.slice ();

  reordered.splice ( sourceIndex, 1 );

  const targetIndexNext = reordered.indexOf ( targetFilePath ),
        insertIndex = position === 'after' ? targetIndexNext + 1 : targetIndexNext;

  reordered.splice ( insertIndex, 0, sourceFilePath );

  return reordered;

};

/* EXPORT */

export {
  ensureOpenTab,
  normalizeOpenTabs,
  removeOpenTab,
  reorderOpenTabs,
  replaceOpenTab
};
