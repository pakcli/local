import { App, Notice, TFile, normalizePath } from 'obsidian';
import { PakCLILocalSettings } from '../../settings';
import { GitHubCliService } from './services/GitHubCliService';
import { GitHubRepoParser } from './services/GitHubRepoParser';
import { FetchResult } from './types';

export class GitHubFetcherManager {
	private app: App;
	private settings: PakCLILocalSettings;

	constructor(app: App, settings: PakCLILocalSettings) {
		this.app = app;
		this.settings = settings;
	}

	/**
	 * Ensures the destination folder exists in the vault
	 */
	public async ensureTargetFolder(folderPath: string): Promise<void> {
		const norm = normalizePath(folderPath);
		const existing = this.app.vault.getAbstractFileByPath(norm);
		if (existing) return;

		// Create folders recursively if needed
		const parts = norm.split('/').filter(Boolean);
		let current = '';
		for (const part of parts) {
			current = current ? `${current}/${part}` : part;
			if (!this.app.vault.getAbstractFileByPath(current)) {
				try {
					await this.app.vault.createFolder(current);
				} catch {
					// Ignore if created concurrently
				}
			}
		}
	}

	/**
	 * Fetches a single repository and writes it to the library folder
	 */
	public async fetchSingleRepo(
		owner: string,
		repo: string,
		destFolder?: string
	): Promise<FetchResult> {
		const targetFolder = destFolder || this.settings.githubLibraryFolder || 'Digital Library/Github Repository';
		const targetFileName = `${repo}.md`;
		const targetPath = normalizePath(`${targetFolder}/${targetFileName}`);

		try {
			await this.ensureTargetFolder(targetFolder);

			const meta = await GitHubCliService.fetchRepo(owner, repo, this.settings.githubUseCli);

			// Check if file already exists to preserve manual overview notes
			let existingOverview = '';
			const existingFile = this.app.vault.getAbstractFileByPath(targetPath);
			if (existingFile instanceof TFile) {
				const existingContent = await this.app.vault.read(existingFile);
				existingOverview = GitHubRepoParser.extractExistingOverview(existingContent);
			}

			const markdownContent = GitHubRepoParser.serializeToMarkdown(meta, existingOverview);

			if (existingFile instanceof TFile) {
				await this.app.vault.modify(existingFile, markdownContent);
			} else {
				await this.app.vault.create(targetPath, markdownContent);
			}

			return {
				url: `https://github.com/${owner}/${repo}`,
				success: true,
				filePath: targetPath,
				repoName: repo
			};
		} catch (err: any) {
			console.error(`[PakCLI Local] Error fetching ${owner}/${repo}:`, err);
			return {
				url: `https://github.com/${owner}/${repo}`,
				success: false,
				error: err?.message || String(err),
				repoName: repo
			};
		}
	}

	/**
	 * Fetches multiple repositories in sequence with live progress reporting
	 */
	public async fetchBatchRepos(
		rawInput: string,
		destFolder?: string,
		onProgress?: (current: number, total: number, repoName: string) => void
	): Promise<FetchResult[]> {
		const parsedList = GitHubRepoParser.parseMultipleUrls(rawInput);
		if (parsedList.length === 0) {
			new Notice('⚠️ No valid GitHub repository URLs found in input.');
			return [];
		}

		const results: FetchResult[] = [];
		const total = parsedList.length;

		for (let i = 0; i < total; i++) {
			const item = parsedList[i];
			if (onProgress) {
				onProgress(i + 1, total, `${item.owner}/${item.repo}`);
			}

			const res = await this.fetchSingleRepo(item.owner, item.repo, destFolder);
			results.push(res);
		}

		const succeeded = results.filter((r) => r.success).length;
		const failed = results.filter((r) => !r.success).length;

		new Notice(`✅ GitHub Library: Fetched ${succeeded} repo${succeeded === 1 ? '' : 's'}${failed > 0 ? `, ${failed} failed` : ''}!`);

		return results;
	}
}
