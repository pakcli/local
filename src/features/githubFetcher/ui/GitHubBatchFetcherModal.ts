import { App, Modal, Setting, Notice, setIcon, TFile } from 'obsidian';
import { GitHubFetcherManager } from '../GitHubFetcherManager';
import { GitHubCliService } from '../services/GitHubCliService';
import { GitHubRepoParser } from '../services/GitHubRepoParser';
import { GitHubDiffModal } from './GitHubDiffModal';
import { PakCLILocalSettings } from '../../../settings';
import { FetchResult } from '../types';

export class GitHubBatchFetcherModal extends Modal {
	private manager: GitHubFetcherManager;
	private settings: PakCLILocalSettings;
	private onSaveSettings: () => Promise<void>;
	private isProcessing: boolean = false;

	constructor(
		app: App,
		manager: GitHubFetcherManager,
		settings: PakCLILocalSettings,
		onSaveSettings: () => Promise<void>
	) {
		super(app);
		this.manager = manager;
		this.settings = settings;
		this.onSaveSettings = onSaveSettings;
	}

	async onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('pakcli-github-modal');

		contentEl.createEl('h2', { text: '📦 Fetch GitHub Repositories to Library' });

		const desc = contentEl.createEl('p', { cls: 'setting-item-description' });
		desc.setText(
			'Enter one or more GitHub repository URLs (one per line). Each repository will be converted into a structured note with release assets, compatibility tags, and full README.'
		);

		// CLI detection badge
		const hasGhCli = await GitHubCliService.isGhCliAvailable();
		const badgeRow = contentEl.createDiv({ cls: 'pakcli-github-badge-row' });
		badgeRow.style.cssText =
			'display: flex; align-items: center; gap: 8px; margin-bottom: 14px; font-size: 12px;';
		const badge = badgeRow.createSpan();
		badge.style.cssText = `padding: 2px 8px; border-radius: 4px; font-weight: 600; font-family: var(--font-monospace); ${
			hasGhCli
				? 'background: rgba(16, 185, 129, 0.15); color: #10b981; border: 1px solid #10b981;'
				: 'background: rgba(245, 158, 11, 0.15); color: #f59e0b; border: 1px solid #f59e0b;'
		}`;
		badge.setText(hasGhCli ? '⚡ GitHub CLI (`gh`) Active' : '🌐 Fallback REST API Active');

		const badgeHint = badgeRow.createSpan({ cls: 'text-muted' });
		badgeHint.setText(
			hasGhCli
				? 'Fast authenticated fetching via local `gh` executable.'
				: '`gh` not detected in PATH; using GitHub public REST API.'
		);

		// Destination Folder Setting
		let targetFolder = this.settings.githubLibraryFolder || 'Digital Library/Github Repository';
		new Setting(contentEl)
			.setName('Destination Vault Folder')
			.setDesc('Folder where generated repository markdown files will be saved')
			.addText((text) =>
				text
					.setValue(targetFolder)
					.setPlaceholder('Digital Library/Github Repository')
					.onChange(async (val) => {
						targetFolder = val.trim() || 'Digital Library/Github Repository';
						this.settings.githubLibraryFolder = targetFolder;
						await this.onSaveSettings();
					})
			);

		// Multi-line Textarea for URLs
		const textareaSetting = new Setting(contentEl)
			.setName('Repository URLs')
			.setDesc('Paste one or more URLs, e.g. https://github.com/studiowebux/obsidian-findoc');
		textareaSetting.settingEl.style.flexDirection = 'column';
		textareaSetting.settingEl.style.alignItems = 'stretch';
		textareaSetting.controlEl.style.width = '100%';
		textareaSetting.controlEl.style.maxWidth = '100%';

		const textarea = textareaSetting.controlEl.createEl('textarea', {
			cls: 'pakcli-github-textarea'
		});
		textarea.style.cssText =
			'width: 100% !important; min-width: 100% !important; max-width: 100% !important; min-height: 140px; font-family: var(--font-monospace); font-size: 13px; padding: 10px; margin-top: 8px; border-radius: var(--radius-s); box-sizing: border-box; resize: vertical; display: block;';
		textarea.placeholder =
			'https://github.com/studiowebux/obsidian-findoc\nhttps://github.com/obsidianmd/obsidian-sample-plugin\nowner/repo';

		// Progress Status El
		const progressEl = contentEl.createDiv({ cls: 'pakcli-github-progress' });
		progressEl.style.cssText =
			'margin: 10px 0; font-size: 13px; font-weight: 500; min-height: 20px; color: var(--text-accent);';

		// Results Container El
		const resultsEl = contentEl.createDiv({ cls: 'pakcli-github-results' });
		resultsEl.style.cssText =
			'margin-top: 10px; max-height: 180px; overflow-y: auto; display: flex; flex-direction: column; gap: 6px;';

		// Action Buttons Bar
		const actionsRow = contentEl.createDiv({ cls: 'modal-button-container' });
		actionsRow.style.cssText =
			'display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px;';

		const cancelBtn = actionsRow.createEl('button', { text: 'Close' });

		const fetchBtn = actionsRow.createEl('button', {
			text: '🚀 Fetch Repositories',
			cls: 'mod-cta pakcli-btn-fetch'
		});
		fetchBtn.style.cssText =
			'min-width: 160px; text-align: center; justify-content: center; display: inline-flex; align-items: center; box-sizing: border-box;';

		let isCancelled = false;

		cancelBtn.onclick = () => {
			if (this.isProcessing) {
				isCancelled = true;
				cancelBtn.setText('Stopping...');
				cancelBtn.disabled = true;
			} else {
				this.close();
			}
		};

		fetchBtn.onclick = async () => {
			if (this.isProcessing) return;

			const inputVal = textarea.value.trim();
			if (!inputVal) {
				new Notice('Please paste at least one GitHub repository URL.');
				return;
			}

			this.isProcessing = true;
			isCancelled = false;
			fetchBtn.disabled = true;
			fetchBtn.setText('⏳ Fetching...');
			cancelBtn.setText('🛑 Cancel Batch');
			cancelBtn.disabled = false;
			progressEl.setText('Starting fetch process...');
			resultsEl.empty();

			try {
				const results = await this.manager.fetchBatchRepos(
					inputVal,
					targetFolder,
					(cur, tot, slug) => {
						progressEl.setText(`Fetching (${cur}/${tot}): ${slug}...`);
					},
					async (repoName, diffFields, hasBodyDiff) => {
						return new Promise((resolve) => {
							const diffModal = new GitHubDiffModal(
								this.app,
								repoName,
								diffFields,
								hasBodyDiff,
								(resolution) => resolve(resolution)
							);
							diffModal.open();
						});
					},
					() => isCancelled
				);

				progressEl.setText(`Finished processing ${results.length} repositories.`);

				// Render Result Rows
				for (const res of results) {
					const row = resultsEl.createDiv({ cls: 'pakcli-result-item' });
					row.style.cssText =
						'padding: 6px 10px; border-radius: 4px; background: var(--background-secondary); display: flex; justify-content: space-between; align-items: center; font-size: 12px;';

					const left = row.createDiv();
					left.style.cssText = 'display: flex; align-items: center; gap: 6px;';

					const statusIcon = left.createSpan();
					if (res.skipped) {
						statusIcon.setText('⏭️');
						statusIcon.title = res.hasDiff ? 'Skipped by user' : 'Identical data, skipped';
					} else if (res.success) {
						statusIcon.setText('✅');
					} else {
						statusIcon.setText('❌');
					}

					if (res.success && res.filePath) {
						const link = left.createEl('a', {
							text: res.repoName || res.filePath,
							href: '#'
						});
						link.style.cssText = 'color: var(--text-accent); font-weight: 600; text-decoration: underline;';
						link.onclick = (e) => {
							e.preventDefault();
							const file = this.app.vault.getAbstractFileByPath(res.filePath!);
							if (file instanceof TFile) {
								this.app.workspace.getLeaf('tab').openFile(file);
								this.close();
							}
						};

						if (res.skipped) {
							const skipTag = left.createSpan({ text: res.hasDiff ? '(diff skipped)' : '(identical, skipped)' });
							skipTag.style.cssText = 'font-size: 11px; color: var(--text-muted); font-style: italic;';
						}
					} else {
						const errText = left.createSpan({ text: res.repoName || res.url });
						errText.style.color = 'var(--text-muted)';
					}

					const right = row.createDiv();
					right.style.cssText = 'display: flex; align-items: center; gap: 6px;';

					// If file already exists or has diff/conflict, add action buttons (Replace, Diff, Cancel)
					if (res.fileExists && res.newMeta && res.existingContent) {
						// 1. Advance Diff per thing button
						const diffBtn = right.createEl('button', { text: '⚡ Diff' });
						diffBtn.style.cssText = 'font-size: 11px; padding: 2px 6px;';
						diffBtn.title = 'Open interactive Frontmatter & Body Diff Resolver';
						diffBtn.onclick = () => {
							const { diffFields } = GitHubRepoParser.compareMetadata(res.existingContent!, res.newMeta!);
							const hasBodyDiff = (res.existingContent!.replace(/\r/g, '').trim() !== (res.newMeta!.readme || '').replace(/\r/g, '').trim());
							new GitHubDiffModal(
								this.app,
								res.repoName || 'repository',
								diffFields,
								hasBodyDiff,
								async (resolution) => {
									if (resolution.action === 'cancel') return;
									const file = this.app.vault.getAbstractFileByPath(res.filePath!);
									if (file instanceof TFile) {
										if ((resolution as any).action === 'replace') {
											const md = GitHubRepoParser.serializeToMarkdown(res.newMeta!);
											await this.app.vault.modify(file, md);
										} else {
											const { body: oldBody } = GitHubRepoParser.parseFrontmatterAndBody(res.existingContent!);
											const md = GitHubRepoParser.serializeWithResolved(
												res.newMeta!,
												resolution.resolvedFields,
												oldBody,
												resolution.useOldBody
											);
											await this.app.vault.modify(file, md);
										}
										new Notice(`✅ Applied updates to "${res.repoName}".`);
										res.success = true;
										res.error = undefined;
										statusIcon.setText('✅');
										right.empty();
									}
								}
							).open();
						};

						// 2. Direct Replace Button
						const replaceBtn = right.createEl('button', { text: 'Replace' });
						replaceBtn.style.cssText = 'font-size: 11px; padding: 2px 6px;';
						replaceBtn.title = 'Overwrite file entirely with fresh GitHub metadata';
						replaceBtn.onclick = async () => {
							const file = this.app.vault.getAbstractFileByPath(res.filePath!);
							if (file instanceof TFile) {
								const md = GitHubRepoParser.serializeToMarkdown(res.newMeta!);
								await this.app.vault.modify(file, md);
								new Notice(`✅ Overwrote "${res.repoName}" with fresh data.`);
								res.success = true;
								res.error = undefined;
								statusIcon.setText('✅');
								right.empty();
							}
						};
					}

					if (res.error) {
						const errSpan = right.createSpan({ text: res.error });
						errSpan.style.cssText = 'color: #ef4444; font-size: 11px; max-width: 200px; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;';
					}
				}
			} catch (err: any) {
				progressEl.setText(`Error: ${err?.message || String(err)}`);
			} finally {
				this.isProcessing = false;
				fetchBtn.disabled = false;
				fetchBtn.setText('🚀 Fetch Repositories');
				cancelBtn.setText('Close');
				cancelBtn.disabled = false;
			}
		};
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
