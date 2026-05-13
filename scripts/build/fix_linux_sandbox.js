/* IMPORT */

const fs = require('fs')
const path = require('path')

/* HELPERS */

function isLinux (targets) {
  const re = /AppImage|snap|deb|rpm|freebsd|pacman/i
  return !!targets.find(target => re.test(target.name))
}

/* FIX LINUX SANDBOX */

// Disabling the sandbox on Linux
// TODO: Remove this once the upstream bug has been fixed //URL: https://github.com/electron/electron/issues/17972

async function fixLinuxSandbox (targets, cwd) {
  if (!isLinux(targets)) return

  const scriptPath = path.join(cwd, 'el-baton')
  const binaryPath = path.join(cwd, 'el-baton.bin')
  const script = ['#!/bin/bash\n"', '$', '{BASH_SOURCE%/*}', '"/el-baton.bin "$@" --no-sandbox'].join('')

  fs.renameSync(scriptPath, binaryPath)

  fs.writeFileSync(scriptPath, script)

  fs.chmodSync(scriptPath, 0o755)
}

/* EXPORT */

module.exports = fixLinuxSandbox
