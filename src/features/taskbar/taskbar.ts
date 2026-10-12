import { FileSystemAdapter, Notice, Platform } from 'obsidian';
import type PakCLILocalPlugin from '../../main';
import { ElectronRemoteWindow, TaskbarApplyResult } from './types';

/**
 * Sanitize vault name for AppUserModelID (AUMID).
 * Replace all non-alphanumeric chars with an underscore.
 */
export function sanitizeVaultAppId(vaultName: string): string {
  const sanitized = vaultName.replace(/[^\w]/g, '_');
  return `md.obsidian.vault.${sanitized}`;
}

/**
 * Strict Vault Boundary Check:
 * Ensures a BrowserWindow belongs strictly to THIS specific vault.
 * Never touches or collapses windows belonging to other open vaults.
 */
export function isWindowBelongingToVault(win: ElectronRemoteWindow, vaultName: string, mainWinId?: number): boolean {
  if (mainWinId && win.id === mainWinId) {
    return true;
  }
  const anyWin = win as any;
  const title = typeof anyWin.getTitle === 'function' ? anyWin.getTitle() : '';
  if (!title) return false;

  // Obsidian window title convention: "<Page/Note> - <VaultName> - Obsidian <Version>"
  // E.g.: "Settings - SAMPLE-DEMO-THEME-PLUGIN - Obsidian 1.14.4"
  return (
    title.includes(` - ${vaultName} - `) ||
    title.endsWith(` - ${vaultName}`) ||
    title.includes(` ${vaultName} `) ||
    title === vaultName
  );
}

/**
 * Standard ICO Container wrapper for PNG image data.
 * Parses true dimensions from PNG IHDR chunk (offset 16-24) to prevent Windows DWM render black/blank glitch.
 */
export function convertPngBufferToIco(pngBuffer: Buffer): Buffer {
  const icoHeaderSize = 6;
  const dirEntrySize = 16;
  const totalHeaderSize = icoHeaderSize + dirEntrySize;
  const icoBuffer = Buffer.alloc(totalHeaderSize + pngBuffer.length);

  // 1. ICONDIR (6 bytes)
  icoBuffer.writeUInt16LE(0, 0); // Reserved (0)
  icoBuffer.writeUInt16LE(1, 2); // Type 1 = Icon (.ICO)
  icoBuffer.writeUInt16LE(1, 4); // Number of images = 1

  // Extract true width & height from PNG IHDR chunk
  let widthByte = 0; // 0 represents 256 in ICO spec
  let heightByte = 0;
  if (pngBuffer.length >= 24 && pngBuffer.readUInt32BE(0) === 0x89504E47) {
    const trueWidth = pngBuffer.readUInt32BE(16);
    const trueHeight = pngBuffer.readUInt32BE(20);
    widthByte = trueWidth >= 256 ? 0 : trueWidth;
    heightByte = trueHeight >= 256 ? 0 : trueHeight;
  }

  // 2. ICONDIRENTRY (16 bytes)
  icoBuffer.writeUInt8(widthByte, 6); // Width
  icoBuffer.writeUInt8(heightByte, 7); // Height
  icoBuffer.writeUInt8(0, 8); // Color count: 0 (no palette)
  icoBuffer.writeUInt8(0, 9); // Reserved (0)
  icoBuffer.writeUInt16LE(1, 10); // Color planes: 1
  icoBuffer.writeUInt16LE(32, 12); // Bits per pixel: 32 (RGBA)
  icoBuffer.writeUInt32LE(pngBuffer.length, 14); // PNG Image Size
  icoBuffer.writeUInt32LE(totalHeaderSize, 18); // Offset to PNG payload (22)

  // 3. Raw PNG Payload
  pngBuffer.copy(icoBuffer, totalHeaderSize);

  return icoBuffer;
}

/**
 * Detects the Obsidian native Appearance Icon path saved when user sets
 * Settings -> Appearance -> Advanced -> "Custom app icon"
 */
export function getObsidianAppearanceIconPath(): string {
  try {
    const nodeRequire = (window as unknown as { require?: (module: string) => unknown }).require;
    if (!nodeRequire) return '';
    const path = nodeRequire('path') as { join(...paths: string[]): string };
    const fs = nodeRequire('fs') as { existsSync(p: string): boolean };
    const processObj = (window as unknown as { process?: { env?: Record<string, string> } }).process;
    const appData = processObj?.env?.APPDATA;
    if (!appData) return '';

    const appearancePng = path.join(appData, 'obsidian', 'icon.png');
    return fs.existsSync(appearancePng) ? appearancePng : '';
  } catch {
    return '';
  }
}

/**
 * Returns the vault root path safely
 */
export function getVaultRootPath(plugin: PakCLILocalPlugin): string {
  const adapter = plugin.app.vault.adapter;
  return plugin.vaultRoot || (adapter instanceof FileSystemAdapter ? adapter.getBasePath() : '');
}

/**
 * Checks for vault artifacts icon:
 * <vaultBase>/artifacts/icon.ico or <vaultBase>/artifacts/icon.png
 * (also checks singular <vaultBase>/artifact/)
 */
export function resolveVaultArtifactsIcon(plugin: PakCLILocalPlugin): { path: string; isIco: boolean } | null {
  const nodeRequire = (window as unknown as { require?: (module: string) => unknown }).require;
  if (!nodeRequire) return null;

  const fs = nodeRequire('fs') as { existsSync(p: string): boolean };
  const path = nodeRequire('path') as { join(...paths: string[]): string };
  const vaultBase = getVaultRootPath(plugin);
  if (!vaultBase) return null;

  const candidates = [
    { p: path.join(vaultBase, 'artifacts', 'icon.ico'), isIco: true },
    { p: path.join(vaultBase, 'artifacts', 'icon.png'), isIco: false },
    { p: path.join(vaultBase, 'artifact', 'icon.ico'), isIco: true },
    { p: path.join(vaultBase, 'artifact', 'icon.png'), isIco: false },
  ];

  for (const item of candidates) {
    if (fs.existsSync(item.p)) {
      return { path: item.p, isIco: item.isIco };
    }
  }

  return null;
}

/**
 * Resolve target path strictly inside <vault>/artifacts/icon.ico.
 * Automatically creates <vault>/artifacts directory if it does not exist.
 * NEVER writes inside the plugin folder!
 */
export function resolveVaultArtifactsIcoPath(plugin: PakCLILocalPlugin): string {
  const nodeRequire = (window as unknown as { require?: (module: string) => unknown }).require;
  if (!nodeRequire) return '';

  try {
    const path = nodeRequire('path') as { join(...paths: string[]): string };
    const fs = nodeRequire('fs') as { existsSync(p: string): boolean; mkdirSync(p: string, opts?: { recursive?: boolean }): void };
    const vaultBase = getVaultRootPath(plugin);
    if (!vaultBase) return '';

    const artifactsDir = path.join(vaultBase, 'artifacts');
    if (!fs.existsSync(artifactsDir)) {
      fs.mkdirSync(artifactsDir, { recursive: true });
    }

    return path.join(artifactsDir, 'icon.ico');
  } catch {
    return '';
  }
}

/**
 * Relocate/Copy the current Obsidian Appearance icon into <vault>/artifacts/icon.png and <vault>/artifacts/icon.ico
 */
export async function saveAppearanceIconToArtifacts(plugin: PakCLILocalPlugin): Promise<TaskbarApplyResult> {
  const nodeRequire = (window as unknown as { require?: (module: string) => unknown }).require;
  if (!nodeRequire) {
    return { success: false, message: 'Node.js require not available' };
  }

  try {
    const fs = nodeRequire('fs') as {
      existsSync(p: string): boolean;
      mkdirSync(p: string, opts?: { recursive?: boolean }): void;
      readFileSync(p: string): Buffer;
      writeFileSync(p: string, data: Buffer): void;
    };
    const path = nodeRequire('path') as { join(...paths: string[]): string };
    const vaultBase = getVaultRootPath(plugin);
    if (!vaultBase) {
      throw new Error('Unable to resolve vault root path');
    }

    const appIcon = getObsidianAppearanceIconPath();
    if (!appIcon) {
      throw new Error('No custom icon found in Obsidian Appearance settings (%APPDATA%/obsidian/icon.png)');
    }

    const artifactsDir = path.join(vaultBase, 'artifacts');
    if (!fs.existsSync(artifactsDir)) {
      fs.mkdirSync(artifactsDir, { recursive: true });
    }

    const pngBuffer = fs.readFileSync(appIcon);
    const targetPngPath = path.join(artifactsDir, 'icon.png');
    const targetIcoPath = path.join(artifactsDir, 'icon.ico');

    // 1. Write PNG into vault artifacts/
    fs.writeFileSync(targetPngPath, pngBuffer);

    // 2. Wrap as ICO with true dimensions into vault artifacts/
    const icoBuffer = convertPngBufferToIco(pngBuffer);
    fs.writeFileSync(targetIcoPath, icoBuffer);

    new Notice(`✨ Icon saved to vault artifacts: artifacts/icon.ico`);
    console.log(`[PakCLI Local] Relocated Appearance icon strictly to vault artifacts: ${targetIcoPath}`);

    // Immediately re-apply to taskbar
    return await applyTaskbarIcon(plugin, true);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    new Notice(`❌ Failed to copy icon to artifacts: ${msg}`);
    console.error('[PakCLI Local] Failed to copy icon to artifacts:', err);
    return { success: false, message: msg };
  }
}

/**
 * Resolve icon location with fallback chain (Vault Artifacts ONLY):
 * 1. <vaultBase>/artifacts/icon.ico or icon.png
 * 2. <vaultBase>/artifact/icon.ico or icon.png
 * 3. Custom path from plugin settings
 * 4. Obsidian Appearance Icon (%APPDATA%/obsidian/icon.png)
 */
export function resolveEffectiveIconSource(plugin: PakCLILocalPlugin): { sourcePath: string; origin: string } {
  const nodeRequire = (window as unknown as { require?: (module: string) => unknown }).require;
  if (!nodeRequire) return { sourcePath: '', origin: 'unknown' };

  const fs = nodeRequire('fs') as { existsSync(p: string): boolean };
  const path = nodeRequire('path') as { join(...paths: string[]): string };

  // 1. Check Vault Artifacts (artifacts/ or artifact/)
  const artifactIcon = resolveVaultArtifactsIcon(plugin);
  if (artifactIcon) {
    return { sourcePath: artifactIcon.path, origin: 'vault artifacts (artifacts/)' };
  }

  // 2. Custom Path from settings
  const customPath = (plugin.settings.taskbarIconPath || '').trim();
  if (customPath && fs.existsSync(customPath)) {
    return { sourcePath: customPath, origin: 'custom setting path' };
  }

  // 3. Sync with Obsidian Appearance Icon
  if (plugin.settings.taskbarSyncAppearance !== false) {
    const appIcon = getObsidianAppearanceIconPath();
    if (appIcon) {
      return { sourcePath: appIcon, origin: 'Obsidian Appearance setting' };
    }
  }

  // 4. Vault root icons (.obsidian/icon.ico or icon.png)
  const vaultBase = getVaultRootPath(plugin);
  if (vaultBase) {
    const configDir = plugin.app.vault.configDir || '.obsidian';
    const vaultIco = path.join(vaultBase, configDir, 'icon.ico');
    if (fs.existsSync(vaultIco)) return { sourcePath: vaultIco, origin: '.obsidian/icon.ico' };

    const vaultPng = path.join(vaultBase, configDir, 'icon.png');
    if (fs.existsSync(vaultPng)) return { sourcePath: vaultPng, origin: '.obsidian/icon.png' };
  }

  return { sourcePath: '', origin: 'none' };
}

/**
 * Ensure an icon file is ready for Windows Taskbar (.ico format).
 * If the source is .png, it automatically generates and saves the .ico strictly into <vault>/artifacts/icon.ico!
 * Never touches the plugin folder!
 */
export function ensureIcoFile(plugin: PakCLILocalPlugin, sourcePath: string): string {
  const nodeRequire = (window as unknown as { require?: (module: string) => unknown }).require;
  if (!nodeRequire || !sourcePath) return '';

  const fs = nodeRequire('fs') as {
    readFileSync(p: string): Buffer;
    writeFileSync(p: string, data: Buffer): void;
    statSync(p: string): { mtimeMs: number };
    existsSync(p: string): boolean;
  };
  const path = nodeRequire('path') as { extname(p: string): string };

  const ext = path.extname(sourcePath).toLowerCase();
  if (ext === '.ico') {
    return sourcePath;
  }

  if (ext === '.png') {
    try {
      const targetIcoPath = resolveVaultArtifactsIcoPath(plugin);
      if (!targetIcoPath) return '';

      let needsRebuild = true;
      if (fs.existsSync(targetIcoPath)) {
        const sourceMtime = fs.statSync(sourcePath).mtimeMs;
        const targetMtime = fs.statSync(targetIcoPath).mtimeMs;
        if (targetMtime >= sourceMtime) {
          needsRebuild = false;
        }
      }

      if (needsRebuild) {
        const pngBuf = fs.readFileSync(sourcePath);
        const icoBuf = convertPngBufferToIco(pngBuf);
        fs.writeFileSync(targetIcoPath, icoBuf);
        console.log(`[PakCLI Local] Saved taskbar .ico strictly to vault artifacts: ${targetIcoPath}`);
      }

      return targetIcoPath;
    } catch (err) {
      console.warn('[PakCLI Local] Failed to convert PNG to ICO in artifacts:', err);
      return '';
    }
  }

  return sourcePath;
}

/**
 * Apply per-vault taskbar identity and icon via Electron setAppDetails to main and sub-windows.
 * Strictly guarantees that windows belonging to other open vaults are NEVER modified or grouped!
 */
export async function applyTaskbarIcon(
  plugin: PakCLILocalPlugin,
  showNotice = false
): Promise<TaskbarApplyResult> {
  // 1. Guard Platform: Windows Desktop Only
  const processObj = (window as unknown as { process?: { platform?: string; execPath?: string } }).process;
  if (!Platform.isDesktopApp || processObj?.platform !== 'win32') {
    return { success: false, message: 'Non-Windows environment; taskbar styling skipped.' };
  }

  try {
    const nodeRequire = (window as unknown as { require?: (module: string) => unknown }).require;
    if (!nodeRequire) {
      throw new Error('window.require is not available in this environment');
    }

    // 2. Resolve Remote Module: @electron/remote -> electron.remote
    let remote: any = null;
    try {
      remote = nodeRequire('@electron/remote');
    } catch {
      try {
        remote = (nodeRequire('electron') as any)?.remote;
      } catch {
        remote = null;
      }
    }

    if (!remote || typeof remote.getCurrentWindow !== 'function') {
      const msg = 'Electron remote not exposed in this Obsidian build.';
      console.warn(`[PakCLI Local] ${msg}`);
      if (showNotice) new Notice(`[PakCLI Local] ${msg}`);
      return { success: false, message: msg };
    }

    const currentWin: ElectronRemoteWindow = remote.getCurrentWindow();
    if (!currentWin || typeof currentWin.setAppDetails !== 'function') {
      const msg = 'BrowserWindow.setAppDetails is not supported on this Electron build.';
      console.warn(`[PakCLI Local] ${msg}`);
      if (showNotice) new Notice(`[PakCLI Local] ${msg}`);
      return { success: false, message: msg };
    }

    // 3. Resolve Target Icon
    const { sourcePath, origin } = resolveEffectiveIconSource(plugin);
    if (!sourcePath) {
      const msg = 'No icon found in artifacts/ or settings. Place icon.ico in artifacts/ or copy from Appearance settings.';
      console.warn(`[PakCLI Local] ${msg}`);
      if (showNotice) {
        new Notice(`[PakCLI Local] No icon found. Click "Save Appearance Icon to Artifacts" in settings or put icon.ico in artifacts/.`);
      }
      return { success: false, message: msg };
    }

    const finalIcoPath = ensureIcoFile(plugin, sourcePath);
    if (!finalIcoPath) {
      const msg = `Unable to prepare .ico file from: ${sourcePath}`;
      console.warn(`[PakCLI Local] ${msg}`);
      if (showNotice) new Notice(`[PakCLI Local] ${msg}`);
      return { success: false, message: msg };
    }

    // 4. Resolve AppUserModelID (AUMID) strictly per vault
    const vaultName = plugin.app.vault.getName();
    const baseAppId = (plugin.settings.taskbarCustomAppId || '').trim() || sanitizeVaultAppId(vaultName);

    // 5. Configure Relaunch Target
    const execPath = processObj?.execPath || 'obsidian';
    const relaunchCommand = `"${execPath}" "obsidian://open?vault=${encodeURIComponent(vaultName)}"`;
    const relaunchDisplayName = `Obsidian - ${vaultName}`;

    // 6. Gather all open Electron windows
    const allWindows: ElectronRemoteWindow[] = [];
    if (typeof remote.BrowserWindow?.getAllWindows === 'function') {
      try {
        const wins = remote.BrowserWindow.getAllWindows();
        if (Array.isArray(wins)) {
          allWindows.push(...wins);
        }
      } catch {}
    }
    if (!allWindows.includes(currentWin)) {
      allWindows.push(currentWin);
    }

    // 7. Invoke Electron API on main window of THIS vault
    currentWin.setAppDetails({
      appId: baseAppId,
      appIconPath: finalIcoPath,
      relaunchCommand,
      relaunchDisplayName,
    });

    // Also update window window-icon directly if supported (Electron nativeImage / setIcon)
    try {
      if (typeof (currentWin as any).setIcon === 'function') {
        const electronModule = nodeRequire('electron') as { nativeImage?: { createFromPath(p: string): unknown } };
        const nativeImage = electronModule?.nativeImage || (remote as any)?.nativeImage;
        if (nativeImage && typeof nativeImage.createFromPath === 'function') {
          const img = nativeImage.createFromPath(finalIcoPath);
          if (img && !(img as any).isEmpty?.()) {
            (currentWin as any).setIcon(img);
          }
        }
      }
    } catch (iconErr) {
      console.warn('[PakCLI Local] Non-fatal: could not set window icon directly:', iconErr);
    }

    // 8. Handle Sub-windows (Settings, popouts) strictly belonging to THIS vault
    const subwindowMode = plugin.settings.taskbarSubwindowMode || 'subwindows-collapse';
    if (subwindowMode !== 'none') {
      for (const win of allWindows) {
        if (win === currentWin) continue;

        // STRICT GUARD: Only modify sub-windows that belong to THIS vault!
        // Never touch or collapse windows from other open vaults!
        if (!isWindowBelongingToVault(win, vaultName, currentWin.id)) {
          continue;
        }

        try {
          if (typeof win.setAppDetails === 'function') {
            const subAppId = subwindowMode === 'subwindows-collapse'
              ? baseAppId
              : `${baseAppId}.sub.${win.id || Math.random().toString(36).slice(2, 6)}`;

            win.setAppDetails({
              appId: subAppId,
              appIconPath: finalIcoPath,
              relaunchCommand,
              relaunchDisplayName,
            });
          }

          // Also set window icon directly on subwindow
          if (typeof (win as any).setIcon === 'function') {
            const electronModule = nodeRequire('electron') as { nativeImage?: { createFromPath(p: string): unknown } };
            const nativeImage = electronModule?.nativeImage || (remote as any)?.nativeImage;
            if (nativeImage && typeof nativeImage.createFromPath === 'function') {
              const img = nativeImage.createFromPath(finalIcoPath);
              if (img && !(img as any).isEmpty?.()) {
                (win as any).setIcon(img);
              }
            }
          }
        } catch (subErr) {
          console.warn('[PakCLI Local] Failed to update subwindow app details:', subErr);
        }
      }
    }

    const successMsg = `Taskbar identity updated for vault "${vaultName}" from ${origin} (AppId: ${baseAppId}, Subwindows: ${subwindowMode})`;
    console.log(`[PakCLI Local] ${successMsg}`);
    if (showNotice) {
      new Notice(`✅ Taskbar icon applied from ${origin} ("${vaultName}")`);
    }

    return {
      success: true,
      message: successMsg,
      appId: baseAppId,
      iconPath: finalIcoPath,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('[PakCLI Local] Error applying taskbar icon:', error);
    if (showNotice) {
      new Notice(`❌ Failed to apply taskbar icon: ${errorMsg}`);
    }
    return { success: false, message: errorMsg };
  }
}

/**
 * Monitor new windows (Settings, Popout windows, Modals) and apply taskbar details automatically.
 * Strictly filters to only touch windows belonging to THIS vault.
 */
export function registerSubwindowLifecycleWatcher(plugin: PakCLILocalPlugin): void {
  const processObj = (window as unknown as { process?: { platform?: string } }).process;
  if (!Platform.isDesktopApp || processObj?.platform !== 'win32') return;

  const nodeRequire = (window as unknown as { require?: (module: string) => unknown }).require;
  if (!nodeRequire) return;

  let remote: any = null;
  try {
    remote = nodeRequire('@electron/remote');
  } catch {
    try {
      remote = (nodeRequire('electron') as any)?.remote;
    } catch {}
  }

  // 1. Electron app browser-window-created event
  if (remote?.app && typeof remote.app.on === 'function') {
    try {
      remote.app.on('browser-window-created', (_event: any, newWin: any) => {
        window.setTimeout(() => {
          const vaultName = plugin.app.vault.getName();
          const mainWinId = remote.getCurrentWindow()?.id;
          if (
            plugin.settings.taskbarSubwindowMode !== 'none' &&
            typeof newWin?.setAppDetails === 'function' &&
            isWindowBelongingToVault(newWin, vaultName, mainWinId)
          ) {
            void applyTaskbarIcon(plugin, false);
          }
        }, 300);
      });
    } catch (err) {
      console.warn('[PakCLI Local] Failed to register browser-window-created watcher:', err);
    }
  }

  // 2. Obsidian Workspace window-open event (e.g. popout notes)
  plugin.registerEvent(
    plugin.app.workspace.on('window-open', () => {
      window.setTimeout(() => {
        void applyTaskbarIcon(plugin, false);
      }, 350);
    })
  );
}
