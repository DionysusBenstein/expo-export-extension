# expo-export-extension

Turn an **Expo** (or React Native) **web export** into a **Chrome / browser extension** (Manifest V3). Handles CSP, file renames, and Expo Router in the extension popup.

## What it does

- **Renames `_expo` and other leading-underscore paths** — Chrome does not allow file/directory names starting with `_` in extensions; renames to `expo_expo`, etc., and patches references.
- **Moves inline scripts to an external file** — Extension CSP (`script-src 'self'`) forbids inline scripts; the script that sets `__EXPO_ROUTER_HYDRATE__` (and other globals) is moved to `expo-inline.js`.
- **Optional hydration off** — In the popup, URL and environment differ from the static export; disabling hydration avoids React hydration errors (e.g. #418).
- **Route normalization** — Popup URL is often `.../index.html`; the script normalizes to `/` so Expo Router shows the root route.
- **Popup size** — Injects a small style so the popup has a minimum width/height (default 400×600).
- **Manifest** — Copies your `manifest.json` into the build, or uses a default MV3 manifest (including `wasm-unsafe-eval` if you use SQLite/WASM).

## Requirements

- **Expo** project with **static web export** (e.g. `expo export -p web --output-dir web-export`).
- **Chrome** (or compatible) with Manifest V3.

## Install

```bash
npm install expo-export-extension --save-dev
# or
yarn add -D expo-export-extension
# or
pnpm add -D expo-export-extension
```

## Usage

### 1. Export web build

```bash
npx expo export -p web --output-dir web-export
```

(Or use your existing web export directory name.)

### 2. Run the tool

```bash
npx expo-export-extension
```

This reads from `web-export` and writes to `extension-build` by default.

### 3. Load in Chrome

- Open `chrome://extensions/`
- Enable “Developer mode”
- “Load unpacked” → select the `extension-build` folder

## Options

| Option | Default | Description |
|--------|---------|-------------|
| `-s, --source <dir>` | `web-export` | Source directory (Expo web export). |
| `-d, --dest <dir>` | `extension-build` | Output directory for the extension. |
| `-m, --manifest <path>` | *(none)* | Path to your `manifest.json`. If omitted, a default MV3 manifest is used. |
| `--manifest-version <v>` | *(none)* | Override `manifest.json` `version` (e.g. `1.2.3`). |
| `--manifest-version-from-package` | off | Set `manifest.json` `version` from `./package.json`. |
| `--hydrate` | off | Keep Expo Router hydration (use only if you don’t need it disabled). |
| `--no-hydrate` | on | Disable hydration (recommended for extension popup). |
| `--popup-width <px>` | `400` | Minimum popup width in pixels. |
| `--popup-height <px>` | `600` | Minimum popup height in pixels. |
| `-h, --help` | — | Show help. |

### Examples

```bash
# Default: web-export → extension-build, default manifest
npx expo-export-extension

# Custom paths and your manifest
npx expo-export-extension -s dist -d out -m extension/manifest.json

# Custom popup size
npx expo-export-extension --popup-width 420 --popup-height 640

# Force manifest version
npx expo-export-extension --manifest-version 1.0.1

# Sync manifest version from package.json
npx expo-export-extension --manifest-version-from-package
```

## Your extension manifest

Place your Manifest V3 `manifest.json` (e.g. in `extension/manifest.json`) and pass it with `-m`. At minimum it should have:

- `manifest_version: 3`
- `action.default_popup`: `"index.html"`
- For **WebAssembly** (e.g. expo-sqlite): in `content_security_policy.extension_pages` include `'wasm-unsafe-eval'` in `script-src`:

```json
{
  "manifest_version": 3,
  "name": "My App",
  "version": "1.0.0",
  "action": { "default_popup": "index.html" },
  "permissions": [],
  "content_security_policy": {
    "extension_pages": "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'"
  }
}
```

## Programmatic API

```js
const { prepareExtensionBuild } = require("expo-export-extension");

await prepareExtensionBuild({
  sourceDir: "web-export",
  destDir: "extension-build",
  manifestPath: "extension/manifest.json",
  disableHydration: true,
  popupMinWidth: 400,
  popupMinHeight: 600,
});
```

## npm script

In `package.json`:

```json
{
  "scripts": {
    "build:web": "expo export -p web --output-dir web-export",
    "build:extension": "npm run build:web && expo-export-extension -m extension/manifest.json"
  }
}
```

Then:

```bash
npm run build:extension
```

## Using from the same repo (development)

If you develop the tool in a monorepo or alongside your app:

```json
{
  "devDependencies": {
    "expo-export-extension": "file:./expo-export-extension"
  }
}
```

Then `yarn install` and `yarn build:extension` (or `npx expo-export-extension`) will use the local package.

## Publishing to npm

1. Set `repository.url` in `package.json` to your GitHub repo.
2. Bump version: `npm version patch`.
3. Publish: `npm publish`.

## License

MIT.
