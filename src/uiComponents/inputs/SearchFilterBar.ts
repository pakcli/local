import { setIcon } from 'obsidian';

export interface SearchFilterBarOptions {
	placeholder?: string;
	initialValue?: string;
	debounceMs?: number;
	enableSlashFocus?: boolean;
	className?: string;
	onSearchChange: (query: string) => void;
}

export class SearchFilterBar {
	public containerEl: HTMLElement;
	public inputEl: HTMLInputElement;
	private clearBtnEl: HTMLElement;
	private debounceTimer: any = null;
	private options: SearchFilterBarOptions;
	private keydownHandler?: (e: KeyboardEvent) => void;

	constructor(parentEl: HTMLElement, options: SearchFilterBarOptions) {
		this.options = {
			placeholder: 'Search...',
			debounceMs: 150,
			enableSlashFocus: true,
			...options
		};

		this.containerEl = parentEl.createDiv({
			cls: `pakcli-search-filter-bar ${this.options.className || ''}`.trim()
		});

		// Search icon prefix
		const iconSpan = this.containerEl.createSpan({ cls: 'pakcli-search-icon' });
		setIcon(iconSpan, 'search');

		// Input element
		this.inputEl = this.containerEl.createEl('input', {
			type: 'text',
			cls: 'pakcli-search-input',
			value: this.options.initialValue || '',
			attr: {
				placeholder: this.options.placeholder || 'Search...',
				spellcheck: 'false'
			}
		});

		// Clear button [x]
		this.clearBtnEl = this.containerEl.createEl('button', {
			cls: 'pakcli-search-clear-btn clickable-icon',
			attr: {
				'aria-label': 'Clear search',
				'title': 'Clear search',
				'type': 'button'
			}
		});
		setIcon(this.clearBtnEl, 'x');
		this.updateClearBtnVisibility();

		// Event handlers
		this.inputEl.addEventListener('input', () => {
			this.updateClearBtnVisibility();
			this.handleInputDebounced();
		});

		this.inputEl.addEventListener('keydown', (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				if (this.inputEl.value) {
					this.clear();
					e.stopPropagation();
				} else {
					this.inputEl.blur();
				}
			}
		});

		this.clearBtnEl.addEventListener('click', (e) => {
			e.stopPropagation();
			this.clear();
			this.inputEl.focus();
		});

		// Global '/' hotkey focus
		if (this.options.enableSlashFocus) {
			this.setupSlashHotkey();
		}
	}

	private handleInputDebounced() {
		if (this.debounceTimer) {
			window.clearTimeout(this.debounceTimer);
		}
		this.debounceTimer = window.setTimeout(() => {
			this.options.onSearchChange(this.inputEl.value.trim());
		}, this.options.debounceMs || 150);
	}

	private updateClearBtnVisibility() {
		if (this.inputEl.value.length > 0) {
			this.clearBtnEl.addClass('is-visible');
		} else {
			this.clearBtnEl.removeClass('is-visible');
		}
	}

	private setupSlashHotkey() {
		this.keydownHandler = (e: KeyboardEvent) => {
			if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey) {
				const activeTag = document.activeElement?.tagName.toLowerCase();
				if (activeTag === 'input' || activeTag === 'textarea' || (document.activeElement as HTMLElement)?.isContentEditable) {
					return; // Jangan bajak input lain
				}
				e.preventDefault();
				this.inputEl.focus();
				this.inputEl.select();
			}
		};
		window.addEventListener('keydown', this.keydownHandler);
	}

	public getValue(): string {
		return this.inputEl.value;
	}

	public setValue(val: string, triggerCallback = true) {
		this.inputEl.value = val;
		this.updateClearBtnVisibility();
		if (triggerCallback) {
			this.options.onSearchChange(val.trim());
		}
	}

	public clear() {
		this.setValue('', true);
	}

	public focus() {
		this.inputEl.focus();
	}

	public destroy() {
		if (this.debounceTimer) {
			window.clearTimeout(this.debounceTimer);
			this.debounceTimer = null;
		}
		if (this.keydownHandler) {
			window.removeEventListener('keydown', this.keydownHandler);
		}
		this.containerEl.remove();
	}
}
