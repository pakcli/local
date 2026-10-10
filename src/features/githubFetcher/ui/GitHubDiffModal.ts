import { App, Modal, Setting, setIcon } from 'obsidian';
import { DiffField, DiffResolution } from '../types';

export class GitHubDiffModal extends Modal {
	private repoName: string;
	private diffFields: DiffField[];
	private hasBodyDiff: boolean;
	private onResolve: (resolution: DiffResolution) => void;
	private useOldBody: boolean = false;
	private isResolved: boolean = false;

	constructor(
		app: App,
		repoName: string,
		diffFields: DiffField[],
		hasBodyDiff: boolean,
		onResolve: (resolution: DiffResolution) => void
	) {
		super(app);
		this.repoName = repoName;
		this.diffFields = [...diffFields];
		this.hasBodyDiff = hasBodyDiff;
		this.onResolve = onResolve;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		this.modalEl.style.width = '700px';
		this.modalEl.style.maxWidth = '90vw';

		// Header
		const header = contentEl.createEl('h2', {
			text: `⚡ Frontmatter Conflict: "${this.repoName}"`
		});
		header.style.marginBottom = '6px';

		const desc = contentEl.createEl('p', {
			cls: 'setting-item-description',
			text: 'A note for this repository already exists in your vault with different values. Select whether to use the old vault value or the new GitHub value for each field.'
		});
		desc.style.marginBottom = '14px';

		// Diff Table / List Container
		const listContainer = contentEl.createDiv({ cls: 'pakcli-diff-list' });
		listContainer.style.cssText =
			'max-height: 380px; overflow-y: auto; border: 1px solid var(--background-modifier-border); border-radius: var(--radius-m); padding: 8px 12px; margin-bottom: 16px; background: var(--background-primary);';

		const renderItems = () => {
			listContainer.empty();

			for (const item of this.diffFields) {
				const row = listContainer.createDiv({ cls: 'pakcli-diff-row' });
				row.style.cssText =
					'padding: 10px 0; border-bottom: 1px solid var(--background-modifier-border); display: flex; flex-direction: column; gap: 6px;';

				const labelRow = row.createDiv();
				labelRow.style.cssText = 'display: flex; justify-content: space-between; align-items: center;';
				const title = labelRow.createSpan({ text: item.label });
				title.style.cssText = 'font-weight: 600; font-size: 13px; color: var(--text-normal);';

				const badge = labelRow.createSpan();
				badge.setText(item.choice === 'old' ? 'Using Old (Vault)' : 'Using New (GitHub)');
				badge.style.cssText = `font-size: 11px; font-weight: 600; padding: 2px 6px; border-radius: 4px; ${
					item.choice === 'old'
						? 'background: rgba(234, 179, 8, 0.15); color: #eab308;'
						: 'background: rgba(34, 197, 94, 0.15); color: #22c55e;'
				}`;

				// Values Grid
				const grid = row.createDiv();
				grid.style.cssText = 'display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 4px;';

				// Left Box (Old / Vault)
				const leftBox = grid.createDiv();
				leftBox.style.cssText = `padding: 8px; border-radius: var(--radius-s); border: 1px solid ${
					item.choice === 'old' ? 'var(--interactive-accent)' : 'var(--background-modifier-border)'
				}; background: var(--background-secondary); display: flex; flex-direction: column; justify-content: space-between; gap: 8px; cursor: pointer;`;

				const leftContent = leftBox.createDiv();
				const leftHeader = leftContent.createDiv({ text: '📁 Vault (Old)' });
				leftHeader.style.cssText = 'font-size: 11px; font-weight: 600; color: var(--text-muted); margin-bottom: 4px;';
				const leftVal = leftContent.createDiv({ text: item.oldDisplay });
				leftVal.style.cssText = 'font-size: 12px; font-family: var(--font-monospace); word-break: break-all; color: var(--text-normal);';

				const leftBtn = leftBox.createEl('button', { text: 'Use Old' });
				leftBtn.style.cssText = `align-self: flex-start; font-size: 11px; padding: 2px 8px; ${
					item.choice === 'old' ? 'background: var(--interactive-accent); color: var(--text-on-accent);' : ''
				}`;
				leftBtn.onclick = (e) => {
					e.stopPropagation();
					item.choice = 'old';
					renderItems();
				};
				leftBox.onclick = () => {
					item.choice = 'old';
					renderItems();
				};

				// Right Box (New / GitHub)
				const rightBox = grid.createDiv();
				rightBox.style.cssText = `padding: 8px; border-radius: var(--radius-s); border: 1px solid ${
					item.choice === 'new' ? 'var(--interactive-accent)' : 'var(--background-modifier-border)'
				}; background: var(--background-secondary); display: flex; flex-direction: column; justify-content: space-between; gap: 8px; cursor: pointer;`;

				const rightContent = rightBox.createDiv();
				const rightHeader = rightContent.createDiv({ text: '🌐 GitHub (New)' });
				rightHeader.style.cssText = 'font-size: 11px; font-weight: 600; color: var(--text-muted); margin-bottom: 4px;';
				const rightVal = rightContent.createDiv({ text: item.newDisplay });
				rightVal.style.cssText = 'font-size: 12px; font-family: var(--font-monospace); word-break: break-all; color: var(--text-normal);';

				const rightBtn = rightBox.createEl('button', { text: 'Use New' });
				rightBtn.style.cssText = `align-self: flex-start; font-size: 11px; padding: 2px 8px; ${
					item.choice === 'new' ? 'background: var(--interactive-accent); color: var(--text-on-accent);' : ''
				}`;
				rightBtn.onclick = (e) => {
					e.stopPropagation();
					item.choice = 'new';
					renderItems();
				};
				rightBox.onclick = () => {
					item.choice = 'new';
					renderItems();
				};
			}

			// If README body has differences
			if (this.hasBodyDiff) {
				const bodyRow = listContainer.createDiv({ cls: 'pakcli-diff-row' });
				bodyRow.style.cssText = 'padding: 10px 0; display: flex; justify-content: space-between; align-items: center;';
				const bLeft = bodyRow.createDiv();
				bLeft.createEl('strong', { text: 'README Body Content' });
				bLeft.createDiv({ cls: 'setting-item-description', text: 'Existing file has custom or older README text.' });

				const bRight = bodyRow.createDiv();
				bRight.style.cssText = 'display: flex; gap: 6px;';

				const bOldBtn = bRight.createEl('button', { text: 'Keep Old README' });
				if (this.useOldBody) bOldBtn.addClass('mod-cta');
				bOldBtn.onclick = () => {
					this.useOldBody = true;
					renderItems();
				};

				const bNewBtn = bRight.createEl('button', { text: 'Use New README' });
				if (!this.useOldBody) bNewBtn.addClass('mod-cta');
				bNewBtn.onclick = () => {
					this.useOldBody = false;
					renderItems();
				};
			}
		};

		renderItems();

		// Footer Actions Bar
		const footerEl = contentEl.createDiv({ cls: 'modal-button-container' });
		footerEl.style.cssText =
			'display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; border-top: 1px solid var(--background-modifier-border); padding-top: 12px; margin-top: 8px;';

		// Left Batch Controls
		const leftBatchBtns = footerEl.createDiv();
		leftBatchBtns.style.cssText = 'display: flex; gap: 8px;';

		const useAllOldBtn = leftBatchBtns.createEl('button', { text: 'Use All Old' });
		useAllOldBtn.title = 'Set all properties to Vault (Old) version';
		useAllOldBtn.onclick = () => {
			for (const item of this.diffFields) item.choice = 'old';
			this.useOldBody = true;
			renderItems();
		};

		const useAllNewBtn = leftBatchBtns.createEl('button', { text: 'Use All New' });
		useAllNewBtn.title = 'Set all properties to GitHub (New) version';
		useAllNewBtn.onclick = () => {
			for (const item of this.diffFields) item.choice = 'new';
			this.useOldBody = false;
			renderItems();
		};

		// Right Final Actions
		const rightActions = footerEl.createDiv();
		rightActions.style.cssText = 'display: flex; gap: 8px;';

		const cancelBtn = rightActions.createEl('button', { text: 'Cancel' });
		cancelBtn.onclick = () => {
			this.isResolved = true;
			this.onResolve({ action: 'cancel', resolvedFields: {} });
			this.close();
		};

		const replaceBtn = rightActions.createEl('button', { text: '⚡ Replace Entirely (New)' });
		replaceBtn.title = 'Overwrite file entirely with fresh GitHub metadata';
		replaceBtn.onclick = () => {
			this.isResolved = true;
			this.onResolve({
				action: 'replace' as any,
				resolvedFields: {}
			});
			this.close();
		};

		const applyBtn = rightActions.createEl('button', {
			text: 'Apply Selected Diff',
			cls: 'mod-cta'
		});
		applyBtn.onclick = () => {
			const resolved: Record<string, any> = {};
			for (const item of this.diffFields) {
				resolved[item.key] = item.choice === 'old' ? item.oldValue : item.newValue;
			}
			this.isResolved = true;
			this.onResolve({
				action: 'apply',
				resolvedFields: resolved,
				useOldBody: this.useOldBody
			});
			this.close();
		};
	}

	onClose(): void {
		if (!this.isResolved) {
			this.onResolve({ action: 'cancel', resolvedFields: {} });
		}
		this.contentEl.empty();
	}
}
