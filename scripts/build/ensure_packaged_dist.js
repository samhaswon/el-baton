/* IMPORT */

const fs = require('fs')
const path = require('path')
const { getPackagedDistSnapshotDir } = require('./packaged_dist_paths')
const verifyPackagedMain = require('./verify_packaged_main')

/* HELPERS */

const EXCLUDED_DIRECTORIES = new Set(['.git', '.tmp', 'node_modules', 'releases'])
const MAX_SEARCH_DEPTH = 4

const getResourcesDir = context => {
  const archivePath = verifyPackagedMain.getArchivePath(context)

  return path.dirname(archivePath)
}

const hasCompiledMainInArchive = resourcesDir => {
  const archivePath = path.join(resourcesDir, 'app.asar')

  if (!fs.existsSync(archivePath)) return false

  const entries = verifyPackagedMain.getArchiveEntries(archivePath)

  return verifyPackagedMain.hasArchiveEntry({
    entries,
    filePath: 'dist/main/main.js'
  })
}

const hasCompiledMainInResources = resourcesDir => (
  fs.existsSync(path.join(resourcesDir, 'dist', 'main', 'main.js'))
)

const getSearchRoots = context => {
  const candidates = [
    getPackagedDistSnapshotDir(context),
    process.cwd(),
    context.packager?.projectDir,
    context.packager?.appDir
  ].filter(Boolean)

  return Array.from(new Set(candidates.map(candidate => path.resolve(candidate))))
}

const findNestedDistDirectory = root => {
  const queue = [{ directory: root, depth: 0 }]

  while (queue.length) {
    const { directory, depth } = queue.shift()
    let entries = []

    try {
      entries = fs.readdirSync(directory, { withFileTypes: true })
    } catch {
      continue
    }

    for (let index = 0, l = entries.length; index < l; index++) {
      const entry = entries[index]

      if (!entry.isDirectory()) continue

      const childDirectory = path.join(directory, entry.name)

      if (EXCLUDED_DIRECTORIES.has(entry.name)) continue

      if (entry.name === 'dist' && fs.existsSync(path.join(childDirectory, 'main', 'main.js'))) {
        return childDirectory
      }

      if (depth < MAX_SEARCH_DEPTH) {
        queue.push({ directory: childDirectory, depth: depth + 1 })
      }
    }
  }

  return ''
}

const findSourceDistDirectory = context => {
  const searchRoots = getSearchRoots(context)
  const attemptedPaths = []

  for (let index = 0, l = searchRoots.length; index < l; index++) {
    const root = searchRoots[index]
    const directCandidate = path.basename(root) === 'dist' ? root : path.join(root, 'dist')

    attemptedPaths.push(directCandidate)

    if (fs.existsSync(path.join(directCandidate, 'main', 'main.js'))) {
      return { sourceDistDir: directCandidate, attemptedPaths }
    }
  }

  for (let index = 0, l = searchRoots.length; index < l; index++) {
    const nestedCandidate = findNestedDistDirectory(searchRoots[index])

    if (nestedCandidate) {
      attemptedPaths.push(nestedCandidate)
      return { sourceDistDir: nestedCandidate, attemptedPaths }
    }
  }

  return { sourceDistDir: '', attemptedPaths }
}

/* ENSURE PACKAGED DIST */

function ensurePackagedDist (context) {
  const resourcesDir = getResourcesDir(context)

  if (hasCompiledMainInArchive(resourcesDir) || hasCompiledMainInResources(resourcesDir)) return

  const { sourceDistDir, attemptedPaths } = findSourceDistDirectory(context)

  if (!sourceDistDir) {
    throw new Error(`[build:ensure-packaged-dist] Missing source dist directory with compiled main bundle. Tried:\n${attemptedPaths.join('\n')}`)
  }

  fs.cpSync(sourceDistDir, path.join(resourcesDir, 'dist'), {
    force: true,
    recursive: true
  })
}

/* EXPORT */

module.exports = ensurePackagedDist
