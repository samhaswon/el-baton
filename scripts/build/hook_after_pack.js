
/* IMPORT */

const fixLinuxSandbox = require ( './fix_linux_sandbox' );
const copyPackagedDist = require ( './copy_packaged_dist' );
const verifyPackagedMain = require ( './verify_packaged_main' );

/* AFTER PACK */

async function afterPack ( context ) {

  await fixLinuxSandbox ( context.targets, context.appOutDir );
  copyPackagedDist ( context );
  verifyPackagedMain ( context );

}

/* EXPORT */

module.exports = afterPack;
