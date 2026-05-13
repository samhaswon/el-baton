/* IMPORT */

const fs = require('fs')
const path = require('path')
const { getCompiledDistSnapshotDir } = require('./packaged_dist_paths')

/* HELPERS */

const projectDir = path.resolve(__dirname, '..', '..')
const sourceDistDir = path.join(projectDir, 'dist')
const snapshotDistDir = getCompiledDistSnapshotDir(projectDir)
const compiledMainPath = path.join(sourceDistDir, 'main', 'main.js')
const compiledRendererPath = path.join(sourceDistDir, 'renderer', 'index.html')

if (!fs.existsSync(compiledMainPath) || !fs.existsSync(compiledRendererPath)) {
  throw new Error(`[build:snapshot-dist] Missing compiled dist output. Expected "${compiledMainPath}" and "${compiledRendererPath}"`)
}

fs.rmSync(snapshotDistDir, {
  force: true,
  recursive: true
})

fs.mkdirSync(path.dirname(snapshotDistDir), { recursive: true })
fs.cpSync(sourceDistDir, snapshotDistDir, {
  force: true,
  recursive: true
})

console.log(`[build:snapshot-dist] Snapshotted compiled dist to "${snapshotDistDir}"`)
