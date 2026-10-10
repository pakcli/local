import { Setting } from 'obsidian';
import { PakCLILocalSettings } from '../../settings';

export function renderGitHubFetcherSettings(
	containerEl: HTMLElement,
	settings: PakCLILocalSettings,
	onSave: () => Promise<void>
): void {
	containerEl.empty();

	const header = containerEl.createEl('h3', { text: 'GitHub Repository Library Settings' });
	header.style.marginBottom = '8px';

	new Setting(containerEl)
		.setName('Library Destination Folder')
		.setDesc('Default folder in your vault where fetched repository notes are stored')
		.addText((text) =>
			text
				.setPlaceholder('Digital Library/Github Repository')
				.setValue(settings.githubLibraryFolder || 'Digital Library/Github Repository')
				.onChange(async (val) => {
					settings.githubLibraryFolder = val.trim() || 'Digital Library/Github Repository';
					await onSave();
				})
		);

	new Setting(containerEl)
		.setName('Prefer GitHub CLI (`gh`)')
		.setDesc('Use local GitHub CLI executable if available in system PATH for authenticated rate-limit-free fetching')
		.addToggle((toggle) =>
			toggle
				.setValue(settings.githubUseCli !== false)
				.onChange(async (val) => {
					settings.githubUseCli = val;
					await onSave();
				})
		);

	new Setting(containerEl)
		.setName('Preserve User Overview On Re-fetch')
		.setDesc('When re-fetching an existing repository note, preserve any custom text written in the overview property')
		.addToggle((toggle) =>
			toggle
				.setValue(!settings.githubOverwriteOverview)
				.onChange(async (val) => {
					settings.githubOverwriteOverview = !val;
					await onSave();
				})
		);
}
