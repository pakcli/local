export interface GitHubAssetItem {
	file: string;
	size: string;
	rawBytes?: number;
}

export interface GitHubReleaseInfo {
	version: string;
	published_at: string;
	assets: GitHubAssetItem[];
}

export interface GitHubCompatibilityItem {
	os: string;
	versions?: string[];
}

export interface GitHubRepoMetadata {
	name: string;
	owner: string;
	repo: string;
	repo_url: string;
	demo_url: string;
	overview: string;
	compatibility: GitHubCompatibilityItem[];
	language: string[];
	latest_release: GitHubReleaseInfo | null;
	license: string;
	fetch_date: string;
	fetch_time: string;
	readme: string;
}

export interface GitHubFetcherSettings {
	githubLibraryFolder: string;
	githubUseCli: boolean;
	githubOverwriteOverview: boolean;
}

export const DEFAULT_GITHUB_FETCHER_SETTINGS: GitHubFetcherSettings = {
	githubLibraryFolder: 'Digital Library/Github Repository',
	githubUseCli: true,
	githubOverwriteOverview: false,
};

export interface FetchResult {
	url: string;
	success: boolean;
	filePath?: string;
	error?: string;
	repoName?: string;
	skipped?: boolean;
	hasDiff?: boolean;
}

export type DiffChoice = 'old' | 'new';

export interface DiffField {
	key: string;
	label: string;
	oldValue: any;
	newValue: any;
	oldDisplay: string;
	newDisplay: string;
	choice: DiffChoice;
}

export interface DiffResolution {
	action: 'apply' | 'cancel' | 'skip';
	resolvedFields: Record<string, any>;
	useOldBody?: boolean;
}
