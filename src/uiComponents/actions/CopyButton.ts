import { setIcon } from 'obsidian';

export interface CopyButtonOptions {
	text: string | (() => string | Promise<string>);
	label?: string;
	title?: string;
	successTitle?: string;
	timeoutMs?: number;
	className?: string;
	iconOnly?: boolean;
	onCopySuccess?: (copiedText: string) => void;
	onCopyError?: (err: any) => void;
}

export class CopyButton {
	public containerEl: HTMLElement;
	private iconEl: HTMLElement;
	private labelEl?: HTMLElement;
	private timer: any = null;
	private options: CopyButtonOptions;

	constructor(parentEl: HTMLElement, options: CopyButtonOptions) {
		this.options = {
			title: 'Copy to clipboard',
			successTitle: 'Copied!',
			timeoutMs: 1000,
			iconOnly: true,
			...options
		};

		this.containerEl = parentEl.createEl('button', {
			cls: `pakcli-copy-btn clickable-icon ${this.options.className || ''}`.trim(),
			attr: {
				'aria-label': this.options.title || 'Copy to clipboard',
				'title': this.options.title || 'Copy to clipboard',
				'type': 'button'
			}
		});

		this.iconEl = this.containerEl.createSpan({ cls: 'pakcli-copy-icon' });
		setIcon(this.iconEl, 'copy');

		if (this.options.label && !this.options.iconOnly) {
			this.labelEl = this.containerEl.createSpan({
				cls: 'pakcli-copy-label',
				text: this.options.label
			});
		}

		this.containerEl.addEventListener('click', (e) => {
			e.stopPropagation();
			void this.triggerCopy();
		});
	}

	public async triggerCopy(): Promise<boolean> {
		try {
			const rawText = typeof this.options.text === 'function'
				? await this.options.text()
				: this.options.text;

			if (!rawText) return false;

			await navigator.clipboard.writeText(rawText);

			this.showSuccessState();
			this.options.onCopySuccess?.(rawText);
			return true;
		} catch (err) {
			console.error('[CopyButton] Copy failed:', err);
			this.options.onCopyError?.(err);
			return false;
		}
	}

	private showSuccessState() {
		if (this.timer) {
			window.clearTimeout(this.timer);
			this.timer = null;
		}

		this.containerEl.addClass('is-copied');
		this.containerEl.setAttribute('aria-label', this.options.successTitle || 'Copied!');
		this.containerEl.setAttribute('title', this.options.successTitle || 'Copied!');
		setIcon(this.iconEl, 'check');

		if (this.labelEl) {
			this.labelEl.setText('Copied!');
		}

		this.timer = window.setTimeout(() => {
			this.restoreDefaultState();
		}, this.options.timeoutMs || 1000);
	}

	private restoreDefaultState() {
		this.containerEl.removeClass('is-copied');
		this.containerEl.setAttribute('aria-label', this.options.title || 'Copy to clipboard');
		this.containerEl.setAttribute('title', this.options.title || 'Copy to clipboard');
		setIcon(this.iconEl, 'copy');

		if (this.labelEl && this.options.label) {
			this.labelEl.setText(this.options.label);
		}

		this.timer = null;
	}

	public updateText(newText: string | (() => string | Promise<string>)) {
		this.options.text = newText;
	}

	public destroy() {
		if (this.timer) {
			window.clearTimeout(this.timer);
			this.timer = null;
		}
		this.containerEl.remove();
	}
}
