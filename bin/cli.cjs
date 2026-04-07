#!/usr/bin/env node

const path = require("path");
const { prepareExtensionBuild } = require("../lib/prepare.cjs");

const args = process.argv.slice(2);
let sourceDir = "web-export";
let destDir = "extension-build";
let manifestPath = null;
let manifestVersion = null;
let manifestVersionFromPackage = false;
let disableHydration = true;
let popupMinWidth = 400;
let popupMinHeight = 600;

for (let i = 0; i < args.length; i++) {
  switch (args[i]) {
    case "--source":
    case "-s":
      sourceDir = args[++i] || sourceDir;
      break;
    case "--dest":
    case "-d":
      destDir = args[++i] || destDir;
      break;
    case "--manifest":
    case "-m":
      manifestPath = args[++i] || null;
      break;
    case "--manifest-version":
      manifestVersion = args[++i] || null;
      break;
    case "--manifest-version-from-package":
      manifestVersionFromPackage = true;
      break;
    case "--hydrate":
      disableHydration = false;
      break;
    case "--no-hydrate":
      disableHydration = true;
      break;
    case "--popup-width":
      popupMinWidth = parseInt(args[++i], 10) || 400;
      break;
    case "--popup-height":
      popupMinHeight = parseInt(args[++i], 10) || 600;
      break;
    case "--help":
    case "-h":
      console.log(`
expo-export-extension — Prepare Expo web export as a browser extension (Chrome MV3)

Usage:
  npx expo-export-extension [options]

Options:
  -s, --source <dir>     Source directory (default: web-export)
  -d, --dest <dir>      Output directory (default: extension-build)
  -m, --manifest <path> Path to your manifest.json (default: use bundled template)
  --manifest-version <v> Override manifest.json "version" (e.g. 1.2.3)
  --manifest-version-from-package  Set manifest.json "version" from ./package.json
  --hydrate             Keep Expo Router hydration (default: disabled for extension)
  --no-hydrate          Disable hydration (default)
  --popup-width <px>     Min popup width (default: 400)
  --popup-height <px>   Min popup height (default: 600)
  -h, --help            Show this help

Example:
  expo export -p web --output-dir web-export
  npx expo-export-extension -m extension/manifest.json
`);
      process.exit(0);
    default:
      break;
  }
}

prepareExtensionBuild({
  sourceDir,
  destDir,
  manifestPath,
  manifestVersion,
  manifestVersionFromPackage,
  disableHydration,
  popupMinWidth,
  popupMinHeight,
})
  .then(({ destDir: out }) => {
    console.log(`Extension build prepared at: ${out}`);
  })
  .catch((err) => {
    console.error("expo-export-extension failed:", err.message);
    process.exit(1);
  });
