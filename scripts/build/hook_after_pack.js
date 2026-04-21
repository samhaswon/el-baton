
/* IMPORT */

const fixLinuxSandbox = require ( './fix_linux_sandbox' );
const verifyPackagedMain = require ( './verify_packaged_main' );

/* AFTER PACK */

async function afterPack ({ targets, appOutDir }) {

  await fixLinuxSandbox ( targets, appOutDir );
  verifyPackagedMain ( appOutDir );

}

/* EXPORT */

module.exports = afterPack;
