/* IMPORT */

const fixLinuxSandbox = require('./fix_linux_sandbox')
const ensurePackagedDist = require('./ensure_packaged_dist')
const verifyPackagedMain = require('./verify_packaged_main')

/* AFTER PACK */

async function afterPack (context) {
  await fixLinuxSandbox(context.targets, context.appOutDir)
  ensurePackagedDist(context)
  verifyPackagedMain(context)
}

/* EXPORT */

module.exports = afterPack
