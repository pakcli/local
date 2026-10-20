import { setIcon } from 'obsidian';
import { CopyButton } from '../actions/CopyButton';

export interface ColumnDef<T> {
	key: string;
	title: string;
	width?: string;
	align?: 'left' | 'center' | 'right';
	sortable?: boolean;
	copyable?: boolean;
	render?: (item: T, index: number) => HTMLElement | string;
	tsvValue?: (item: T) => string;
}

export interface GenericTableOptions<T> {
	columns: ColumnDef<T>[];
	items: T[];
	rowKey: (item: T) => string;
	enableRowTsvCopy?: boolean;
	emptyMessage?: string;
	className?: string;
	onRowClick?: (item: T, event: MouseEvent) => void;
}

export class GenericTable<T> {
	public containerEl: HTMLElement;
	private tableEl!: HTMLTableElement;
	private tbodyEl!: HTMLTableSectionElement;
	private theadEl!: HTMLTableSectionElement;
	private options: GenericTableOptions<T>;
	private items: T[];
	private sortColumnKey?: string;
	private sortDirection: 'asc' | 'desc' = 'asc';

	constructor(parentEl: HTMLElement, options: GenericTableOptions<T>) {
		this.options = {
			emptyMessage: '~ No records found ~',
			enableRowTsvCopy: true,
			...options
		};
		this.items = [...options.items];

		this.containerEl = parentEl.createDiv({
			cls: `pakcli-generic-table-container ${this.options.className || ''}`.trim()
		});

		this.renderTable();
	}

	private renderTable() {
		this.containerEl.empty();
		this.tableEl = this.containerEl.createEl('table', { cls: 'pakcli-generic-table' });
		this.theadEl = this.tableEl.createEl('thead');
		this.tbodyEl = this.tableEl.createEl('tbody');

		this.renderHeader();
		this.renderRows();
	}

	private renderHeader() {
		this.theadEl.empty();
		const tr = this.theadEl.createEl('tr');

		for (const col of this.options.columns) {
			const th = tr.createEl('th', {
				text: col.title,
				cls: col.sortable ? 'is-sortable' : ''
			});

			if (col.width) th.style.width = col.width;
			if (col.align) th.style.textAlign = col.align;

			if (col.sortable) {
				const sortIcon = th.createSpan({ cls: 'pakcli-sort-indicator' });
				if (this.sortColumnKey === col.key) {
					th.addClass('is-sorted');
					setIcon(sortIcon, this.sortDirection === 'asc' ? 'chevron-up' : 'chevron-down');
				} else {
					setIcon(sortIcon, 'chevrons-up-down');
				}

				th.addEventListener('click', () => {
					this.handleSort(col.key);
				});
			}
		}

		if (this.options.enableRowTsvCopy) {
			const thAction = tr.createEl('th', {
				text: 'Action',
				cls: 'pakcli-col-action'
			});
			thAction.style.width = '90px';
			thAction.style.textAlign = 'right';
		}
	}

	private renderRows() {
		this.tbodyEl.empty();

		if (this.items.length === 0) {
			const tr = this.tbodyEl.createEl('tr', { cls: 'pakcli-table-empty-row' });
			const colSpan = this.options.columns.length + (this.options.enableRowTsvCopy ? 1 : 0);
			const td = tr.createEl('td', { attr: { colspan: colSpan } });
			td.createDiv({
				cls: 'pakcli-table-empty-msg text-muted',
				text: this.options.emptyMessage || '~ No records found ~'
			});
			return;
		}

		this.items.forEach((item, index) => {
			const tr = this.tbodyEl.createEl('tr', {
				cls: 'pakcli-table-row',
				attr: { 'data-row-key': this.options.rowKey(item) }
			});

			if (this.options.onRowClick) {
				tr.addEventListener('click', (e) => this.options.onRowClick?.(item, e));
			}

			for (const col of this.options.columns) {
				const td = tr.createEl('td', { cls: 'pakcli-table-cell' });
				if (col.align) td.style.textAlign = col.align;

				const cellWrapper = td.createDiv({ cls: 'pakcli-cell-wrapper' });
				const contentSpan = cellWrapper.createSpan({ cls: 'pakcli-cell-text' });

				const rawRender = col.render ? col.render(item, index) : (item as any)[col.key];
				if (rawRender instanceof HTMLElement) {
					contentSpan.appendChild(rawRender);
				} else {
					contentSpan.setText(rawRender != null ? String(rawRender) : '');
				}

				// If cell is copyable, attach hover copy button
				if (col.copyable) {
					const textToCopy = col.tsvValue
						? col.tsvValue(item)
						: (rawRender instanceof HTMLElement ? contentSpan.textContent || '' : String(rawRender || ''));

					if (textToCopy) {
						new CopyButton(cellWrapper, {
							text: textToCopy,
							title: `Copy ${col.title}`,
							className: 'pakcli-cell-hover-copy'
						});
					}
				}
			}

			// Row TSV Copy button
			if (this.options.enableRowTsvCopy) {
				const tdAction = tr.createEl('td', { cls: 'pakcli-table-cell pakcli-cell-actions' });
				tdAction.style.textAlign = 'right';

				new CopyButton(tdAction, {
					text: () => this.formatRowTsv(item),
					label: 'Row',
					title: 'Copy row as TSV (Spreadsheet ready)',
					iconOnly: false,
					className: 'pakcli-btn-row-copy'
				});
			}
		});
	}

	private handleSort(columnKey: string) {
		if (this.sortColumnKey === columnKey) {
			this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
		} else {
			this.sortColumnKey = columnKey;
			this.sortDirection = 'asc';
		}

		const col = this.options.columns.find((c) => c.key === columnKey);
		if (!col) return;

		this.items.sort((a, b) => {
			const valA = col.tsvValue ? col.tsvValue(a) : (a as any)[columnKey];
			const valB = col.tsvValue ? col.tsvValue(b) : (b as any)[columnKey];

			if (valA == null && valB == null) return 0;
			if (valA == null) return 1;
			if (valB == null) return -1;

			const comparison = String(valA).localeCompare(String(valB), undefined, { numeric: true, sensitivity: 'base' });
			return this.sortDirection === 'asc' ? comparison : -comparison;
		});

		this.renderHeader();
		this.renderRows();
	}

	public formatRowTsv(item: T): string {
		const cells = this.options.columns.map((col) => {
			const val = col.tsvValue ? col.tsvValue(item) : String((item as any)[col.key] || '');
			return this.escapeTsvCell(val);
		});
		return cells.join('\t');
	}

	public formatAllTsv(): string {
		const header = this.options.columns.map((col) => this.escapeTsvCell(col.title)).join('\t');
		const rows = this.items.map((item) => this.formatRowTsv(item));
		return [header, ...rows].join('\n');
	}

	private escapeTsvCell(value: string): string {
		if (!value) return '';
		const str = String(value);
		// RFC 4180 TSV: if contains quotes, tabs, or newlines, quote the field and double internal quotes
		if (str.includes('\t') || str.includes('\n') || str.includes('"') || str.includes('\r')) {
			return `"${str.replace(/"/g, '""')}"`;
		}
		return str;
	}

	public setItems(newItems: T[]) {
		this.items = [...newItems];
		if (this.sortColumnKey) {
			this.handleSort(this.sortColumnKey);
		} else {
			this.renderRows();
		}
	}

	public getItems(): T[] {
		return [...this.items];
	}

	public destroy() {
		this.containerEl.remove();
	}
}
