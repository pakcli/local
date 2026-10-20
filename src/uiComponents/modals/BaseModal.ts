import { App, Modal, setIcon } from 'obsidian';

export interface BaseModalOptions {
	title: string;
	subtitle?: string;
	badgeText?: string;
	badgeCls?: string;
	modalCls?: string;
	width?: string;
}

export abstract class BaseModal extends Modal {
	public headerEl!: HTMLElement;
	public bodyEl!: HTMLElement;
	public footerEl!: HTMLElement;
	protected options: BaseModalOptions;

	constructor(app: App, options: BaseModalOptions) {
		super(app);
		this.options = options;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('pakcli-base-modal');
		if (this.options.modalCls) {
			contentEl.addClass(this.options.modalCls);
		}
		if (this.options.width) {
			this.modalEl.style.width = this.options.width;
		}

		// 1. Header Section
		this.headerEl = contentEl.createDiv({ cls: 'pakcli-modal-header' });
		const titleRow = this.headerEl.createDiv({ cls: 'pakcli-modal-title-row' });
		titleRow.createEl('h2', { cls: 'pakcli-modal-title', text: this.options.title });

		if (this.options.badgeText) {
			titleRow.createSpan({
				cls: `pakcli-modal-badge ${this.options.badgeCls || ''}`.trim(),
				text: this.options.badgeText
			});
		}

		if (this.options.subtitle) {
			this.headerEl.createEl('p', {
				cls: 'pakcli-modal-subtitle text-muted',
				text: this.options.subtitle
			});
		}

		// 2. Scrollable Body Section
		this.bodyEl = contentEl.createDiv({ cls: 'pakcli-modal-body' });

		// 3. Footer Section (Actions)
		this.footerEl = contentEl.createDiv({ cls: 'pakcli-modal-footer' });

		// Template method for subclasses
		this.renderBody(this.bodyEl);
		this.renderFooter(this.footerEl);
	}

	abstract renderBody(bodyEl: HTMLElement): void;

	renderFooter(footerEl: HTMLElement): void {
		// Default close button if not overridden
		const cancelBtn = footerEl.createEl('button', {
			cls: 'mod-cancel',
			text: 'Close'
		});
		cancelBtn.addEventListener('click', () => this.close());
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
