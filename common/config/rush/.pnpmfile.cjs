'use strict';

/**
 * When using the PNPM package manager, you can use pnpmfile.js to workaround
 * dependencies that have mistakes in their package.json file.  (This feature is
 * functionally similar to Yarn's "resolutions".)
 *
 * For details, see the PNPM documentation:
 * https://pnpm.js.org/docs/en/hooks.html
 *
 * IMPORTANT: SINCE THIS FILE CONTAINS EXECUTABLE CODE, MODIFYING IT IS LIKELY TO INVALIDATE
 * ANY CACHED DEPENDENCY ANALYSIS.  After any modification to pnpmfile.js, it's recommended to run
 * "rush update --full" so that PNPM will recalculate all version selections.
 */
module.exports = {
  hooks: {
    readPackage
  }
};

/**
 * This hook is invoked during installation before a package's dependencies
 * are selected.
 * The `packageJson` parameter is the deserialized package.json
 * contents for the package that is about to be installed.
 * The `context` parameter provides a log() function.
 * The return value is the updated object.
 */
function readPackage(packageJson, context) {
  // Align @types/node across all package
  if (packageJson.devDependencies && packageJson.devDependencies['@types/node']) {
   context.log(`Fixed up '@types/node' devDependencies for ${packageJson.name}`);
   packageJson.devDependencies['@types/node'] = '18.11.9';
  }
  if (packageJson.peerDependencies && packageJson.peerDependencies['@types/node']) {
   context.log(`Fixed up '@types/node' peerDependencies for ${packageJson.name}`);
   packageJson.peerDependencies['@types/node'] = '18.11.9';
  }

  return packageJson;
}
