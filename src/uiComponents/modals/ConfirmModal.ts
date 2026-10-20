import { App } from 'obsidian';
import { BaseModal } from './BaseModal';

export interface ConfirmModalOptions {
	title: string;
	message: string;
	detail?: string;
	confirmLabel?: string;
	cancelLabel?: string;
	isDanger?: boolean;
	requiredConfirmText?: string;
	confirmInputPlaceholder?: string;
	onConfirm: () => void | Promise<void>;
	onCancel?: () => void;
}

export class ConfirmModal extends BaseModal {
	private confirmOptions: ConfirmModalOptions;
	private confirmBtn!: HTMLButtonElement;
	private inputEl?: HTMLInputElement;

	constructor(app: App, options: ConfirmModalOptions) {
		super(app, {
			title: options.title,
			modalCls: options.isDanger ? 'pakcli-modal-danger' : 'pakcli-modal-confirm',
			width: '450px'
		});
		this.confirmOptions = {
			confirmLabel: options.isDanger ? 'Delete' : 'Confirm',
			cancelLabel: 'Cancel',
			...options
		};
	}

	renderBody(bodyEl: HTMLElement): void {
		bodyEl.createEl('p', {
			cls: 'pakcli-confirm-message',
			text: this.confirmOptions.message
		});

		if (this.confirmOptions.detail) {
			bodyEl.createEl('p', {
				cls: 'pakcli-confirm-detail text-muted',
				text: this.confirmOptions.detail
			});
		}

		// Type-to-confirm mode
		if (this.confirmOptions.requiredConfirmText) {
			const promptContainer = bodyEl.createDiv({ cls: 'pakcli-type-confirm-container' });
			promptContainer.createEl('label', {
				cls: 'pakcli-type-confirm-label',
				text: `Type "${this.confirmOptions.requiredConfirmText}" to confirm:`
			});

			this.inputEl = promptContainer.createEl('input', {
				type: 'text',
				cls: 'pakcli-type-confirm-input',
				attr: {
					placeholder: this.confirmOptions.confirmInputPlaceholder || this.confirmOptions.requiredConfirmText,
					spellcheck: 'false'
				}
			});

			this.inputEl.addEventListener('input', () => {
				this.checkConfirmState();
			});

			this.inputEl.addEventListener('keydown', (e: KeyboardEvent) => {
				if (e.key === 'Enter' && !this.confirmBtn.disabled) {
					e.preventDefault();
					void this.handleConfirm();
				}
			});

			window.setTimeout(() => this.inputEl?.focus(), 50);
		}
	}

	renderFooter(footerEl: HTMLElement): void {
		footerEl.empty();

		const cancelBtn = footerEl.createEl('button', {
			cls: 'mod-cancel',
			text: this.confirmOptions.cancelLabel || 'Cancel'
		});
		cancelBtn.addEventListener('click', () => {
			this.confirmOptions.onCancel?.();
			this.close();
		});

		this.confirmBtn = footerEl.createEl('button', {
			cls: this.confirmOptions.isDanger ? 'mod-warning' : 'mod-cta',
			text: this.confirmOptions.confirmLabel || 'Confirm'
		});

		if (this.confirmOptions.requiredConfirmText) {
			this.confirmBtn.disabled = true;
		}

		this.confirmBtn.addEventListener('click', () => {
			void this.handleConfirm();
		});
	}

	private checkConfirmState() {
		if (!this.confirmOptions.requiredConfirmText || !this.inputEl) return;
		const matches = this.inputEl.value.trim() === this.confirmOptions.requiredConfirmText.trim();
		this.confirmBtn.disabled = !matches;
	}

	private async handleConfirm() {
		if (this.confirmBtn.disabled) return;
		this.confirmBtn.disabled = true;
		this.confirmBtn.setText('Processing...');
		try {
			await this.confirmOptions.onConfirm();
			this.close();
		} catch (err) {
			console.error('[ConfirmModal] Error during confirm action:', err);
			this.confirmBtn.disabled = false;
			this.confirmBtn.setText(this.confirmOptions.confirmLabel || 'Confirm');
		}
	}
}
