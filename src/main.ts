import { App, Plugin, Platform, Notice, TFolder, Menu } from 'obsidian';
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

		// Register Script Codeblock Processors
		['powershell', 'ps1', 'bash', 'sh', 'python', 'py'].forEach((lang) => {
			this.registerMarkdownCodeBlockProcessor(lang, (source, el, ctx) => {
				const activeFile = this.app.vault.getAbstractFileByPath(ctx.sourcePath);
				ctx.addChild(new SyncCodeblockRenderer(el, source, lang, this.syncManager, this, activeFile as any));
			});
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
