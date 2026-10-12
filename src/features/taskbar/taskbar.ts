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
 * Standard ICO Container wrapper for PNG image data (Windows Vista/7/10/11 native support).
 * Enables seamless taskbar rendering without needing external image conversion binaries.
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

  // 2. ICONDIRENTRY (16 bytes)
  icoBuffer.writeUInt8(0, 6); // Width: 0 specifies 256px
  icoBuffer.writeUInt8(0, 7); // Height: 0 specifies 256px
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
 * Resolve target cache directory for generated vault icon (.ico)
 */
export function resolveVaultCacheIcoPath(plugin: PakCLILocalPlugin): string {
  const adapter = plugin.app.vault.adapter;
  const nodeRequire = (window as unknown as { require?: (module: string) => unknown }).require;
  if (!nodeRequire) return '';

  try {
    const path = nodeRequire('path') as { join(...paths: string[]): string };
    const vaultBase = plugin.vaultRoot || (adapter instanceof FileSystemAdapter ? adapter.getBasePath() : '');

    if (!vaultBase) return '';
    const configDir = plugin.app.vault.configDir || '.obsidian';
    const manifestId = plugin.manifest.id || 'pakcli-local';

    return path.join(vaultBase, configDir, 'plugins', manifestId, 'vault-taskbar.ico');
  } catch {
    return '';
  }
}

/**
 * Resolve icon location with fallback chain:
 * 1. Obsidian Appearance Icon (Settings -> Appearance -> Custom app icon) if sync is enabled
 * 2. Custom path from plugin settings
 * 3. Vault-level icons (.obsidian/icon.ico or plugins/pakcli-local/icon.ico)
 */
export function resolveEffectiveIconSource(plugin: PakCLILocalPlugin): { sourcePath: string; isAppearance: boolean } {
  const nodeRequire = (window as unknown as { require?: (module: string) => unknown }).require;
  if (!nodeRequire) return { sourcePath: '', isAppearance: false };

  const fs = nodeRequire('fs') as { existsSync(p: string): boolean };
  const path = nodeRequire('path') as { join(...paths: string[]): string };

  // 1. Sync with Obsidian Appearance Icon
  if (plugin.settings.taskbarSyncAppearance !== false) {
    const appIcon = getObsidianAppearanceIconPath();
    if (appIcon) {
      return { sourcePath: appIcon, isAppearance: true };
    }
  }

  // 2. Custom Path from settings
  const customPath = (plugin.settings.taskbarIconPath || '').trim();
  if (customPath && fs.existsSync(customPath)) {
    return { sourcePath: customPath, isAppearance: false };
  }

  // 3. Vault plugin default icon
  const adapter = plugin.app.vault.adapter;
  const vaultBase = plugin.vaultRoot || (adapter instanceof FileSystemAdapter ? adapter.getBasePath() : '');

  if (vaultBase) {
    const configDir = plugin.app.vault.configDir || '.obsidian';
    const manifestId = plugin.manifest.id || 'pakcli-local';

    const pluginIco = path.join(vaultBase, configDir, 'plugins', manifestId, 'icon.ico');
    if (fs.existsSync(pluginIco)) return { sourcePath: pluginIco, isAppearance: false };

    const vaultIco = path.join(vaultBase, configDir, 'icon.ico');
    if (fs.existsSync(vaultIco)) return { sourcePath: vaultIco, isAppearance: false };

    const vaultPng = path.join(vaultBase, configDir, 'icon.png');
    if (fs.existsSync(vaultPng)) return { sourcePath: vaultPng, isAppearance: false };
  }

  return { sourcePath: '', isAppearance: false };
}

/**
 * Ensure an icon file is ready for Windows Taskbar (.ico format).
 * If the source is .png, it automatically generates and caches a valid .ico file.
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
  const path = nodeRequire('path') as { extname(p: string): string; dirname(p: string): string };

  const ext = path.extname(sourcePath).toLowerCase();
  if (ext === '.ico') {
    return sourcePath;
  }

  if (ext === '.png') {
    try {
      const targetIcoPath = resolveVaultCacheIcoPath(plugin);
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
        console.log(`[PakCLI Local] Generated taskbar .ico from PNG (${icoBuf.length} bytes) -> ${targetIcoPath}`);
      }

      return targetIcoPath;
    } catch (err) {
      console.warn('[PakCLI Local] Failed to convert PNG to ICO:', err);
      return '';
    }
  }

  return sourcePath;
}

/**
 * Apply per-vault taskbar identity and icon via Electron setAppDetails
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
    let remote: { getCurrentWindow(): ElectronRemoteWindow } | null = null;
    try {
      remote = nodeRequire('@electron/remote') as { getCurrentWindow(): ElectronRemoteWindow };
    } catch {
      try {
        const electron = nodeRequire('electron') as { remote?: { getCurrentWindow(): ElectronRemoteWindow } };
        remote = electron?.remote || null;
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

    const currentWin = remote.getCurrentWindow();
    if (!currentWin || typeof currentWin.setAppDetails !== 'function') {
      const msg = 'BrowserWindow.setAppDetails is not supported on this Electron build.';
      console.warn(`[PakCLI Local] ${msg}`);
      if (showNotice) new Notice(`[PakCLI Local] ${msg}`);
      return { success: false, message: msg };
    }

    // 3. Resolve Target Icon
    const { sourcePath, isAppearance } = resolveEffectiveIconSource(plugin);
    if (!sourcePath) {
      const msg = 'No icon found. Set an icon in Settings -> Appearance -> Custom app icon or configure a custom path.';
      console.warn(`[PakCLI Local] ${msg}`);
      if (showNotice) {
        new Notice(`[PakCLI Local] No icon found. Please choose an icon in Settings -> Appearance -> Custom app icon.`);
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

    // 4. Resolve AppUserModelID (AUMID)
    const vaultName = plugin.app.vault.getName();
    const appId = (plugin.settings.taskbarCustomAppId || '').trim() || sanitizeVaultAppId(vaultName);

    // 5. Configure Relaunch Target
    const execPath = processObj?.execPath || 'obsidian';
    const relaunchCommand = `"${execPath}" "obsidian://open?vault=${encodeURIComponent(vaultName)}"`;
    const relaunchDisplayName = `Obsidian - ${vaultName}`;

    // 6. Invoke Electron API
    currentWin.setAppDetails({
      appId,
      appIconPath: finalIcoPath,
      relaunchCommand,
      relaunchDisplayName,
    });

    const originText = isAppearance ? 'Appearance settings' : 'custom path';
    const successMsg = `Taskbar identity updated for vault "${vaultName}" using ${originText} (AppId: ${appId})`;
    console.log(`[PakCLI Local] ${successMsg}`);
    if (showNotice) {
      new Notice(`✅ Taskbar icon applied from ${originText} ("${vaultName}")`);
    }

    return {
      success: true,
      message: successMsg,
      appId,
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
