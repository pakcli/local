import { GitHubRepoMetadata } from '../types';

export class GitHubRepoParser {
	/**
	 * Extracts owner and repo name from various GitHub URL shapes:
	 * - https://github.com/owner/repo
	 * - https://github.com/owner/repo.git
	 * - https://github.com/owner/repo/releases/tag/v1.0
	 * - owner/repo
	 */
	static parseGitHubUrl(input: string): { owner: string; repo: string } | null {
		const trimmed = input.trim();
		if (!trimmed) return null;

		// Regex matching github.com/owner/repo
		const urlMatch = trimmed.match(/github\.com\/([^/\s]+)\/([^/#?\s]+)/i);
		if (urlMatch) {
			const owner = urlMatch[1];
			let repo = urlMatch[2];
			if (repo.endsWith('.git')) {
				repo = repo.slice(0, -4);
			}
			return { owner, repo };
		}

		// Direct shorthand: owner/repo
		const shortMatch = trimmed.match(/^([^/\s]+)\/([^/\s]+)$/);
		if (shortMatch) {
			return { owner: shortMatch[1], repo: shortMatch[2] };
		}

		return null;
	}

	/**
	 * Parses a multi-line string containing one or more URLs into unique owner/repo pairs
	 */
	static parseMultipleUrls(text: string): Array<{ owner: string; repo: string; rawInput: string }> {
		const lines = text.split(/\r?\n/);
		const seen = new Set<string>();
		const results: Array<{ owner: string; repo: string; rawInput: string }> = [];

		for (const line of lines) {
			const parsed = this.parseGitHubUrl(line);
			if (parsed) {
				const key = `${parsed.owner}/${parsed.repo}`.toLowerCase();
				if (!seen.has(key)) {
					seen.add(key);
					results.push({ ...parsed, rawInput: line.trim() });
				}
			}
		}

		return results;
	}

	/**
	 * Extract existing overview text from existing markdown note content
	 */
	static extractExistingOverview(existingContent: string): string {
		if (!existingContent) return '';

		// Try matching overview in frontmatter: overview: "..." or overview: ...
		const frontmatterMatch = existingContent.match(/^---\r?\n([\s\S]*?)\r?\n---/);
		if (frontmatterMatch) {
			const fmText = frontmatterMatch[1];
			const overviewMatch = fmText.match(/^overview:\s*["']?([\s\S]*?)["']?$/m);
			if (overviewMatch && overviewMatch[1].trim()) {
				return overviewMatch[1].trim();
			}
		}

		return '';
	}

	/**
	 * Serializes metadata object into YAML frontmatter and markdown body
	 */
	static serializeToMarkdown(meta: GitHubRepoMetadata, existingOverview?: string): string {
		const overviewVal = (existingOverview || meta.overview || '').trim();

		const lines: string[] = ['---'];
		lines.push(`name: "${meta.name.replace(/"/g, '\\"')}"`);
		lines.push(`repo_url: "${meta.repo_url}"`);
		lines.push(`demo_url: "${meta.demo_url || ''}"`);
		lines.push(`overview: "${overviewVal.replace(/"/g, '\\"')}"`);

		// Compatibility Section
		lines.push('compatibility:');
		if (meta.compatibility && meta.compatibility.length > 0) {
			for (const item of meta.compatibility) {
				if (item.versions && item.versions.length > 0) {
					lines.push(`  - ${item.os}: [${item.versions.map((v) => `"${v}"`).join(', ')}]`);
				} else {
					lines.push(`  - ${item.os}`);
				}
			}
		} else {
			lines.push('  - cross-platform');
		}

		// Language Section
		lines.push('language:');
		if (meta.language && meta.language.length > 0) {
			for (const lang of meta.language) {
				lines.push(`  - ${lang}`);
			}
		} else {
			lines.push('  - english');
		}

		// Latest Release Section (Group)
		if (meta.latest_release) {
			lines.push('latest_release:');
			lines.push(`  version: "${meta.latest_release.version}"`);
			lines.push(`  published_at: "${meta.latest_release.published_at}"`);
			lines.push('  assets:');
			if (meta.latest_release.assets && meta.latest_release.assets.length > 0) {
				for (const a of meta.latest_release.assets) {
					lines.push(`    - file: "${a.file.replace(/"/g, '\\"')}"`);
					lines.push(`      size: "${a.size}"`);
				}
			} else {
				lines.push('    []');
			}
		} else {
			lines.push('latest_release: null');
		}

		lines.push(`license: "${meta.license.replace(/"/g, '\\"')}"`);
		lines.push(`fetch_date: "${meta.fetch_date}"`);
		lines.push(`fetch_time: "${meta.fetch_time}"`);
		lines.push('---');
		lines.push('');
		lines.push('# README');
		lines.push('');

		if (meta.readme && meta.readme.trim()) {
			lines.push(meta.readme.trim());
		} else {
			lines.push('*(No README provided by this repository)*');
		}

		lines.push('');
		return lines.join('\n');
	}
}
