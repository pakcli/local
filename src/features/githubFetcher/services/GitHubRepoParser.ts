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

	/**
	 * Parses existing note markdown content into frontmatter key-value pairs and body
	 */
	static parseFrontmatterAndBody(content: string): { frontmatter: Record<string, any>; rawFrontmatter: string; body: string } {
		const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n([\s\S]*))?$/);
		if (!match) {
			return { frontmatter: {}, rawFrontmatter: '', body: content };
		}

		const rawFm = match[1] || '';
		const body = match[2] || '';
		const parsed: Record<string, any> = {};

		const lines = rawFm.split(/\r?\n/);
		let currentKey = '';
		let currentArray: string[] | null = null;

		for (const line of lines) {
			const trimmed = line.trim();
			if (!trimmed || trimmed.startsWith('#')) continue;

			// Check list item
			if (trimmed.startsWith('- ') && currentKey) {
				const val = trimmed.slice(2).trim().replace(/^["']|["']$/g, '');
				if (!currentArray) {
					currentArray = [];
					parsed[currentKey] = currentArray;
				}
				currentArray.push(val);
				continue;
			}

			// Key-value pair
			const colonIdx = line.indexOf(':');
			if (colonIdx !== -1) {
				currentKey = line.slice(0, colonIdx).trim();
				const rawVal = line.slice(colonIdx + 1).trim();
				currentArray = null;

				if (!rawVal) {
					parsed[currentKey] = '';
				} else if (rawVal.startsWith('[') && rawVal.endsWith(']')) {
					// Inline array e.g. ["a", "b"]
					const items = rawVal
						.slice(1, -1)
						.split(',')
						.map((s) => s.trim().replace(/^["']|["']$/g, ''))
						.filter(Boolean);
					parsed[currentKey] = items;
				} else {
					parsed[currentKey] = rawVal.replace(/^["']|["']$/g, '');
				}
			}
		}

		return { frontmatter: parsed, rawFrontmatter: rawFm, body: body.trim() };
	}

	/**
	 * Compares existing note content with newly fetched metadata.
	 * Returns isIdentical boolean and diff fields list.
	 */
	static compareMetadata(
		existingContent: string,
		newMeta: GitHubRepoMetadata
	): { isIdentical: boolean; diffFields: Array<{ key: string; label: string; oldValue: any; newValue: any; oldDisplay: string; newDisplay: string; choice: 'old' | 'new' }> } {
		const { frontmatter: oldFm, body: oldBody } = this.parseFrontmatterAndBody(existingContent);
		const diffFields: Array<{ key: string; label: string; oldValue: any; newValue: any; oldDisplay: string; newDisplay: string; choice: 'old' | 'new' }> = [];

		const checkField = (key: string, label: string, oldVal: any, newVal: any, formatFn?: (v: any) => string) => {
			const strOld = formatFn ? formatFn(oldVal) : String(oldVal ?? '').trim();
			const strNew = formatFn ? formatFn(newVal) : String(newVal ?? '').trim();

			if (strOld !== strNew) {
				diffFields.push({
					key,
					label,
					oldValue: oldVal,
					newValue: newVal,
					oldDisplay: strOld || '(empty)',
					newDisplay: strNew || '(empty)',
					choice: 'new' // default to new
				});
			}
		};

		checkField('name', 'Name / Title', oldFm.name, newMeta.name);
		checkField('repo_url', 'Repository URL', oldFm.repo_url, newMeta.repo_url);
		checkField('demo_url', 'Demo / Preview URL', oldFm.demo_url, newMeta.demo_url);
		checkField('overview', 'Overview', oldFm.overview, newMeta.overview);

		checkField('compatibility', 'Compatibility', oldFm.compatibility, newMeta.compatibility, (v) => {
			if (!v) return '';
			if (Array.isArray(v)) {
				return v.map((item) => (typeof item === 'string' ? item : `${item.os || ''}: ${(item.versions || []).join(',')}`)).join(' | ');
			}
			return String(v);
		});

		checkField('language', 'Language', oldFm.language, newMeta.language, (v) => {
			if (Array.isArray(v)) return v.join(', ');
			return String(v || '');
		});

		checkField('latest_release', 'Latest Release Version', oldFm.latest_release || (oldFm['latest_release.version'] ?? ''), newMeta.latest_release?.version || 'null', (v) => {
			if (!v) return 'null';
			if (typeof v === 'object' && v.version) return v.version;
			return String(v);
		});

		checkField('license', 'License', oldFm.license, newMeta.license);

		// Notice: fetch_date and fetch_time are ignored for functional equivalence
		const isReadmeIdentical = (oldBody.replace(/\r/g, '').trim() === (newMeta.readme || '').replace(/\r/g, '').trim()) || (!oldBody && !newMeta.readme);
		const isIdentical = diffFields.length === 0 && isReadmeIdentical;

		return { isIdentical, diffFields };
	}

	/**
	 * Serializes metadata with resolved diff fields
	 */
	static serializeWithResolved(
		newMeta: GitHubRepoMetadata,
		resolvedFields: Record<string, any>,
		existingBody?: string,
		useOldBody?: boolean
	): string {
		const meta: GitHubRepoMetadata = { ...newMeta };

		if (resolvedFields['name'] !== undefined) meta.name = resolvedFields['name'];
		if (resolvedFields['repo_url'] !== undefined) meta.repo_url = resolvedFields['repo_url'];
		if (resolvedFields['demo_url'] !== undefined) meta.demo_url = resolvedFields['demo_url'];
		if (resolvedFields['overview'] !== undefined) meta.overview = resolvedFields['overview'];
		if (resolvedFields['license'] !== undefined) meta.license = resolvedFields['license'];

		if (resolvedFields['compatibility'] !== undefined && typeof resolvedFields['compatibility'] !== 'string') {
			meta.compatibility = resolvedFields['compatibility'];
		}
		if (resolvedFields['language'] !== undefined) {
			meta.language = Array.isArray(resolvedFields['language']) ? resolvedFields['language'] : [String(resolvedFields['language'])];
		}
		if (resolvedFields['latest_release'] !== undefined && resolvedFields['latest_release'] !== 'null') {
			if (typeof resolvedFields['latest_release'] === 'object') {
				meta.latest_release = resolvedFields['latest_release'];
			}
		}

		if (useOldBody && existingBody !== undefined) {
			meta.readme = existingBody;
		}

		return this.serializeToMarkdown(meta, meta.overview);
	}
}
