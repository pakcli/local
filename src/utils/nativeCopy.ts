import { App, Notice, Platform, TAbstractFile } from 'obsidian';
import { getNodeChildProcess, getNodeFs } from './nodeHelpers';

/**
 * Resolves the absolute physical filesystem path for any Obsidian vault file or folder.
 */
export function getAbsoluteFileSystemPath(app: App, file: TAbstractFile): string {
	const adapter = app.vault.adapter as any;
	if (typeof adapter.getFullPath === 'function') {
		return adapter.getFullPath(file.path);
	}
	if (typeof adapter.getBasePath === 'function') {
		const basePath: string = adapter.getBasePath();
		const sep = basePath.includes('\\') ? '\\' : '/';
		const cleanRelPath = file.path.replace(/[\\/]+/g, sep);
		return basePath.endsWith(sep) ? `${basePath}${cleanRelPath}` : `${basePath}${sep}${cleanRelPath}`;
	}
	return file.path;
}

/**
 * Copies one or more absolute file or folder paths to the Native OS clipboard.
 * - Windows: Uses PowerShell to configure FileDropList (CF_HDROP) so files can be pasted
 *   directly into Windows Explorer, Desktop, email, and chat applications as actual files.
 * - macOS: Uses AppleScript to configure POSIX file list on the pasteboard.
 * - Linux: Uses wl-copy / xclip to set text/uri-list.
 * - Fallback: Copies file paths as plain text.
 */
export async function copyFilesToNativeOsClipboard(
	filePaths: string[],
	label?: string
): Promise<boolean> {
	if (!filePaths || filePaths.length === 0) {
		new Notice('⚠️ No files selected to copy.');
		return false;
	}

	const fs = getNodeFs();
	const validPaths = fs ? filePaths.filter((p) => fs.existsSync(p)) : filePaths;
	if (validPaths.length === 0) {
		new Notice('⚠️ Target file does not exist on disk.');
		return false;
	}

	const count = validPaths.length;
	const displayLabel = label || (count === 1 ? `"${validPaths[0].split(/[\\/]/).pop()}"` : `${count} files`);

	const cp = getNodeChildProcess();
	if (Platform.isDesktop && cp) {
		const isWin = typeof process !== 'undefined' && process.platform === 'win32';
		const isMac = typeof process !== 'undefined' && process.platform === 'darwin';

		// 1. Windows: Native FileDropList via PowerShell .NET Clipboard
		if (isWin) {
			try {
				const script = `
Add-Type -AssemblyName System.Windows.Forms
$sc = New-Object System.Collections.Specialized.StringCollection
${validPaths.map((p) => `$sc.Add(${JSON.stringify(p)})`).join('\n')}
$d = New-Object System.Windows.Forms.DataObject
$d.SetFileDropList($sc)
$d.SetText(${JSON.stringify(validPaths.join('\r\n'))})
[System.Windows.Forms.Clipboard]::SetDataObject($d, $true)
`;
				const encoded = Buffer.from(script, 'utf16le').toString('base64');
				await new Promise<void>((resolve, reject) => {
					cp.execFile(
						'powershell.exe',
						['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-EncodedCommand', encoded],
						{ timeout: 6000 },
						(err: any) => {
							if (err) reject(err);
							else resolve();
						}
					);
				});
				new Notice(`📋 Copied ${displayLabel} as file to OS clipboard`);
				return true;
			} catch (err) {
				console.warn('[PakCLI] Windows PowerShell native file clipboard failed:', err);
			}
		}

		// 2. macOS: AppleScript POSIX file pasteboard
		if (isMac) {
			try {
				const fileArgs = validPaths.map((p) => `POSIX file ${JSON.stringify(p)}`).join(', ');
				const script = count === 1 ? `set the clipboard to (${fileArgs})` : `set the clipboard to {${fileArgs}}`;
				await new Promise<void>((resolve, reject) => {
					cp.execFile('osascript', ['-e', script], { timeout: 4000 }, (err: any) => {
						if (err) reject(err);
						else resolve();
					});
				});
				new Notice(`📋 Copied ${displayLabel} as file to OS clipboard`);
				return true;
			} catch (err) {
				console.warn('[PakCLI] macOS AppleScript native file clipboard failed:', err);
			}
		}

		// 3. Linux: text/uri-list via wl-copy or xclip
		if (!isWin && !isMac) {
			try {
				const uriList = validPaths.map((p) => 'file://' + encodeURI(p)).join('\n');
				let success = false;
				await new Promise<void>((resolve) => {
					const proc = cp.spawn('wl-copy', ['-t', 'text/uri-list']);
					proc.on('error', () => {
						const xclip = cp.spawn('xclip', ['-selection', 'clipboard', '-t', 'text/uri-list']);
						xclip.on('error', () => resolve());
						xclip.on('close', (code: number) => {
							if (code === 0) success = true;
							resolve();
						});
						xclip.stdin.write(uriList);
						xclip.stdin.end();
					});
					proc.on('close', (code: number) => {
						if (code === 0) success = true;
						resolve();
					});
					proc.stdin.write(uriList);
					proc.stdin.end();
				});
				if (success) {
					new Notice(`📋 Copied ${displayLabel} as file to OS clipboard`);
					return true;
				}
			} catch (err) {
				console.warn('[PakCLI] Linux uri-list clipboard failed:', err);
			}
		}
	}

	// 4. Fallback: Path string clipboard
	try {
		if (typeof navigator !== 'undefined' && navigator?.clipboard?.writeText) {
			await navigator.clipboard.writeText(validPaths.join('\n'));
			new Notice(`📋 Copied file path for ${displayLabel} to clipboard`);
			return true;
		}
	} catch (err) {
		console.error('[PakCLI] Fallback clipboard failed:', err);
	}

	new Notice('❌ Failed to copy to clipboard');
	return false;
}
