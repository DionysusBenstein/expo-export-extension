/**
 * expo-export-extension
 * Prepares an Expo web export for use as a Chrome/browser extension (Manifest V3).
 * - Renames _expo and other leading-underscore paths (Chrome disallows _ in extension files)
 * - Moves inline scripts to external file for CSP compliance
 * - Optionally disables hydration and normalizes route path for popup
 * - Injects popup min size and copies manifest
 */

const fs = require("fs");
const path = require("path");

async function pathExists(p) {
  try {
    await fs.promises.access(p);
    return true;
  } catch {
    return false;
  }
}

async function removeDir(dir) {
  if (!(await pathExists(dir))) return;
  const entries = await fs.promises.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) await removeDir(fullPath);
    else await fs.promises.unlink(fullPath);
  }
  await fs.promises.rmdir(dir);
}

async function copyDir(src, dest) {
  await fs.promises.mkdir(dest, { recursive: true });
  const entries = await fs.promises.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destName = entry.name.startsWith("_") ? "expo_" + entry.name.slice(1) : entry.name;
    const destPath = path.join(dest, destName);
    if (entry.isDirectory()) await copyDir(srcPath, destPath);
    else await fs.promises.copyFile(srcPath, destPath);
  }
}

const TEXT_EXTENSIONS = new Set([".html", ".js", ".cjs", ".mjs", ".css", ".map", ".json"]);

function isTextFile(filePath) {
  return TEXT_EXTENSIONS.has(path.extname(filePath));
}

function patchPathReferences(content) {
  return content
    .replace(/\/_expo\//g, "/expo_expo/")
    .replace(/_sitemap\.html/g, "expo_sitemap.html")
    .replace(/\/_sitemap\b/g, "/expo_sitemap")
    .replace(/"_\+not-found\.html"/g, '"expo_+not-found.html"');
}

async function patchFile(filePath) {
  if (!isTextFile(filePath)) return;
  const original = await fs.promises.readFile(filePath, "utf8");
  const replaced = patchPathReferences(original);
  if (replaced !== original) await fs.promises.writeFile(filePath, replaced, "utf8");
}

async function walkAndPatch(dir) {
  const entries = await fs.promises.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) await walkAndPatch(fullPath);
    else if (entry.isFile()) await patchFile(fullPath);
  }
}

async function readPackageJsonVersion(cwd) {
  const pkgPath = path.join(cwd, "package.json");
  if (!(await pathExists(pkgPath))) return null;
  try {
    const pkg = JSON.parse(await fs.promises.readFile(pkgPath, "utf8"));
    return typeof pkg.version === "string" && pkg.version.trim() ? pkg.version.trim() : null;
  } catch {
    return null;
  }
}

const INLINE_SCRIPT_REGEX = /<script\s+type="module">([\s\S]*?)<\/script>/i;

async function collectHtmlFiles(dir, list = []) {
  const entries = await fs.promises.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) await collectHtmlFiles(fullPath, list);
    else if (entry.name.endsWith(".html")) list.push(fullPath);
  }
  return list;
}

/**
 * @param {object} options
 * @param {string} options.destDir - extension-build directory
 * @param {boolean} [options.disableHydration=true] - set __EXPO_ROUTER_HYDRATE__ = false
 * @param {number} [options.popupMinWidth=400]
 * @param {number} [options.popupMinHeight=600]
 */
async function fixHtmlAndInlineScripts(options) {
  const { destDir, disableHydration = true, popupMinWidth = 400, popupMinHeight = 600 } = options;
  const htmlFiles = await collectHtmlFiles(destDir);
  let hasInline = false;
  for (const filePath of htmlFiles) {
    const html = await fs.promises.readFile(filePath, "utf8");
    if (INLINE_SCRIPT_REGEX.test(html)) {
      hasInline = true;
      break;
    }
  }
  if (!hasInline) return;

  const expoInlineLines = [
    "if (typeof global === 'undefined') { globalThis.global = globalThis; }",
    "if (typeof globalThis.process === 'undefined') { globalThis.process = { env: { NODE_ENV: 'production' } }; }",
  ];
  if (disableHydration) {
    expoInlineLines.push("globalThis.__EXPO_ROUTER_HYDRATE__ = false;");
  } else {
    expoInlineLines.push("globalThis.__EXPO_ROUTER_HYDRATE__ = true;");
  }
  expoInlineLines.push(
    "if (typeof window !== 'undefined' && (window.location.pathname === '/index.html' || window.location.pathname === '/')) { try { window.history.replaceState(null, '', '/'); } catch (e) {} }"
  );
  const expoInlineContent = expoInlineLines.join("\n") + "\n";
  const externalPath = path.join(destDir, "expo-inline.js");
  await fs.promises.writeFile(externalPath, expoInlineContent, "utf8");

  const externalRef = '<script src="/expo-inline.js"></script>';
  const popupStyle =
    popupMinWidth > 0 || popupMinHeight > 0
      ? `<style id="extension-popup-size">html,body,#root{min-width:${popupMinWidth}px;min-height:${popupMinHeight}px;}</style>`
      : "";

  for (const filePath of htmlFiles) {
    let html = await fs.promises.readFile(filePath, "utf8");
    if (!INLINE_SCRIPT_REGEX.test(html)) continue;
    html = html.replace(INLINE_SCRIPT_REGEX, externalRef);
    if (popupStyle && !html.includes("extension-popup-size")) {
      html = html.replace("</head>", popupStyle + "</head>");
    }
    await fs.promises.writeFile(filePath, html, "utf8");
  }
}

/**
 * Prepare an Expo web export for use as a browser extension.
 *
 * @param {object} options
 * @param {string} [options.sourceDir='web-export'] - Expo export output (e.g. from `expo export -p web --output-dir web-export`)
 * @param {string} [options.destDir='extension-build'] - Output directory for the extension
 * @param {string|null} [options.manifestPath] - Path to your extension manifest.json; if null, a default MV3 manifest is written
 * @param {string|null} [options.manifestVersion] - Override manifest.json "version" (e.g. 1.2.3)
 * @param {boolean} [options.manifestVersionFromPackage=false] - If true, set manifest.json "version" from ./package.json
 * @param {boolean} [options.disableHydration=true] - Set to false if you do not use Expo Router or want to keep hydration
 * @param {number} [options.popupMinWidth=400]
 * @param {number} [options.popupMinHeight=600]
 * @returns {Promise<{ destDir: string }>}
 */
async function prepareExtensionBuild(options = {}) {
  const {
    sourceDir = "web-export",
    destDir = "extension-build",
    manifestPath = null,
    manifestVersion = null,
    manifestVersionFromPackage = false,
    disableHydration = true,
    popupMinWidth = 400,
    popupMinHeight = 600,
  } = options;

  const resolvedSource = path.resolve(process.cwd(), sourceDir);
  const resolvedDest = path.resolve(process.cwd(), destDir);

  if (!(await pathExists(resolvedSource))) {
    throw new Error(
      `Source directory "${resolvedSource}" not found. Run \`expo export -p web --output-dir ${sourceDir}\` first.`
    );
  }

  await removeDir(resolvedDest);
  await copyDir(resolvedSource, resolvedDest);
  await walkAndPatch(resolvedDest);
  await fixHtmlAndInlineScripts({
    destDir: resolvedDest,
    disableHydration,
    popupMinWidth,
    popupMinHeight,
  });

  const manifestDest = path.join(resolvedDest, "manifest.json");
  const desiredManifestVersion =
    manifestVersion ??
    (manifestVersionFromPackage ? await readPackageJsonVersion(process.cwd()) : null);

  if (manifestPath) {
    const resolvedManifest = path.resolve(process.cwd(), manifestPath);
    if (!(await pathExists(resolvedManifest))) {
      console.warn(`Manifest not found at "${resolvedManifest}". Extension may fail to load.`);
    } else {
      const manifestJson = await fs.promises.readFile(resolvedManifest, "utf8");
      const manifest = JSON.parse(manifestJson);
      if (desiredManifestVersion) manifest.version = desiredManifestVersion;
      await fs.promises.writeFile(manifestDest, JSON.stringify(manifest, null, 2), "utf8");
    }
  } else {
    const defaultManifestPath = path.join(__dirname, "..", "default-manifest.json");
    const defaultJson = await fs.promises.readFile(defaultManifestPath, "utf8");
    const manifest = JSON.parse(defaultJson);
    if (desiredManifestVersion) manifest.version = desiredManifestVersion;
    await fs.promises.writeFile(manifestDest, JSON.stringify(manifest, null, 2), "utf8");
  }

  return { destDir: resolvedDest };
}

module.exports = { prepareExtensionBuild };
