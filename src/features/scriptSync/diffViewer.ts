/**
 * diffViewer.ts
 *
 * Line-by-line diff computation and HTML renderer for the codeblock sync comparison.
 */

export interface DiffLine {
    type: 'added' | 'removed' | 'unchanged';
    text: string;
    oldLineNumber?: number;
    newLineNumber?: number;
}

export interface DiffViewerOptions {
    leftText: string;
    rightText: string;
    leftLabel?: string;
    rightLabel?: string;
    isSwapped?: boolean;
    onSwap?: () => void;
    onApplyToLeft?: () => Promise<void> | void;
    onApplyToRight?: () => Promise<void> | void;
    applyLeftLabel?: string;
    applyRightLabel?: string;
}

/**
 * Computes simple line-by-line diff between two strings.
 */
export function computeLineDiff(oldText: string, newText: string): DiffLine[] {
    const cleanOld = (oldText || '').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
    const cleanNew = (newText || '').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
    const oldLines = cleanOld ? cleanOld.split('\n') : [];
    const newLines = cleanNew ? cleanNew.split('\n') : [];
    const diff: DiffLine[] = [];

    // Simple LCS-based or line-matching diff
    let i = 0;
    let j = 0;
    let oldNum = 1;
    let newNum = 1;

    while (i < oldLines.length || j < newLines.length) {
        if (i < oldLines.length && j < newLines.length && oldLines[i] === newLines[j]) {
            diff.push({
                type: 'unchanged',
                text: oldLines[i] || '',
                oldLineNumber: oldNum++,
                newLineNumber: newNum++
            });
            i++;
            j++;
        } else if (j < newLines.length && (!oldLines.includes(newLines[j] || '') || (i >= oldLines.length))) {
            diff.push({
                type: 'added',
                text: newLines[j] || '',
                newLineNumber: newNum++
            });
            j++;
        } else if (i < oldLines.length) {
            diff.push({
                type: 'removed',
                text: oldLines[i] || '',
                oldLineNumber: oldNum++
            });
            i++;
        } else {
            break;
        }
    }

    return diff;
}

/**
 * Renders diff output into a container element.
 * Supports both options object and legacy string arguments.
 */
export function renderDiffViewer(
    container: HTMLElement,
    oldTextOrOptions: string | DiffViewerOptions,
    newText?: string,
    oldLabel = 'CLI Script',
    newLabel = 'Manager Note'
): void {
    container.empty();

    let leftText = '';
    let rightText = '';
    let leftLabel = 'CLI Script';
    let rightLabel = 'Manager Note';
    let onSwap: (() => void) | undefined;
    let onApplyToLeft: (() => Promise<void> | void) | undefined;
    let onApplyToRight: (() => Promise<void> | void) | undefined;
    let applyLeftLabel = '⬅ Apply to Left';
    let applyRightLabel = '➔ Apply to Right';

    if (typeof oldTextOrOptions === 'object' && oldTextOrOptions !== null) {
        const opts = oldTextOrOptions;
        leftText = opts.leftText ?? '';
        rightText = opts.rightText ?? '';
        leftLabel = opts.leftLabel ?? 'Left';
        rightLabel = opts.rightLabel ?? 'Right';
        onSwap = opts.onSwap;
        onApplyToLeft = opts.onApplyToLeft;
        onApplyToRight = opts.onApplyToRight;
        applyLeftLabel = opts.applyLeftLabel ?? '⬅ Apply to Left';
        applyRightLabel = opts.applyRightLabel ?? '➔ Apply to Right';
    } else {
        leftText = typeof oldTextOrOptions === 'string' ? oldTextOrOptions : '';
        rightText = newText ?? '';
        leftLabel = oldLabel;
        rightLabel = newLabel;
    }

    // Top Toolbar
    const toolbar = container.createDiv({ cls: 'pakcli-diff-toolbar' });

    // Left info & swap button & right info
    const labelsContainer = toolbar.createDiv({ cls: 'pakcli-diff-labels' });
    labelsContainer.createSpan({ cls: 'pakcli-diff-side-label pakcli-diff-side-left', text: `🔴 ${leftLabel}` });

    if (onSwap) {
        const swapBtn = labelsContainer.createEl('button', {
            cls: 'pakcli-diff-btn pakcli-diff-swap-btn',
            text: '⇄ Swap Diff',
            attr: { 'title': 'Swap left and right comparison sides' }
        });
        swapBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            onSwap();
        });
    } else {
        labelsContainer.createSpan({ cls: 'pakcli-diff-arrow', text: '⇄' });
    }

    labelsContainer.createSpan({ cls: 'pakcli-diff-side-label pakcli-diff-side-right', text: `🟢 ${rightLabel}` });

    // Action buttons: Apply to Left & Apply to Right
    if (onApplyToLeft || onApplyToRight) {
        const actionsContainer = toolbar.createDiv({ cls: 'pakcli-diff-actions' });

        if (onApplyToLeft) {
            const applyLeftBtn = actionsContainer.createEl('button', {
                cls: 'pakcli-diff-btn pakcli-diff-apply-btn pakcli-diff-apply-left',
                text: applyLeftLabel,
                attr: { 'title': `Apply right side content into ${leftLabel}` }
            });
            applyLeftBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                applyLeftBtn.disabled = true;
                applyLeftBtn.setText('⏳ Applying...');
                try {
                    await onApplyToLeft();
                } finally {
                    applyLeftBtn.disabled = false;
                    applyLeftBtn.setText(applyLeftLabel);
                }
            });
        }

        if (onApplyToRight) {
            const applyRightBtn = actionsContainer.createEl('button', {
                cls: 'pakcli-diff-btn pakcli-diff-apply-btn pakcli-diff-apply-right',
                text: applyRightLabel,
                attr: { 'title': `Apply left side content into ${rightLabel}` }
            });
            applyRightBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                applyRightBtn.disabled = true;
                applyRightBtn.setText('⏳ Applying...');
                try {
                    await onApplyToRight();
                } finally {
                    applyRightBtn.disabled = false;
                    applyRightBtn.setText(applyRightLabel);
                }
            });
        }
    }

    const diffLines = computeLineDiff(leftText, rightText);
    const diffTable = container.createDiv({ cls: 'pakcli-diff-table' });

    let hasChanges = false;

    diffLines.forEach((line) => {
        if (line.type !== 'unchanged') hasChanges = true;

        const row = diffTable.createDiv({ cls: `pakcli-diff-row pakcli-diff-${line.type}` });

        const lineNumLeft = row.createSpan({ cls: 'pakcli-diff-linenum' });
        lineNumLeft.textContent = line.oldLineNumber ? String(line.oldLineNumber) : '';

        const lineNumRight = row.createSpan({ cls: 'pakcli-diff-linenum' });
        lineNumRight.textContent = line.newLineNumber ? String(line.newLineNumber) : '';

        const marker = row.createSpan({ cls: 'pakcli-diff-marker' });
        marker.textContent = line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' ';

        const content = row.createSpan({ cls: 'pakcli-diff-content' });
        content.textContent = line.text;
    });

    if (!hasChanges) {
        diffTable.empty();
        diffTable.createDiv({ cls: 'pakcli-diff-no-changes', text: '✓ Content is identical. No differences detected.' });
    }
}
