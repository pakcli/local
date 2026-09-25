import { App, Plugin, Platform, Notice, TFolder, TFile, Menu, addIcon } from 'obsidian';
import { PakCLILocalSettings, DEFAULT_LOCAL_SETTINGS } from './settings';

// Hub Imports
import { MasterDetailSettingsTab } from './features/hub/settingsHub';
import { eventBus } from './features/hub/eventBus';
import { saveVaultConfig, loadVaultConfig } from './features/hub/vaultConfig';

// Symlink Manager Imports
import { SymlinkManagerSettingTab } from './features/symlink/settings';
import { SymlinkModal } from './features/symlink/modal';
import { BadgeRenderer } from './features/symlink/badges';

// ScriptSync Imports
import { SyncManager } from './features/scriptSync/SyncManager';
import { ScanSyncModal } from './features/scriptSync/ui/ScanSyncModal';
import { PendingChangesModal } from './features/scriptSync/ui/PendingChangesModal';
import { SyncCodeblockRenderer } from './features/scriptSync/ui/SyncCodeblockRenderer';
import { renderScriptSyncSettings } from './features/scriptSync/settings';

// YTD Imports
import { CaptureModal as YTCaptureModal } from './features/ytd/ui/CaptureModal';
import { renderYTCaptureSettings } from './features/ytd/settings';
import { runYTCaptureStartupCheck } from './features/ytd/utils/healthCheck';

export default class PakCLILocalPlugin extends Plugin {
	declare settings: PakCLILocalSettings;
	syncManager!: SyncManager;
	badgeRenderer!: BadgeRenderer;
	vaultRoot: string = '';

	async onload() {
		console.log('[PakCLI Local] Loading plugin...');

		if (!Platform.isDesktop) {
			new Notice('⚠️ PakCLI Local is a desktop-only plugin and requires Node.js OS APIs.');
			return;
		}

		// 1. Resolve Vault Path
		const adapter = this.app.vault.adapter as { getBasePath?: () => string };
		if (typeof adapter.getBasePath === 'function') {
			this.vaultRoot = adapter.getBasePath();
		}

		// 2. Load Settings (with Vault Config fallback)
		await this.loadSettings();

		// 3. Initialize Hub & EventBus
		eventBus.emit('pl:loaded', { version: this.manifest.version });

		// 4. Initialize Symlink Explorer Badges
		this.badgeRenderer = new BadgeRenderer(this.app, this.vaultRoot);
		if (this.settings.showBadges) {
			this.applyBadgeSetting();
		}

		// Register Folder Context Menu for Symlinks
		this.registerEvent(
			this.app.workspace.on('file-menu', (menu: Menu, file) => {
				if (file instanceof TFolder) {
					menu.addItem((item) => {
						item
							.setTitle('PakCLI: Link External Folder (Symlink)...')
							.setIcon('link')
							.onClick(() => {
								new SymlinkModal(this.app, {
									vaultRoot: this.vaultRoot,
									initialVaultPath: file.path,
									confirmDisconnect: this.settings.confirmDisconnect,
									onChange: () => this.applyBadgeSetting()
								}).open();
							});
					});
				}
			})
		);

		// 5. Initialize ScriptSync Manager
		this.syncManager = new SyncManager(
			this.app,
			this,
			() => this.settings,
			() => this.saveSettings()
		);
		this.syncManager.init();

		// Register Script Codeblock Processors (including :sync tag variants)
		const scriptLangs = ['powershell', 'ps1', 'bash', 'sh', 'python', 'py', 'cmd', 'bat'];
		const allProcessLangs = [...scriptLangs, ...scriptLangs.map(l => `${l}:sync`)];
		allProcessLangs.forEach((lang) => {
			this.registerMarkdownCodeBlockProcessor(lang, (source, el, ctx) => {
				// If ScriptSync is disabled, render standard pre/code block and return early
				if (this.settings.enabled === false) {
					const pre = el.createEl('pre', { cls: 'pakcli-codeblock' });
					const code = pre.createEl('code', { cls: `language-${lang.split(':')[0]}` });
					code.textContent = source;
					return;
				}
				const activeFile = this.app.vault.getAbstractFileByPath(ctx.sourcePath);
				ctx.addChild(new SyncCodeblockRenderer(el, source, lang, this.syncManager, this, activeFile instanceof TFile ? activeFile : null));
			});
		});

		// Echo Suppression: Vault modify listener checking mutex lock
		this.registerEvent(
			this.app.vault.on('modify', (file) => {
				if (file instanceof TFile && this.syncManager) {
					const lockManager = this.syncManager.getSyncLockManager();
					if (lockManager.isLocked(file.path)) {
						return;
					}
				}
			})
		);

		// Register Sync Code Icon & Ribbon
		addIcon(
			'sync-code',
			`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
				<path d="M3 3v5h5"/>
				<path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/>
				<path d="M16 21h5v-5"/>
				<polyline points="10 9 7 12 10 15"/>
				<polyline points="14 9 17 12 14 15"/>
			</svg>`
		);
		this.addRibbonIcon('sync-code', 'ScriptSync: Scan & Sync Codeblock Scripts', () => {
			new ScanSyncModal(this.app, this.syncManager, () => this.settings, () => this.saveSettings()).open();
		});

		// Global Notice Suppression for "Failed to open """
		try {
			const obs = require('obsidian');
			const OrigNotice = obs.Notice;
			if (OrigNotice && !(OrigNotice as any).__pakcliPatched) {
				obs.Notice = class PakCLISuppressedNotice extends OrigNotice {
					constructor(message: string | DocumentFragment, duration?: number) {
						const msgStr = typeof message === 'string' ? message : (message?.textContent || '');
						if (msgStr.includes('Failed to open ""') || msgStr.includes("Failed to open ''") || /Failed to open\s*["']\s*["']/.test(msgStr)) {
							super('', 0);
							try { (this as any).hide?.(); (this as any).noticeEl?.remove?.(); } catch {}
							return;
						}
						super(message, duration);
					}
				};
				(obs.Notice as any).__pakcliPatched = true;
			}
		} catch {}

		// DOM MutationObserver to immediately destroy any ghost "Failed to open """ notices
		const noticeObserver = new MutationObserver((mutations) => {
			for (const m of mutations) {
				for (const node of Array.from(m.addedNodes)) {
					if (node instanceof HTMLElement) {
						const text = node.textContent || '';
						if (text.includes('Failed to open ""') || text.includes("Failed to open ''") || /Failed to open\s*["']\s*["']/.test(text)) {
							if (node.classList?.contains('notice')) {
								node.style.display = 'none';
								node.remove();
							} else {
								const target = node.querySelector?.('.notice');
								if (target) {
									(target as HTMLElement).style.display = 'none';
									target.remove();
								}
							}
						}
					}
				}
			}
		});
		noticeObserver.observe(document.body, { childList: true, subtree: true });
		this.register(() => noticeObserver.disconnect());

		// CodeMirror 6 tile-tree desync error handler ('reading tile')
		const tileErrorHandler = (event: ErrorEvent) => {
			const msg = event?.message || event?.error?.message || '';
			if (typeof msg === 'string' && msg.includes("reading 'tile'")) {
				event.preventDefault();
				event.stopImmediatePropagation();
				console.warn('[PakCLI] Prevented CodeMirror tile crash.');
				try {
					const activeLeaf = (this.app.workspace as any).activeLeaf;
					activeLeaf?.view?.editor?.cm?.requestMeasure?.();
				} catch {}
			}
		};
		window.addEventListener('error', tileErrorHandler, true);
		this.register(() => window.removeEventListener('error', tileErrorHandler, true));

		// Guard against opening empty link text "" which displays "Failed to open """
		const origOpenLinkText = this.app.workspace.openLinkText.bind(this.app.workspace);
		this.app.workspace.openLinkText = (linktext: string, sourcePath: string, openFile?: any, openViewState?: any) => {
			if (!linktext || typeof linktext !== 'string' || linktext.trim() === '' || linktext === '.' || linktext === '/') {
				return Promise.resolve();
			}
			return origOpenLinkText(linktext, sourcePath, openFile, openViewState);
		};

		// Helper function to heal vault maps and detach ghost leaves
		const healMapsAndLeaves = () => {
			try {
				const cleanMap = (map: any) => {
					if (!map || typeof map !== 'object') return;
					if ('' in map) delete map[''];
					if ('.' in map) delete map['.'];
					if ('/' in map) delete map['/'];
					for (const [key, item] of Object.entries(map)) {
						if (item instanceof TFolder && (key.endsWith('.md') || key.endsWith('.markdown'))) {
							delete map[key];
						}
					}
				};

				cleanMap((this.app.vault as any).fileMap);
				cleanMap((this.app.vault.adapter as any).fileMap);
				cleanMap((this.app.metadataCache as any).fileMap);
				cleanMap((this.app.metadataCache as any).uniqueFileLookup);

				// Detach any zombie leaves referencing empty path ""
				this.app.workspace.iterateAllLeaves((leaf) => {
					const state = leaf.getViewState();
					const file = state?.state?.file;
					if (file === '' || file === '.' || file === '/') {
						leaf.detach();
					}
				});

				const activeLeaf = this.app.workspace.activeLeaf;
				if (activeLeaf) {
					const activeFile = activeLeaf.getViewState()?.state?.file;
					if (activeFile === '' || activeFile === '.' || activeFile === '/') {
						activeLeaf.detach();
					}
				}
			} catch {}
		};

		// Layout-ready auto-healing
		this.app.workspace.onLayoutReady(() => {
			healMapsAndLeaves();
		});

		// 6. Register Commands
		this.registerPluginCommands();

		// 7. Register Master-Detail Settings Tab
		this.registerSettingsHub();

		// 8. Background Health Check
		if (this.settings.autoCheckDependencies !== false) {
			window.setTimeout(() => runYTCaptureStartupCheck(this.settings), 2500);
		}

		console.log('[PakCLI Local] Loaded successfully.');
	}

	async onunload() {
		// 2. Persistent Snapshot on App Close / Unload
		try { await saveVaultConfig(this.app, 'pakcli-local', this.settings, 'session-close'); } catch {}
		console.log('[PakCLI Local] Unloading plugin...');
		if (this.syncManager) {
			this.syncManager.destroy();
		}
		eventBus.emit('pl:unloaded', { version: this.manifest.version });
	}

	async loadSettings() {
		const stored = await this.loadData();
		const fallback = await loadVaultConfig(this.app, 'pakcli-local');
		this.settings = Object.assign({}, DEFAULT_LOCAL_SETTINGS, fallback, stored);
	}

	async saveSettings() {
		await this.saveData(this.settings);
		// Auto-snapshot to vault config
		await saveVaultConfig(this.app, 'pakcli-local', this.settings);
	}

	applyBadgeSetting() {
		if (this.badgeRenderer) {
			this.badgeRenderer.refresh();
		}
	}

	private registerPluginCommands() {
		// Command: Open Diagnostics Wizard
		this.addCommand({
			id: 'pl-open-wizard',
			name: 'Open System Diagnostics Wizard',
			callback: () => {
				(this.app as any).setting?.open();
				(this.app as any).setting?.openTabById('pakcli-local');
			},
		});

		// Command: Create Symlink / Junction
		this.addCommand({
			id: 'pl-create-symlink',
			name: 'Create Symlink / Junction...',
			callback: () => {
				new SymlinkModal(this.app, {
					vaultRoot: this.vaultRoot,
					initialVaultPath: '',
					confirmDisconnect: this.settings.confirmDisconnect,
					onChange: () => this.applyBadgeSetting()
				}).open();
			},
		});

		// Command: YTD YouTube Capture
		this.addCommand({
			id: 'pl-ytd-capture',
			name: 'YTD: Capture YouTube Clip & Notes',
			callback: () => {
				new YTCaptureModal(this.app, this).open();
			},
		});

		// Command: Scan & Sync Script Blocks
		this.addCommand({
			id: 'pl-scriptsync-scan',
			name: 'ScriptSync: Scan & Sync Codeblock Scripts',
			callback: () => {
				new ScanSyncModal(this.app, this.syncManager, () => this.settings, () => this.saveSettings()).open();
			},
		});

		// Command: View Pending Script Changes
		this.addCommand({
			id: 'pl-scriptsync-pending',
			name: 'ScriptSync: View Pending Changes',
			callback: () => {
				new PendingChangesModal(this.app, this.syncManager, () => this.settings, () => this.saveSettings()).open();
			},
		});

		// Command: Heal Editor & Clean Ghost Tabs
		this.addCommand({
			id: 'pl-heal-editor-tabs',
			name: 'PakCLI: Heal Editor & Clean Ghost Tabs',
			callback: () => {
				try {
					const cleanMap = (map: any) => {
						if (!map || typeof map !== 'object') return;
						if ('' in map) delete map[''];
						if ('.' in map) delete map['.'];
						if ('/' in map) delete map['/'];
					};
					cleanMap((this.app.vault as any).fileMap);
					cleanMap((this.app.vault.adapter as any).fileMap);
					cleanMap((this.app.metadataCache as any).fileMap);
					cleanMap((this.app.metadataCache as any).uniqueFileLookup);

					let detachedCount = 0;
					this.app.workspace.iterateAllLeaves((leaf) => {
						const state = leaf.getViewState();
						const file = state?.state?.file;
						if (file === '' || file === '.' || file === '/') {
							leaf.detach();
							detachedCount++;
						}
					});

					const activeLeaf = (this.app.workspace as any).activeLeaf;
					activeLeaf?.view?.editor?.cm?.requestMeasure?.();

					new Notice(`✅ [PakCLI] Editor healed. Closed ${detachedCount} phantom tab(s).`);
				} catch (err: any) {
					new Notice(`Heal failed: ${err?.message || err}`);
				}
			},
		});
	}

	private registerSettingsHub() {
		const settingsTab = new MasterDetailSettingsTab(this.app, this);

		// 1. Symlink Section Handler
		const symlinkSettingTab = new SymlinkManagerSettingTab(
			this.app,
			this,
			this.settings,
			() => this.saveSettings(),
			() => this.applyBadgeSetting()
		);
		settingsTab.registerLocalSection({
			id: 'local-symlink',
			category: 'local',
			title: 'Symlink & Junction Manager',
			icon: 'link',
			isInstalled: true,
			render: (containerEl) => {
				symlinkSettingTab.display(containerEl);
			}
		});

		// 2. ScriptSync Section Handler
		settingsTab.registerLocalSection({
			id: 'local-scriptsync',
			category: 'local',
			title: 'ScriptSync (PowerShell & Shell Runner)',
			icon: 'terminal',
			isInstalled: true,
			render: (containerEl) => {
				renderScriptSyncSettings(
					this.app,
					this,
					this.syncManager,
					() => this.settings,
					() => this.saveSettings(),
					containerEl
				);
			}
		});

		// 3. YTD Media Section Handler
		settingsTab.registerLocalSection({
			id: 'local-ytd',
			category: 'local',
			title: 'YTD (YouTube Downloader Engine)',
			icon: 'video',
			isInstalled: true,
			render: (containerEl) => {
				renderYTCaptureSettings(this.app, this as any, containerEl);
			}
		});

		this.addSettingTab(settingsTab);
	}
}
