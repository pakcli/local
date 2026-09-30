import { App, Plugin, Setting, setIcon, Notice } from 'obsidian';
import { RawOpenerManager } from './RawOpenerManager';
import { RawOpenerSettings, RawFormatRule, RawFileMode, PRESET_CATEGORIES, DEFAULT_RAW_RULES } from './types';

export function renderRawOpenerSettings(
    app: App,
    plugin: Plugin,
    manager: RawOpenerManager,
    getSettings: () => RawOpenerSettings,
    saveSettings: () => Promise<void>,
    containerEl: HTMLElement
) {
    containerEl.empty();
    containerEl.addClass('raw-opener-settings-container');

    const settings = getSettings();

    // 1. Title & Header
    const headerEl = containerEl.createDiv({ cls: 'raw-opener-settings-header' });
    const titleEl = headerEl.createEl('h2', { text: '📄 Raw File Opener (Custom Formats)' });
    titleEl.addClass('raw-opener-title');

    headerEl.createEl('p', {
        cls: 'setting-item-description',
        text: 'Open non-markdown raw files (Python, JSON, CSV, YAML, Shell scripts, Logs, etc.) directly in Obsidian editor tabs with customizable Live Preview, Source Mode, or Read-Only protection.'
    });

    // 2. Master Toggle
    new Setting(containerEl)
        .setName('Enable Raw File Opener')
        .setDesc('Register custom file formats to open inside Obsidian editor instead of prompting for external applications.')
        .addToggle(toggle => {
            toggle
                .setValue(settings.rawOpenerEnabled)
                .onChange(async (val) => {
                    settings.rawOpenerEnabled = val;
                    await saveSettings();
                    manager.syncActiveRegistrations();
                    renderRawOpenerSettings(app, plugin, manager, getSettings, saveSettings, containerEl);
                    new Notice(`[RawOpener] Raw File Opener is now ${val ? 'Enabled' : 'Disabled'}.`);
                });
        });

    if (!settings.rawOpenerEnabled) return;

    // 3. Global Default Mode
    new Setting(containerEl)
        .setName('Default View Mode')
        .setDesc('Initial mode applied when opening raw files if not customized individually.')
        .addDropdown(dd => {
            dd
                .addOption('live', '✨ Live Preview (Default)')
                .addOption('source', '📝 Source Mode (Raw Text)')
                .addOption('reading', '📖 Reading View')
                .setValue(settings.rawDefaultMode || 'live')
                .onChange(async (val) => {
                    settings.rawDefaultMode = val as RawFileMode;
                    await saveSettings();
                    new Notice(`[RawOpener] Default view mode set to ${val}.`);
                });
        });

    // 4. Global Default Read-Only
    new Setting(containerEl)
        .setName('Default Read-Only Lock')
        .setDesc('Lock new raw formats against modifications by default.')
        .addToggle(toggle => {
            toggle
                .setValue(settings.rawDefaultReadOnly || false)
                .onChange(async (val) => {
                    settings.rawDefaultReadOnly = val;
                    await saveSettings();
                });
        });

    // 5. In-Editor Header Banner
    new Setting(containerEl)
        .setName('Show In-Editor Quick Toolbar')
        .setDesc('Display a sleek top banner inside raw file tabs for instant mode switching (Live / Source / Reading) and Read-Only lock toggling.')
        .addToggle(toggle => {
            toggle
                .setValue(settings.rawShowHeaderBanner !== false)
                .onChange(async (val) => {
                    settings.rawShowHeaderBanner = val;
                    await saveSettings();
                });
        });

    // 6. Quick Preset Categories
    const presetSection = containerEl.createDiv({ cls: 'raw-opener-section preset-section' });
    presetSection.createEl('h3', { text: '⚡ Quick Add Format Presets' });
    presetSection.createEl('p', {
        cls: 'setting-item-description',
        text: 'One-click add common file extensions to Obsidian with sensible Live Preview defaults.'
    });

    const presetGrid = presetSection.createDiv({ cls: 'raw-opener-preset-grid' });

    Object.entries(PRESET_CATEGORIES).forEach(([key, category]) => {
        const card = presetGrid.createDiv({ cls: 'raw-opener-preset-card' });
        const topRow = card.createDiv({ cls: 'raw-preset-top' });
        const iconSpan = topRow.createSpan({ cls: 'raw-preset-icon' });
        setIcon(iconSpan, category.icon);
        topRow.createSpan({ cls: 'raw-preset-name', text: category.name });

        const countSpan = topRow.createSpan({ cls: 'raw-preset-count', text: `${category.extensions.length} formats` });

        const badgeList = card.createDiv({ cls: 'raw-preset-badges' });
        category.extensions.slice(0, 8).forEach(item => {
            badgeList.createSpan({ cls: 'raw-ext-chip', text: `.${item.ext}` });
        });
        if (category.extensions.length > 8) {
            badgeList.createSpan({ cls: 'raw-ext-chip more', text: `+${category.extensions.length - 8} more` });
        }

        const addBtn = card.createEl('button', {
            cls: 'raw-preset-btn',
            text: `+ Add All ${category.name}`
        });

        addBtn.onclick = async () => {
            let addedCount = 0;
            for (const item of category.extensions) {
                const existing = manager.getRule(item.ext);
                if (!existing) {
                    await manager.addRule(item.ext, 'live', false, item.desc);
                    addedCount++;
                } else if (!existing.enabled) {
                    existing.enabled = true;
                    await manager.updateRule(existing);
                    addedCount++;
                }
            }
            new Notice(`[RawOpener] Added/enabled ${addedCount} format(s) for ${category.name}!`);
            renderRawOpenerSettings(app, plugin, manager, getSettings, saveSettings, containerEl);
        };
    });

    // 7. Add Custom Format Box
    const addSection = containerEl.createDiv({ cls: 'raw-opener-section add-custom-section' });
    addSection.createEl('h3', { text: '➕ Add Custom File Format' });

    const addBox = addSection.createDiv({ cls: 'raw-add-custom-box' });

    let newExt = '';
    let newMode: RawFileMode = 'live';
    let newReadOnly = false;
    let newDesc = '';

    const extInput = addBox.createEl('input', {
        type: 'text',
        placeholder: 'Extension (e.g. py, json, dat, xyz)',
        cls: 'raw-input-ext'
    });
    extInput.oninput = (e) => {
        newExt = (e.target as HTMLInputElement).value.trim().toLowerCase().replace(/^\./, '');
    };

    const descInput = addBox.createEl('input', {
        type: 'text',
        placeholder: 'Description (optional)',
        cls: 'raw-input-desc'
    });
    descInput.oninput = (e) => {
        newDesc = (e.target as HTMLInputElement).value.trim();
    };

    const modeSelect = addBox.createEl('select', { cls: 'raw-select-mode' });
    [
        { id: 'live', label: '✨ Live Preview' },
        { id: 'source', label: '📝 Source Mode' },
        { id: 'reading', label: '📖 Reading View' }
    ].forEach(m => {
        const opt = modeSelect.createEl('option', { value: m.id, text: m.label });
        if (m.id === 'live') opt.selected = true;
    });
    modeSelect.onchange = (e) => {
        newMode = (e.target as HTMLSelectElement).value as RawFileMode;
    };

    const lockLabel = addBox.createEl('label', { cls: 'raw-checkbox-label' });
    const lockCheck = lockLabel.createEl('input', { type: 'checkbox' });
    lockLabel.appendChild(document.createTextNode(' 🔒 Read-Only'));
    lockCheck.onchange = (e) => {
        newReadOnly = (e.target as HTMLInputElement).checked;
    };

    const addActionBtn = addBox.createEl('button', {
        cls: 'mod-cta raw-add-submit-btn',
        text: 'Add Format'
    });

    addActionBtn.onclick = async () => {
        if (!newExt) {
            new Notice('⚠️ Please enter a valid file extension (e.g. py, json, xyz).');
            return;
        }

        const existing = manager.getRule(newExt);
        if (existing) {
            existing.enabled = true;
            existing.mode = newMode;
            existing.readOnly = newReadOnly;
            if (newDesc) existing.description = newDesc;
            await manager.updateRule(existing);
            new Notice(`[RawOpener] Updated format rule for .${newExt}!`);
        } else {
            await manager.addRule(newExt, newMode, newReadOnly, newDesc);
            new Notice(`✅ [RawOpener] Added .${newExt} to Obsidian raw formats!`);
        }

        renderRawOpenerSettings(app, plugin, manager, getSettings, saveSettings, containerEl);
    };

    // 8. Registered Formats List & Table
    const listSection = containerEl.createDiv({ cls: 'raw-opener-section list-section' });
    const listHeader = listSection.createDiv({ cls: 'raw-list-header' });
    listHeader.createEl('h3', { text: `📋 Configured Formats (${settings.rawRules.length})` });

    // Filter Search
    const searchWrapper = listHeader.createDiv({ cls: 'raw-search-wrapper' });
    const searchInput = searchWrapper.createEl('input', {
        type: 'text',
        placeholder: 'Filter formats...',
        cls: 'raw-search-input'
    });

    // Reset Defaults Button
    const resetBtn = listHeader.createEl('button', {
        cls: 'raw-reset-btn',
        text: 'Reset Defaults'
    });
    resetBtn.onclick = async () => {
        settings.rawRules = [...DEFAULT_RAW_RULES];
        await saveSettings();
        manager.syncActiveRegistrations();
        new Notice('🔄 [RawOpener] Reset format rules to default.');
        renderRawOpenerSettings(app, plugin, manager, getSettings, saveSettings, containerEl);
    };

    const tableWrapper = listSection.createDiv({ cls: 'raw-table-wrapper' });

    function renderRulesTable(filterText: string = '') {
        tableWrapper.empty();

        const filtered = settings.rawRules.filter(r => {
            if (!filterText) return true;
            const ft = filterText.toLowerCase();
            return r.extension.toLowerCase().includes(ft) ||
                (r.description && r.description.toLowerCase().includes(ft));
        });

        if (filtered.length === 0) {
            tableWrapper.createDiv({
                cls: 'raw-empty-message',
                text: filterText ? `No formats matching "${filterText}".` : 'No formats configured.'
            });
            return;
        }

        const table = tableWrapper.createEl('table', { cls: 'raw-rules-table' });
        const thead = table.createEl('thead');
        const hRow = thead.createEl('tr');
        hRow.createEl('th', { text: 'Active', cls: 'col-active' });
        hRow.createEl('th', { text: 'Extension & Type', cls: 'col-ext' });
        hRow.createEl('th', { text: 'Default Mode', cls: 'col-mode' });
        hRow.createEl('th', { text: 'Lock (Read-Only)', cls: 'col-lock' });
        hRow.createEl('th', { text: 'Actions', cls: 'col-actions' });

        const tbody = table.createEl('tbody');

        filtered.forEach(rule => {
            const row = tbody.createEl('tr', { cls: rule.enabled ? 'is-enabled' : 'is-disabled' });

            // 1. Enabled Checkbox
            const activeTd = row.createEl('td', { cls: 'col-active' });
            const enableCheck = activeTd.createEl('input', { type: 'checkbox' });
            enableCheck.checked = rule.enabled;
            enableCheck.onchange = async () => {
                await manager.toggleRuleEnabled(rule.extension);
                row.className = rule.enabled ? 'is-enabled' : 'is-disabled';
            };

            // 2. Extension & Description
            const extTd = row.createEl('td', { cls: 'col-ext' });
            const extBadge = extTd.createSpan({ cls: 'raw-format-badge', text: `.${rule.extension.toUpperCase()}` });
            if (rule.description) {
                extTd.createSpan({ cls: 'raw-format-desc', text: rule.description });
            }

            // 3. Mode Select
            const modeTd = row.createEl('td', { cls: 'col-mode' });
            const modeSelectEl = modeTd.createEl('select', { cls: 'raw-row-mode-select' });
            [
                { id: 'live', label: '✨ Live Preview' },
                { id: 'source', label: '📝 Source Mode' },
                { id: 'reading', label: '📖 Reading View' }
            ].forEach(m => {
                const opt = modeSelectEl.createEl('option', { value: m.id, text: m.label });
                if (rule.mode === m.id) opt.selected = true;
            });
            modeSelectEl.onchange = async () => {
                await manager.setExtensionMode(rule.extension, modeSelectEl.value as RawFileMode);
            };

            // 4. Read-Only Toggle Button
            const lockTd = row.createEl('td', { cls: 'col-lock' });
            const lockBtn = lockTd.createEl('button', {
                cls: `raw-row-lock-btn ${rule.readOnly ? 'is-locked' : 'is-unlocked'}`
            });
            const lockIcon = document.createElement('span');
            setIcon(lockIcon, rule.readOnly ? 'lock' : 'unlock');
            lockBtn.appendChild(lockIcon);
            lockBtn.appendChild(document.createTextNode(rule.readOnly ? ' Read-Only' : ' Editable'));
            lockBtn.onclick = async () => {
                await manager.toggleExtensionReadOnly(rule.extension);
                renderRulesTable(searchInput.value.trim());
            };

            // 5. Delete Action
            const actionTd = row.createEl('td', { cls: 'col-actions' });
            const delBtn = actionTd.createEl('button', {
                cls: 'raw-row-del-btn',
                attr: { 'aria-label': `Remove .${rule.extension} rule` }
            });
            setIcon(delBtn, 'trash-2');
            delBtn.onclick = async () => {
                await manager.removeRule(rule.extension);
                new Notice(`[RawOpener] Removed .${rule.extension} format rule.`);
                renderRulesTable(searchInput.value.trim());
            };
        });
    }

    searchInput.oninput = (e) => {
        renderRulesTable((e.target as HTMLInputElement).value.trim());
    };

    renderRulesTable();
}
