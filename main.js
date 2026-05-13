const fs = require('fs')
const path = require('path')

const candidates = [
  path.join(__dirname, 'dist', 'main', 'main.js'),
  process.resourcesPath ? path.join(process.resourcesPath, 'app.asar', 'dist', 'main', 'main.js') : '',
  process.resourcesPath ? path.join(process.resourcesPath, 'app.asar.unpacked', 'dist', 'main', 'main.js') : '',
  process.resourcesPath ? path.join(process.resourcesPath, 'dist', 'main', 'main.js') : '',
  path.join(process.cwd(), 'dist', 'main', 'main.js')
].filter(Boolean)

const mainPath = candidates.find(candidate => fs.existsSync(candidate))

if (!mainPath) {
  throw new Error(`[bootstrap] Unable to locate dist/main/main.js. Tried:\n${candidates.join('\n')}`)
}

require(mainPath)
