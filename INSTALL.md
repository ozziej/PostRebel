# Installation & Running Guide

## Prerequisites

| Requirement | Minimum Version | Check Command |
|-------------|----------------|---------------|
| **Node.js** | 18.x or later | `node --version` |
| **npm** | 9.x or later | `npm --version` |
| **Git** | 2.x or later | `git --version` |

Electron 28 requires Node.js 18.x or later. Node.js 20 LTS or 22 LTS are recommended.

---

## macOS

### Install dependencies

**Option A — Homebrew (recommended):**

```bash
brew install node git
```

**Option B — Direct installers:**

- Download Node.js from https://nodejs.org (LTS version recommended)
- Git is included with Xcode Command Line Tools: `xcode-select --install`

### Clone and run

```bash
git clone https://github.com/<your-username>/PostRebel.git
cd PostRebel
npm install
npm run dev
```

### Build a distributable .app

```bash
npm run dist
```

The packaged application will be in the `dist/` directory.

---

## Windows

### Install dependencies

**Option A — winget (Windows 11 / Windows 10 with App Installer):**

```powershell
winget install OpenJS.NodeJS.LTS
winget install Git.Git
```

**Option B — Chocolatey:**

```powershell
choco install nodejs-lts git -y
```

**Option C — Direct installers:**

- Download Node.js from https://nodejs.org (LTS version, use the `.msi` installer)
- Download Git from https://git-scm.com/download/win

After installing, open a **new** terminal window so the `node`, `npm`, and `git` commands are on your PATH.

### Clone and run

```powershell
git clone https://github.com/<your-username>/PostRebel.git
cd PostRebel
npm install
npm run dev
```

> **Note:** On Windows, `npm run dev` uses `concurrently` to start both the React dev server and Electron. If you encounter issues, you can run them in two separate terminals:
>
> ```powershell
> # Terminal 1
> npm run dev:react
>
> # Terminal 2 (after "webpack compiled successfully" appears in Terminal 1)
> npm run dev:electron
> ```

### Build a distributable .exe

```powershell
npm run dist
```

The installer/portable executable will be in the `dist/` directory.

---

## Linux

### Install dependencies

**Debian / Ubuntu:**

```bash
sudo apt update
sudo apt install -y nodejs npm git

# If the packaged Node.js is too old (< 18), use NodeSource:
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

**Fedora:**

```bash
sudo dnf install -y nodejs npm git
```

**Arch Linux:**

```bash
sudo pacman -S nodejs npm git
```

**Any distro — via nvm (recommended if system Node.js is outdated):**

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.bashrc
nvm install 20
nvm use 20
```

### Clone and run

```bash
git clone https://github.com/<your-username>/PostRebel.git
cd PostRebel
npm install
npm run dev
```

### Build a distributable AppImage/deb/rpm

```bash
npm run dist
```

The packaged application will be in the `dist/` directory.

---

## Development vs Production

### Development mode

```bash
npm run dev
```

Starts a webpack dev server on `http://localhost:3000` with hot module reloading, then launches Electron pointing at that server. Changes to React components update live; changes to Electron code (`electron/main.ts` or `electron/preload.ts`) require restarting the process.

### Production build

```bash
npm run build
```

Compiles the React frontend (webpack production mode) and the Electron TypeScript into the `dist/` directory. You can then run the built app with:

```bash
npx electron .
```

### Distributable package

```bash
npm run dist
```

Uses electron-builder to produce platform-native packages (`.app`/`.dmg` on macOS, `.exe`/NSIS installer on Windows, `.AppImage`/`.deb`/`.rpm` on Linux).

---

## Troubleshooting

### `npm install` fails with node-gyp errors

Some Electron dependencies require native compilation. Ensure you have build tools installed:

- **macOS:** `xcode-select --install`
- **Windows:** `npm install -g windows-build-tools` (run as Administrator), or install Visual Studio Build Tools with the "Desktop development with C++" workload
- **Linux:** `sudo apt install -y build-essential python3` (Debian/Ubuntu) or equivalent for your distro

### Electron window is blank

The React dev server may not have started yet. Check that `http://localhost:3000` loads in a browser. If running `npm run dev`, the `wait-on` utility should handle this automatically, but firewall or port conflicts can interfere.

### Changes to preload.ts or main.ts not taking effect

The Electron main process and preload script are compiled once at launch. After changing these files:

```bash
npm run build:electron
```

Then restart the Electron app (quit and re-run `npm run dev:electron`, or restart the full `npm run dev`).

### `selectJsonFile is not a function` or similar API errors

This means the Electron preload script is stale. Rebuild and restart:

```bash
npm run build:electron
# Then restart the Electron process
```

### Request history not appearing

History is stored per workspace at `{workspace}/history/history.json`. If the file is missing or the workspace directory is not writable, entries won't persist. Check:

1. A workspace is selected (history is not recorded without one).
2. The workspace folder exists and is writable.
3. Restart the app — history is loaded from disk on workspace switch.
