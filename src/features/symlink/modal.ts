import {
	App,
	ButtonComponent,
	DropdownComponent,
	Modal,
	Notice,
	Setting,
	TextComponent,
	normalizePath,
	TFolder,
} from 'obsidian';
import { PathUtils } from '../../utils/nodeHelpers';
import { detectLink, suggestLinkType } from './detect';
import {
	copyAndDisconnect,
	createLink,
	removeLink,
	repointLink,
	SymlinkConflictError,
	ConflictResolutionOption,
} from './ops';
import { browseFolder } from './dialog';
import { SymlinkConflictModal } from './conflictModal';
import { reindexVaultFolder } from './reindex';
import { applyResponsivePath } from './truncate';
import { FolderPickerModal } from '../scriptSync/ui/FolderPicker';
import type { LinkInfo, LinkType } from './types';

export interface SymlinkModalOptions {
	vaultRoot: string;
	initialVaultPath: string;
	confirmDisconnect: boolean;
	onChange?: () => void;
}

export class SymlinkModal extends Modal {
	private opts: SymlinkModalOptions;
	private selectedVaultPath: string;
	private info!: LinkInfo;
	private vaultPathInput!: TextComponent;
	private statusEl!: HTMLElement;
	private bodyEl!: HTMLElement;
	private debugEl!: HTMLElement;
	private disposers: Array<() => void> = [];

	constructor(app: App, opts: SymlinkModalOptions) {
		super(app);
		this.opts = opts;
		this.selectedVaultPath = opts.initialVaultPath ? normalizePath(opts.initialVaultPath) : '';
	}

	onOpen(): void {
		this.modalEl.addClass('symlink-manager-modal');
		this.titleEl.setText('🔗 Symlink & Junction Manager');
		this.contentEl.empty();

		this.statusEl = this.contentEl.createDiv({ cls: 'sm-status-wrap' });
		this.bodyEl = this.contentEl.createDiv({ cls: 'sm-body' });
		this.debugEl = this.contentEl.createDiv({ cls: 'sm-debug' });

		this.refresh();
	}

	onClose(): void {
		this.disposeAll();
		this.contentEl.empty();
	}

	private disposeAll(): void {
		for (const d of this.disposers) {
			try { d(); } catch { /* ignore */ }
		}
		this.disposers = [];
	}

	private getVaultSymlinks(): Array<{ vaultPath: string; absPath: string; state: LinkInfo['state'] }> {
		const result: Array<{ vaultPath: string; absPath: string; state: LinkInfo['state'] }> = [];
		const allFiles = this.app.vault.getAllLoadedFiles();
		for (const file of allFiles) {
			if (file instanceof TFolder && !file.isRoot()) {
				const absPath = PathUtils.join(this.opts.vaultRoot, file.path);
				const state = detectLink(absPath);
				if (state.kind !== 'none') {
					result.push({ vaultPath: file.path, absPath, state });
				}
			}
		}

		// Also check root folder entries directly via node fs in case of broken/dangling symlinks
		try {
			const fs = (window as any).require?.('fs');
			if (fs && fs.existsSync(this.opts.vaultRoot)) {
				const entries = fs.readdirSync(this.opts.vaultRoot, { withFileTypes: true });
				for (const ent of entries) {
					if (ent.isDirectory() || ent.isSymbolicLink()) {
						const absPath = PathUtils.join(this.opts.vaultRoot, ent.name);
						const state = detectLink(absPath);
						if (state.kind !== 'none' && !result.some(r => r.vaultPath === ent.name)) {
							result.push({ vaultPath: ent.name, absPath, state });
						}
					}
				}
			}
		} catch {
			// ignore
		}

		result.sort((a, b) => a.vaultPath.localeCompare(b.vaultPath));
		return result;
	}

	private refresh(): void {
		this.hideDebug();

		if (!this.selectedVaultPath) {
			this.renderOverview();
			return;
		}

		const absPath = PathUtils.join(this.opts.vaultRoot, this.selectedVaultPath);
		this.info = { absPath, vaultPath: this.selectedVaultPath, state: detectLink(absPath) };

		this.renderInspector();
	}

	// ── VIEW 1: Overview Mode (All Vault Symlinks + Create Form) ──────────────
	private renderOverview(): void {
		this.disposeAll();
		this.statusEl.empty();
		this.bodyEl.empty();

		// 1. Hero banner with quick action toolbar
		const hero = this.statusEl.createDiv({ cls: 'sm-hero-banner' });
		const heroText = hero.createDiv({ cls: 'sm-hero-text' });
		heroText.createSpan({
			text: 'Link external hard drives, secondary folders, or shared directories directly into your vault without duplicating disk space.'
		});

		const heroActions = hero.createDiv({ cls: 'sm-hero-actions' });
		const rescanAllBtn = heroActions.createEl('button', {
			cls: 'mod-cta',
			text: '🔄 Re-scan All Vault Links'
		});
		rescanAllBtn.onclick = async () => {
			const t0 = performance.now();
			rescanAllBtn.disabled = true;
			rescanAllBtn.setText('Scanning…');
			try {
				const symlinks = this.getVaultSymlinks();
				for (const s of symlinks) {
					await reindexVaultFolder(this.app, s.vaultPath);
				}
				this.opts.onChange?.();
				new Notice(`✓ Re-indexed ${symlinks.length} symlink folder(s) in ${elapsed(t0)}.`);
			} catch (err: any) {
				new Notice(`Error scanning: ${err.message}`);
			} finally {
				rescanAllBtn.disabled = false;
				rescanAllBtn.setText('🔄 Re-scan All Vault Links');
				this.refresh();
			}
		};

		// 2. Section: Detected Symlinks in Vault
		const symlinks = this.getVaultSymlinks();
		const sectionTitle = this.bodyEl.createDiv({ cls: 'sm-section-title' });
		sectionTitle.createSpan({ text: '🔗 Active & Broken Links in Vault' });
		sectionTitle.createSpan({ cls: 'sm-count-badge', text: `${symlinks.length} link${symlinks.length === 1 ? '' : 's'}` });

		const listWrap = this.bodyEl.createDiv({ cls: 'sm-symlinks-list' });
		if (symlinks.length === 0) {
			listWrap.createDiv({
				cls: 'sm-empty-box',
				text: 'No active symlinks or junctions found in this vault. Use the form below to link an external folder.'
			});
		} else {
			for (const item of symlinks) {
				const row = listWrap.createDiv({ cls: 'sm-symlink-row' });
				const left = row.createDiv({ cls: 'sm-row-left' });

				const pillCls = item.state.kind === 'active'
					? (item.state.type === 'junction' ? 'sm-pill-junction' : 'sm-pill-symlink')
					: 'sm-pill-broken';
				const pillText = item.state.kind === 'active'
					? (item.state.type === 'junction' ? '🟢 Junction' : '🟠 Symlink')
					: '🔴 Broken';

				left.createSpan({ cls: `sm-pill ${pillCls}`, text: pillText });

				const pathsCol = left.createDiv({ cls: 'sm-paths-col' });
				const targetPath = item.state.kind !== 'none' ? item.state.target : '';
				pathsCol.createSpan({ cls: 'sm-vault-path', text: `📂 ${item.vaultPath}` });
				pathsCol.createSpan({ cls: 'sm-target-path-sub', text: `→ ${targetPath}` });

				const actions = row.createDiv({ cls: 'sm-row-actions' });

				const inspectBtn = actions.createEl('button', { text: '⚙️ Inspect' });
				inspectBtn.onclick = () => {
					this.selectedVaultPath = item.vaultPath;
					this.refresh();
				};

				const rescanBtn = actions.createEl('button', { text: '🔄 Re-index' });
				rescanBtn.onclick = async () => {
					rescanBtn.disabled = true;
					await reindexVaultFolder(this.app, item.vaultPath);
					this.opts.onChange?.();
					rescanBtn.disabled = false;
					new Notice(`✓ Re-indexed "${item.vaultPath}"`);
				};

				const disconnectBtn = actions.createEl('button', { text: '🔌 Disconnect', cls: 'mod-warning' });
				disconnectBtn.onclick = () => {
					if (!this.confirm(`Remove link "${item.vaultPath}"? Target files remain untouched.`)) return;
					void this.guard(async () => {
						await removeLink(item.absPath);
						new Notice(`Link "${item.vaultPath}" removed.`);
					});
				};
			}
		}

		// 3. Section: Create New Link
		const createTitle = this.bodyEl.createDiv({ cls: 'sm-section-title' });
		createTitle.createSpan({ text: '➕ Link External Folder (New Link)' });

		this.renderCreateForm();
	}

	private renderCreateForm(): void {
		const formCard = this.bodyEl.createDiv({ cls: 'sm-card' });

		let vaultInput!: TextComponent;
		let targetInput!: TextComponent;
		let typeDropdown!: DropdownComponent;
		let typeRow!: Setting;
		let chosenType: LinkType = 'junction';

		new Setting(formCard)
			.setName('Vault folder')
			.setDesc('Where this folder appears inside your Obsidian vault')
			.addText((t) => {
				vaultInput = t;
				t.setPlaceholder('_project/MyFolder');
			})
			.addButton((b) =>
				b.setButtonText('📂 Browse Vault').onClick(() => {
					new FolderPickerModal(this.app, (chosen) => {
						if (chosen && chosen !== '/') {
							vaultInput.setValue(chosen);
						}
					}).open();
				})
			);

		const setType = (t: LinkType): void => {
			chosenType = t;
			typeDropdown.setValue(t);
			typeRow.setDesc(typeHint(t));
		};

		new Setting(formCard)
			.setName('External target path')
			.setDesc('Absolute path to folder on hard drive or secondary disk')
			.addText((t) => {
				targetInput = t;
				t.setPlaceholder('D:\\Projects\\MyFolder');
				t.onChange((v) => {
					if (!v.trim()) return;
					const vp = vaultInput?.getValue()?.trim() || '';
					const absLink = PathUtils.join(this.opts.vaultRoot, vp || '_symlink_temp');
					setType(suggestLinkType(absLink, v.trim()));
				});
			})
			.addButton((b) =>
				b.setButtonText('📁 Browse Disk').onClick(async () => {
					const picked = await browseFolder();
					if (picked) {
						targetInput.setValue(picked);
						const vp = vaultInput?.getValue()?.trim() || '';
						const absLink = PathUtils.join(this.opts.vaultRoot, vp || '_symlink_temp');
						setType(suggestLinkType(absLink, picked));
					}
				})
			);

		typeRow = new Setting(formCard)
			.setName('Link type')
			.setDesc(typeHint(chosenType))
			.addDropdown((d) => {
				typeDropdown = d;
				d.addOption('junction', 'Junction (Windows · same drive · no admin required)');
				d.addOption('symlink', 'Symlink (cross-drive / POSIX · admin on Windows)');
				d.setValue(chosenType);
				d.onChange((v) => {
					chosenType = v as LinkType;
					typeRow.setDesc(typeHint(chosenType));
				});
			});

		const actions = formCard.createDiv({ cls: 'sm-actions' });
		new ButtonComponent(actions)
			.setButtonText('Create Link')
			.setCta()
			.onClick(() => {
				const vp = vaultInput.getValue().trim();
				const target = targetInput.getValue().trim();
				if (!vp) {
					new Notice('Please enter a vault folder path.');
					return;
				}
				if (!target) {
					new Notice('Please choose an external target folder.');
					return;
				}
				const absLink = PathUtils.join(this.opts.vaultRoot, normalizePath(vp));
				const handleCreate = async (resolution?: ConflictResolutionOption) => {
					void this.guard(async () => {
						try {
							await createLink(absLink, target, chosenType, resolution);
							new Notice(`✓ Created link: "${vp}" → ${target}`);
						} catch (err) {
							if (err instanceof SymlinkConflictError) {
								new SymlinkConflictModal(this.app, {
									linkPath: err.linkPath,
									targetPath: err.targetPath,
									linkItemCount: err.linkItemCount,
									targetItemCount: err.targetItemCount,
									onResolve: async (choice) => {
										await handleCreate(choice);
									}
								}).open();
								return;
							}
							throw err;
						}
					});
				};
				handleCreate();
			});
	}

	// ── VIEW 2: Inspector Mode (Inspecting a Single Folder) ────────────────────
	private renderInspector(): void {
		this.disposeAll();
		this.statusEl.empty();
		this.bodyEl.empty();

		const nav = this.statusEl.createDiv({ cls: 'sm-inspector-nav' });
		const backBtn = nav.createEl('button', { text: '← Back to All Links' });
		backBtn.onclick = () => {
			this.selectedVaultPath = '';
			this.refresh();
		};

		const headerWrap = this.statusEl.createDiv({ cls: 'sm-section' });
		new Setting(headerWrap)
			.setName('Folder (vault)')
			.setDesc('Folder path relative to vault root')
			.addText((t) => {
				this.vaultPathInput = t;
				t.setValue(this.selectedVaultPath);
				t.onChange((v) => {
					this.selectedVaultPath = v.trim();
					this.refresh();
				});
			})
			.addButton((b) =>
				b.setButtonText('📂 Browse').onClick(() => {
					new FolderPickerModal(this.app, (chosen) => {
						if (chosen && chosen !== '/') {
							this.selectedVaultPath = chosen;
							this.refresh();
						}
					}).open();
				})
			);

		this.renderStatus();

		switch (this.info.state.kind) {
			case 'none':
				this.renderCreateDirect();
				return;
			case 'active':
				this.renderActive();
				return;
			case 'broken':
				this.renderBroken();
				return;
		}
	}

	private renderStatus(): void {
		const s = this.info.state;
		const statusCard = this.statusEl.createDiv({ cls: 'sm-status' });

		const line = statusCard.createDiv({ cls: 'sm-status-line' });
		const dotKind = s.kind === 'active' ? s.type : s.kind === 'broken' ? 'broken' : 'none';
		line.createSpan({ cls: `sm-dot sm-dot-${dotKind}` });

		const label = line.createSpan({ cls: 'sm-status-label' });
		label.setText(statusLabel(s));

		if (s.kind === 'none') return;

		const targetRow = statusCard.createDiv({ cls: 'sm-target-row' });
		targetRow.createSpan({ cls: 'sm-target-arrow', text: '→' });
		const pathEl = targetRow.createSpan({ cls: 'sm-target-path' });
		this.disposers.push(applyResponsivePath(pathEl, s.target));

		if (s.kind === 'broken') {
			statusCard.createDiv({
				cls: 'sm-warn',
				text: '⚠️ Target folder not found or external drive is offline.',
			});
		}
	}

	private renderCreateDirect(): void {
		let targetInput!: TextComponent;
		let typeDropdown!: DropdownComponent;
		let typeRow!: Setting;
		let chosenType: LinkType = 'junction';

		const setType = (t: LinkType): void => {
			chosenType = t;
			typeDropdown.setValue(t);
			typeRow.setDesc(typeHint(t));
		};

		new Setting(this.bodyEl)
			.setName('External path')
			.setDesc('Type a path or use Browse')
			.addText((t) => {
				targetInput = t;
				t.setPlaceholder('D:\\Projects\\MyProject');
				t.onChange((v) => {
					if (!v.trim()) return;
					setType(suggestLinkType(this.info.absPath, v.trim()));
				});
			})
			.addButton((b) =>
				b.setButtonText('📁 Browse').onClick(async () => {
					const picked = await browseFolder();
					if (picked) {
						targetInput.setValue(picked);
						setType(suggestLinkType(this.info.absPath, picked));
					}
				})
			);

		typeRow = new Setting(this.bodyEl)
			.setName('Link type')
			.setDesc(typeHint(chosenType))
			.addDropdown((d) => {
				typeDropdown = d;
				d.addOption('junction', 'Junction (Windows · same drive · no admin required)');
				d.addOption('symlink', 'Symlink (cross-drive / POSIX · admin on Windows)');
				d.setValue(chosenType);
				d.onChange((v) => {
					chosenType = v as LinkType;
					typeRow.setDesc(typeHint(chosenType));
				});
			});

		const actions = this.bodyEl.createDiv({ cls: 'sm-actions' });
		new ButtonComponent(actions).setButtonText('Cancel').onClick(() => {
			this.selectedVaultPath = '';
			this.refresh();
		});
		new ButtonComponent(actions)
			.setButtonText('Create Link')
			.setCta()
			.onClick(() => {
				const target = targetInput.getValue().trim();
				if (!target) {
					new Notice('Please choose a target folder first.');
					return;
				}
				const handleCreate = async (resolution?: ConflictResolutionOption) => {
					void this.guard(async () => {
						try {
							await createLink(this.info.absPath, target, chosenType, resolution);
							new Notice(`✓ Created link: "${this.info.vaultPath}" → ${target}`);
						} catch (err) {
							if (err instanceof SymlinkConflictError) {
								new SymlinkConflictModal(this.app, {
									linkPath: err.linkPath,
									targetPath: err.targetPath,
									linkItemCount: err.linkItemCount,
									targetItemCount: err.targetItemCount,
									onResolve: async (choice) => {
										await handleCreate(choice);
									}
								}).open();
								return;
							}
							throw err;
						}
					});
				};
				handleCreate();
			});
	}

	private renderActive(): void {
		const s = this.info.state;
		if (s.kind !== 'active') return;

		new Setting(this.bodyEl)
			.setName('Target path')
			.setDesc(s.target)
			.addButton((b) =>
				b.setButtonText('Edit target').onClick(() => {
					this.bodyEl.empty();
					this.renderEditTarget(s.target, s.type);
				})
			);

		this.bodyEl.createEl('h4', { text: 'Actions', cls: 'sm-actions-title' });

		const disconnectCard = this.bodyEl.createDiv({ cls: 'sm-card' });
		disconnectCard.createDiv({ cls: 'sm-card-title', text: '🔌 Disconnect' });
		disconnectCard.createDiv({
			cls: 'sm-card-desc',
			text: 'Remove the link only — files at the external target are untouched.',
		});
		new ButtonComponent(disconnectCard)
			.setButtonText('Disconnect')
			.setWarning()
			.onClick(() => {
				if (!this.confirm('Remove the link? Files at the external target stay where they are.')) return;
				void this.guard(async () => {
					const t0 = performance.now();
					this.showDebug('Disconnecting…');
					await removeLink(this.info.absPath);
					this.showDebug(`Disconnected. (${elapsed(t0)})`);
					new Notice(`Link removed. (${elapsed(t0)})`);
				});
			});

		const copyCard = this.bodyEl.createDiv({ cls: 'sm-card' });
		copyCard.createDiv({ cls: 'sm-card-title', text: '📦 Disconnect + Copy' });
		copyCard.createDiv({
			cls: 'sm-card-desc',
			text: 'Copy contents into the vault first, then remove the link. Large folders may take a while.',
		});
		new ButtonComponent(copyCard)
			.setButtonText('Copy & disconnect')
			.onClick(() => {
				if (!this.confirm('Copy contents into the vault and then disconnect?')) return;
				void this.guard(async () => {
					const t0 = performance.now();
					this.showDebug('Copying… ⏳');
					new Notice('Copying files into vault — this may take a while…');
					await copyAndDisconnect(this.info.absPath);
					const dur = elapsed(t0);
					this.showDebug(`Copied and detached. (${dur})`);
					new Notice(`✓ Copied and detached. (${dur})`);
				});
			});

		const rescanCard = this.bodyEl.createDiv({ cls: 'sm-card' });
		rescanCard.createDiv({ cls: 'sm-card-title', text: '🔄 Re-scan & Index Files' });
		rescanCard.createDiv({
			cls: 'sm-card-desc',
			text: 'Force Obsidian to immediately index and show all external files and subfolders in the File Explorer without reloading the vault.',
		});
		new ButtonComponent(rescanCard)
			.setButtonText('Re-scan now')
			.setCta()
			.onClick(async () => {
				const t0 = performance.now();
				new Notice('Scanning and indexing linked files…');
				await reindexVaultFolder(this.app, this.info.vaultPath);
				this.opts.onChange?.();
				new Notice(`✓ Linked files indexed in ${elapsed(t0)}.`);
			});

		const close = this.bodyEl.createDiv({ cls: 'sm-actions' });
		new ButtonComponent(close).setButtonText('Close').onClick(() => this.close());
	}

	private renderEditTarget(current: string, initialType: LinkType): void {
		let targetInput!: TextComponent;
		let chosenType: LinkType = initialType;

		new Setting(this.bodyEl)
			.setName('New target path')
			.addText((t) => {
				targetInput = t;
				t.setValue(current);
				t.onChange((v) => {
					if (!v.trim()) return;
					chosenType = suggestLinkType(this.info.absPath, v.trim());
				});
			})
			.addButton((b) =>
				b.setButtonText('📁 Browse').onClick(async () => {
					const picked = await browseFolder(targetInput.getValue() || undefined);
					if (picked) {
						targetInput.setValue(picked);
						chosenType = suggestLinkType(this.info.absPath, picked);
					}
				})
			);

		const actions = this.bodyEl.createDiv({ cls: 'sm-actions' });
		new ButtonComponent(actions).setButtonText('Cancel').onClick(() => this.refresh());
		new ButtonComponent(actions)
			.setButtonText('Apply')
			.setCta()
			.onClick(() => {
				const v = targetInput.getValue().trim();
				if (!v) {
					new Notice('Target path is empty.');
					return;
				}
				const handleRepoint = async (resolution?: ConflictResolutionOption) => {
					void this.guard(async () => {
						try {
							await repointLink(this.info.absPath, v, chosenType, resolution);
							new Notice('Target updated.');
						} catch (err) {
							if (err instanceof SymlinkConflictError) {
								new SymlinkConflictModal(this.app, {
									linkPath: err.linkPath,
									targetPath: err.targetPath,
									linkItemCount: err.linkItemCount,
									targetItemCount: err.targetItemCount,
									onResolve: async (choice) => {
										await handleRepoint(choice);
									}
								}).open();
								return;
							}
							throw err;
						}
					});
				};
				handleRepoint();
			});
	}

	private renderBroken(): void {
		this.bodyEl.createEl('h4', { text: 'Actions', cls: 'sm-actions-title' });

		const removeCard = this.bodyEl.createDiv({ cls: 'sm-card' });
		removeCard.createDiv({ cls: 'sm-card-title', text: '🔌 Remove broken link' });
		removeCard.createDiv({ cls: 'sm-card-desc', text: 'Delete the dangling pointer. No data is lost.' });
		new ButtonComponent(removeCard)
			.setButtonText('Remove')
			.setWarning()
			.onClick(() => {
				if (!this.confirm('Remove the broken link pointer?')) return;
				void this.guard(async () => {
					await removeLink(this.info.absPath);
					new Notice('Broken link removed.');
				});
			});

		const repointCard = this.bodyEl.createDiv({ cls: 'sm-card' });
		repointCard.createDiv({ cls: 'sm-card-title', text: '🔁 Repoint to new path' });
		repointCard.createDiv({ cls: 'sm-card-desc', text: 'Pick a new target and re-create the link in place.' });

		let targetInput!: TextComponent;
		let chosenType: LinkType = 'junction';
		const startTarget = this.info.state.kind === 'broken' ? this.info.state.target : '';

		new Setting(repointCard)
			.setName('New target')
			.addText((t) => {
				targetInput = t;
				t.setValue(startTarget);
				t.onChange((v) => {
					if (!v.trim()) return;
					chosenType = suggestLinkType(this.info.absPath, v.trim());
				});
			})
			.addButton((b) =>
				b.setButtonText('📁 Browse').onClick(async () => {
					const picked = await browseFolder(targetInput.getValue() || undefined);
					if (picked) {
						targetInput.setValue(picked);
						chosenType = suggestLinkType(this.info.absPath, picked);
					}
				})
			);

		new ButtonComponent(repointCard)
			.setButtonText('Repoint')
			.setCta()
			.onClick(() => {
				const v = targetInput.getValue().trim();
				if (!v) {
					new Notice('Pick a target first.');
					return;
				}
				const handleRepoint = async (resolution?: ConflictResolutionOption) => {
					void this.guard(async () => {
						try {
							await repointLink(this.info.absPath, v, chosenType, resolution);
							new Notice('Repointed.');
						} catch (err) {
							if (err instanceof SymlinkConflictError) {
								new SymlinkConflictModal(this.app, {
									linkPath: err.linkPath,
									targetPath: err.targetPath,
									linkItemCount: err.linkItemCount,
									targetItemCount: err.targetItemCount,
									onResolve: async (choice) => {
										await handleRepoint(choice);
									}
								}).open();
								return;
							}
							throw err;
						}
					});
				};
				handleRepoint();
			});

		const close = this.bodyEl.createDiv({ cls: 'sm-actions' });
		new ButtonComponent(close).setButtonText('Close').onClick(() => this.close());
	}

	private confirm(message: string): boolean {
		if (!this.opts.confirmDisconnect) return true;
		return typeof window !== "undefined" && (window as any).confirm ? (window as any).confirm(message) : true;
	}

	private showDebug(msg: string): void {
		this.debugEl.setText(msg);
		this.debugEl.addClass('sm-debug-visible');
	}

	private hideDebug(): void {
		this.debugEl.empty();
		this.debugEl.removeClass('sm-debug-visible');
	}

	private async guard(fn: () => Promise<void>): Promise<void> {
		try {
			await fn();
			if (this.selectedVaultPath) {
				await reindexVaultFolder(this.app, this.selectedVaultPath);
			}
			this.opts.onChange?.();
			this.refresh();
		} catch (err: unknown) {
			const msg = err instanceof Error ? err.message : String(err);
			this.showDebug(`Error: ${msg}`);
			new Notice(`Symlink Manager: ${msg}`, 8000);
		}
	}
}

function typeHint(type: LinkType): string {
	if (type === 'junction') return 'Same drive — Windows NTFS Junction (no administrator required).';
	return 'Cross-drive or POSIX — Directory Symbolic Link (may require administrator on Windows).';
}

function statusLabel(s: LinkInfo['state']): string {
	if (s.kind === 'none') return 'No symlink detected';
	if (s.kind === 'broken') return 'Broken link detected';
	return s.type === 'junction' ? 'Junction active' : 'Symlink active';
}

/** Human-readable elapsed time from a performance.now() timestamp. */
function elapsed(t0: number): string {
	const ms = performance.now() - t0;
	return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`;
}
