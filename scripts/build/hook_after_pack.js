
/* IMPORT */

const fixLinuxSandbox = require ( './fix_linux_sandbox' );
const verifyPackagedMain = require ( './verify_packaged_main' );

/* AFTER PACK */

async function afterPack ( context ) {

  await fixLinuxSandbox ( context.targets, context.appOutDir );
  verifyPackagedMain ( context );

}

/* EXPORT */

module.exports = afterPack;
