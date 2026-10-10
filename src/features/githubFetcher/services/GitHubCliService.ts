import { requestUrl } from 'obsidian';
import { getNodeChildProcess } from '../../../utils/nodeHelpers';
import { GitHubRepoMetadata, GitHubAssetItem } from '../types';

export class GitHubCliService {
	private static isCliCached: boolean | null = null;

	/**
	 * Tests whether `gh` CLI is installed and accessible in the system PATH
	 */
	static async isGhCliAvailable(): Promise<boolean> {
		if (this.isCliCached !== null) {
			return this.isCliCached;
		}

		const cp = getNodeChildProcess();
		if (!cp) {
			this.isCliCached = false;
			return false;
		}

		return new Promise((resolve) => {
			cp.execFile('gh', ['--version'], { timeout: 4000, windowsHide: true }, (err: any) => {
				this.isCliCached = !err;
				resolve(!err);
			});
		});
	}

	/**
	 * Format byte count into human-readable representation
	 */
	static formatBytes(bytes: number): string {
		if (bytes === 0 || isNaN(bytes)) return '0 B';
		const k = 1024;
		const sizes = ['B', 'KB', 'MB', 'GB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
	}

	/**
	 * Detect operating system and version compatibility from assets, description, and keywords
	 */
	static detectCompatibility(
		assets: GitHubAssetItem[],
		description: string,
		readmeText: string
	): Array<{ os: string; versions?: string[] }> {
		const result: Map<string, Set<string>> = new Map();
		const combinedText = `${description} ${readmeText.slice(0, 4000)}`.toLowerCase();

		// Helper to register OS
		const addOs = (os: string, version?: string) => {
			if (!result.has(os)) {
				result.set(os, new Set());
			}
			if (version) {
				result.get(os)!.add(version);
			}
		};

		// 1. Check Asset Extensions
		for (const asset of assets) {
			const lower = asset.file.toLowerCase();
			if (lower.endsWith('.exe') || lower.endsWith('.msi') || lower.includes('win-') || lower.includes('windows')) {
				addOs('windows');
			}
			if (lower.endsWith('.dmg') || lower.endsWith('.pkg') || lower.includes('darwin') || lower.includes('mac-') || lower.includes('macos')) {
				addOs('macos');
			}
			if (lower.endsWith('.deb') || lower.endsWith('.rpm') || lower.endsWith('.appimage') || lower.endsWith('.tar.gz') || lower.includes('linux')) {
				addOs('linux');
			}
			if (lower.endsWith('.apk') || lower.includes('android')) {
				addOs('android');
			}
			if (lower.endsWith('.ipa') || lower.includes('ios')) {
				addOs('ios');
			}
		}

		// 2. Check Textual Mentions in Readme / Description
		if (combinedText.includes('windows 11') || combinedText.includes('win11')) {
			addOs('windows', 'windows 11');
		}
		if (combinedText.includes('windows 10') || combinedText.includes('win10')) {
			addOs('windows', 'windows 10');
		}
		if (combinedText.includes('windows xp') || combinedText.includes('winxp')) {
			addOs('windows', 'windows xp');
		}
		if (combinedText.includes('windows 7')) {
			addOs('windows', 'windows 7');
		}
		if (combinedText.includes('windows') && !result.has('windows')) {
			addOs('windows', 'windows 10');
			addOs('windows', 'windows 11');
		}

		if (combinedText.includes('macos') || combinedText.includes('osx') || combinedText.includes('mac os')) {
			addOs('macos');
		}
		if (combinedText.includes('linux') || combinedText.includes('ubuntu') || combinedText.includes('arch') || combinedText.includes('debian')) {
			addOs('linux');
		}
		if (combinedText.includes('android')) {
			addOs('android');
		}
		if (combinedText.includes('iphone') || combinedText.includes('ios')) {
			addOs('ios');
		}

		// Format output list
		const compatList: Array<{ os: string; versions?: string[] }> = [];
		for (const [os, versionsSet] of result.entries()) {
			const versions = Array.from(versionsSet);
			if (versions.length > 0) {
				compatList.push({ os, versions });
			} else {
				compatList.push({ os });
			}
		}

		// Default fallback if no OS detected
		if (compatList.length === 0) {
			compatList.push({ os: 'cross-platform' });
		}

		return compatList;
	}

	/**
	 * Fetches repository metadata and release using local GitHub CLI (`gh`)
	 */
	static async fetchViaCli(owner: string, repo: string): Promise<GitHubRepoMetadata> {
		const cp = getNodeChildProcess();
		if (!cp) throw new Error('child_process is unavailable.');

		const repoSlug = `${owner}/${repo}`;

		// 1. Fetch Repo Information
		const repoJsonStr = await new Promise<string>((resolve, reject) => {
			cp.execFile(
				'gh',
				['repo', 'view', repoSlug, '--json', 'name,owner,url,homepageUrl,description,licenseInfo,languages,defaultBranchRef'],
				{ timeout: 15000, windowsHide: true },
				(err: any, stdout: string) => {
					if (err) return reject(new Error(`Failed to fetch repo info via gh: ${err.message}`));
					resolve(stdout);
				}
			);
		});

		const repoData = JSON.parse(repoJsonStr);

		// 2. Fetch Latest Release Information (Graceful if no releases)
		let releaseData: any = null;
		try {
			const releaseJsonStr = await new Promise<string>((resolve, reject) => {
				cp.execFile(
					'gh',
					['release', 'view', '-R', repoSlug, '--json', 'tagName,publishedAt,assets'],
					{ timeout: 12000, windowsHide: true },
					(err: any, stdout: string) => {
						if (err) return resolve(''); // No release or pre-release only
						resolve(stdout);
					}
				);
			});
			if (releaseJsonStr.trim()) {
				releaseData = JSON.parse(releaseJsonStr);
			}
		} catch {
			releaseData = null;
		}

		// 3. Fetch Readme
		let readmeContent = '';
		try {
			readmeContent = await new Promise<string>((resolve) => {
				cp.execFile(
					'gh',
					['repo', 'view', repoSlug],
					{ maxBuffer: 1024 * 1024 * 4, timeout: 15000, windowsHide: true },
					(err: any, stdout: string) => {
						if (err) return resolve('');
						resolve(stdout || '');
					}
				);
			});
		} catch {
			readmeContent = '';
		}

		// Process parsed release assets
		const assets: GitHubAssetItem[] = [];
		if (releaseData?.assets && Array.isArray(releaseData.assets)) {
			for (const a of releaseData.assets) {
				assets.push({
					file: a.name || 'unnamed',
					size: this.formatBytes(a.size || 0),
					rawBytes: a.size || 0
				});
			}
		}

		const now = new Date();
		const fetch_date = now.toISOString().slice(0, 10);
		const fetch_time = now.toTimeString().slice(0, 8);

		const languages: string[] = [];
		if (repoData.languages && Array.isArray(repoData.languages)) {
			for (const l of repoData.languages) {
				if (l.node?.name) languages.push(l.node.name.toLowerCase());
			}
		}
		if (!languages.includes('english')) {
			languages.unshift('english');
		}

		const compatibility = this.detectCompatibility(assets, repoData.description || '', readmeContent);

		return {
			name: repoData.name || repo,
			owner: repoData.owner?.login || owner,
			repo: repoData.name || repo,
			repo_url: repoData.url || `https://github.com/${repoSlug}`,
			demo_url: repoData.homepageUrl || '',
			overview: '',
			compatibility,
			language: languages,
			latest_release: releaseData
				? {
						version: releaseData.tagName || 'latest',
						published_at: (releaseData.publishedAt || '').slice(0, 10),
						assets
				  }
				: null,
			license: repoData.licenseInfo?.name || repoData.licenseInfo?.key || 'None',
			fetch_date,
			fetch_time,
			readme: readmeContent.trim()
		};
	}

	/**
	 * Fallback method using Obsidian's native requestUrl (GitHub REST API)
	 */
	static async fetchViaRest(owner: string, repo: string): Promise<GitHubRepoMetadata> {
		const repoSlug = `${owner}/${repo}`;
		const headers = {
			'User-Agent': 'Obsidian-PakCLI-Local-Plugin',
			Accept: 'application/vnd.github.v3+json'
		};

		// 1. Fetch Repository Info
		const repoRes = await requestUrl({
			url: `https://api.github.com/repos/${repoSlug}`,
			headers
		});

		if (repoRes.status !== 200) {
			throw new Error(`GitHub API error (${repoRes.status}): ${repoRes.text}`);
		}

		const repoData = repoRes.json;

		// 2. Fetch Latest Release (Optional)
		let releaseData: any = null;
		try {
			const releaseRes = await requestUrl({
				url: `https://api.github.com/repos/${repoSlug}/releases/latest`,
				headers
			});
			if (releaseRes.status === 200) {
				releaseData = releaseRes.json;
			}
		} catch {
			releaseData = null;
		}

		// 3. Fetch Readme
		const defaultBranch = repoData.default_branch || 'main';
		let readmeContent = '';
		const readmeUrls = [
			`https://raw.githubusercontent.com/${repoSlug}/${defaultBranch}/README.md`,
			`https://raw.githubusercontent.com/${repoSlug}/${defaultBranch}/readme.md`,
			`https://raw.githubusercontent.com/${repoSlug}/master/README.md`
		];

		for (const u of readmeUrls) {
			try {
				const rRes = await requestUrl({ url: u });
				if (rRes.status === 200 && rRes.text) {
					readmeContent = rRes.text;
					break;
				}
			} catch {
				// Continue to next fallback branch
			}
		}

		// Process Assets
		const assets: GitHubAssetItem[] = [];
		if (releaseData?.assets && Array.isArray(releaseData.assets)) {
			for (const a of releaseData.assets) {
				assets.push({
					file: a.name || 'unnamed',
					size: this.formatBytes(a.size || 0),
					rawBytes: a.size || 0
				});
			}
		}

		const now = new Date();
		const fetch_date = now.toISOString().slice(0, 10);
		const fetch_time = now.toTimeString().slice(0, 8);

		const languages: string[] = [];
		if (repoData.language) {
			languages.push(repoData.language.toLowerCase());
		}
		if (!languages.includes('english')) {
			languages.unshift('english');
		}

		const compatibility = this.detectCompatibility(assets, repoData.description || '', readmeContent);

		return {
			name: repoData.name || repo,
			owner: repoData.owner?.login || owner,
			repo: repoData.name || repo,
			repo_url: repoData.html_url || `https://github.com/${repoSlug}`,
			demo_url: repoData.homepage || '',
			overview: '',
			compatibility,
			language: languages,
			latest_release: releaseData
				? {
						version: releaseData.tag_name || 'latest',
						published_at: (releaseData.published_at || '').slice(0, 10),
						assets
				  }
				: null,
			license: repoData.license?.name || repoData.license?.spdx_id || 'None',
			fetch_date,
			fetch_time,
			readme: readmeContent.trim()
		};
	}

	/**
	 * High-level fetcher: automatically prefers `gh` CLI if available, falls back to REST
	 */
	static async fetchRepo(owner: string, repo: string, preferCli: boolean = true): Promise<GitHubRepoMetadata> {
		if (preferCli && (await this.isGhCliAvailable())) {
			try {
				return await this.fetchViaCli(owner, repo);
			} catch (err) {
				console.warn('[PakCLI Local] CLI fetch failed, trying REST API fallback:', err);
				return await this.fetchViaRest(owner, repo);
			}
		}
		return await this.fetchViaRest(owner, repo);
	}
}
