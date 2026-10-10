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
	 * Fetches a single repository, skips identical data, and triggers diff modal if frontmatter differs
	 */
	public async fetchSingleRepo(
		owner: string,
		repo: string,
		destFolder?: string,
		onConflictPrompt?: (
			repoName: string,
			diffFields: any[],
			hasBodyDiff: boolean
		) => Promise<any>
	): Promise<FetchResult> {
		const targetFolder = destFolder || this.settings.githubLibraryFolder || 'Digital Library/Github Repository';
		const targetFileName = `${repo}.md`;
		const targetPath = normalizePath(`${targetFolder}/${targetFileName}`);

		try {
			await this.ensureTargetFolder(targetFolder);

			const meta = await GitHubCliService.fetchRepo(owner, repo, this.settings.githubUseCli);

			const existingFile = this.app.vault.getAbstractFileByPath(targetPath);
			if (existingFile instanceof TFile) {
				const existingContent = await this.app.vault.read(existingFile);
				const { isIdentical, diffFields } = GitHubRepoParser.compareMetadata(existingContent, meta);

				// 1. Skip completely if identical data
				if (isIdentical) {
					return {
						url: `https://github.com/${owner}/${repo}`,
						success: true,
						filePath: targetPath,
						repoName: repo,
						skipped: true
					};
				}

				// 2. If frontmatter or data differs, check if interactive prompt callback is provided
				if (diffFields.length > 0 && onConflictPrompt) {
					const hasBodyDiff = (existingContent.replace(/\r/g, '').trim() !== (meta.readme || '').replace(/\r/g, '').trim());
					const resolution = await onConflictPrompt(repo, diffFields, hasBodyDiff);

					if (resolution.action === 'cancel' || resolution.action === 'skip') {
						return {
							url: `https://github.com/${owner}/${repo}`,
							success: true,
							filePath: targetPath,
							repoName: repo,
							skipped: true,
							hasDiff: true
						};
					}

					// Serialize with user selected fields
					const { body: oldBody } = GitHubRepoParser.parseFrontmatterAndBody(existingContent);
					const mergedContent = GitHubRepoParser.serializeWithResolved(
						meta,
						resolution.resolvedFields,
						oldBody,
						resolution.useOldBody
					);
					await this.app.vault.modify(existingFile, mergedContent);

					return {
						url: `https://github.com/${owner}/${repo}`,
						success: true,
						filePath: targetPath,
						repoName: repo,
						hasDiff: true
					};
				}

				// Fallback if no prompt: update preserving overview
				let existingOverview = GitHubRepoParser.extractExistingOverview(existingContent);
				const markdownContent = GitHubRepoParser.serializeToMarkdown(meta, existingOverview);
				await this.app.vault.modify(existingFile, markdownContent);
			} else {
				// Brand new file
				const markdownContent = GitHubRepoParser.serializeToMarkdown(meta);
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
	 * Fetches multiple repositories in sequence with live progress, skip identical, and cancellation support
	 */
	public async fetchBatchRepos(
		rawInput: string,
		destFolder?: string,
		onProgress?: (current: number, total: number, repoName: string) => void,
		onConflictPrompt?: (
			repoName: string,
			diffFields: any[],
			hasBodyDiff: boolean
		) => Promise<any>,
		isCancelled?: () => boolean
	): Promise<FetchResult[]> {
		const parsedList = GitHubRepoParser.parseMultipleUrls(rawInput);
		if (parsedList.length === 0) {
			new Notice('⚠️ No valid GitHub repository URLs found in input.');
			return [];
		}

		const results: FetchResult[] = [];
		const total = parsedList.length;

		for (let i = 0; i < total; i++) {
			if (isCancelled && isCancelled()) {
				new Notice('🛑 Batch fetch cancelled by user.');
				break;
			}

			const item = parsedList[i];
			if (onProgress) {
				onProgress(i + 1, total, `${item.owner}/${item.repo}`);
			}

			const res = await this.fetchSingleRepo(item.owner, item.repo, destFolder, onConflictPrompt);
			results.push(res);
		}

		const succeeded = results.filter((r) => r.success).length;
		const failed = results.filter((r) => !r.success).length;

		new Notice(`✅ GitHub Library: Fetched ${succeeded} repo${succeeded === 1 ? '' : 's'}${failed > 0 ? `, ${failed} failed` : ''}!`);

		return results;
	}
}
