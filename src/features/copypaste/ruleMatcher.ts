/**
 * ruleMatcher.ts
 *
 * Fast filtering engine for CopyPaste Manager Target Vault Rules.
 */
import { TargetFilterRule } from './types';
import { getNodeFs, PathUtils } from '../../utils/nodeHelpers';

export const DEFAULT_FORMAT_OPTIONS = [
    'md',
    'json',
    'csv',
    'js',
    'ts',
    'db',
    'docs',
    'docx',
    'txt',
    'ps1',
    'sh',
    'yaml',
    'yml'
];

/**
 * Checks whether a single file path matches the criteria of a TargetFilterRule.
 */
export function matchesRule(filePath: string, rule: TargetFilterRule): boolean {
    const normPath = filePath.replace(/\\/g, '/');
    const basename = PathUtils.basename(normPath);
    const ext = PathUtils.extname(normPath).replace(/^\./, '').toLowerCase();

    // 1. File Format Checklist Check
    if (rule.formats && rule.formats.length > 0) {
        const formatSet = new Set(
            rule.formats.map((f) => f.toLowerCase().replace(/^[\.,]+|[\.,]+$/g, ''))
        );
        // If docs is selected, also treat doc/docx as matching
        if (formatSet.has('docs') && (ext === 'doc' || ext === 'docx')) {
            // matches
        } else if (!formatSet.has(ext)) {
            return false;
        }
    }

    // 2. Target Path Include Check (matches directory path so filename does not bleed into path filter)
    if (rule.pathIncludeMode && rule.pathIncludeMode !== 'all') {
        const pattern = (rule.pathIncludePattern || '').trim().replace(/\\/g, '/');
        if (pattern) {
            const dirPath = PathUtils.dirname(normPath).replace(/\\/g, '/');
            const dirWithSlashes = '/' + dirPath.replace(/^\/+|\/+$/g, '') + '/';
            const patLower = pattern.toLowerCase();
            const dirLower = dirWithSlashes.toLowerCase();

            switch (rule.pathIncludeMode) {
                case 'contains':
                    if (
                        !dirLower.includes(patLower) &&
                        !dirPath.toLowerCase().includes(patLower) &&
                        !normPath.toLowerCase().includes(patLower)
                    ) {
                        return false;
                    }
                    break;
                case 'exact':
                    if (dirPath.toLowerCase() !== patLower && normPath.toLowerCase() !== patLower) {
                        return false;
                    }
                    break;
                case 'exact_case':
                    if (!dirWithSlashes.includes(pattern) && !dirPath.includes(pattern) && !normPath.includes(pattern)) {
                        return false;
                    }
                    break;
            }
        }
    }

    // 3. Filename Check
    if (rule.filenameMode && rule.filenameMode !== 'all') {
        const pattern = (rule.filenamePattern || '').trim();
        if (pattern) {
            switch (rule.filenameMode) {
                case 'contains':
                    if (!basename.toLowerCase().includes(pattern.toLowerCase())) return false;
                    break;
                case 'exact':
                    if (basename.toLowerCase() !== pattern.toLowerCase()) return false;
                    break;
                case 'exact_case':
                    if (!basename.includes(pattern)) return false;
                    break;
            }
        }
    }

    return true;
}

const IGNORED_DIRS = new Set(['.git', 'node_modules', '.obsidian', '.trash', 'dist']);

/**
 * Recursively scans rule.targetPath on the local filesystem and filters files matching the rule.
 */
export async function scanDirectoryForRule(rule: TargetFilterRule): Promise<string[]> {
    const fs = getNodeFs();
    if (!fs) return [];

    const root = (rule.targetPath || '').trim();
    if (!root || !fs.existsSync(root)) return [];

    const stat = await fs.promises.stat(root).catch(() => null);
    if (!stat) return [];

    // If targetPath is a single file
    if (!stat.isDirectory()) {
        return matchesRule(root, rule) ? [root] : [];
    }

    const matchedFiles: string[] = [];

    async function walk(dir: string): Promise<void> {
        let entries: any[] = [];
        try {
            entries = await fs.promises.readdir(dir, { withFileTypes: true });
        } catch {
            return;
        }

        for (const entry of entries) {
            const fullPath = PathUtils.join(dir, entry.name);
            if (entry.isDirectory()) {
                if (!IGNORED_DIRS.has(entry.name)) {
                    await walk(fullPath);
                }
            } else if (entry.isFile()) {
                if (matchesRule(fullPath, rule)) {
                    matchedFiles.push(fullPath);
                }
            }
        }
    }

    await walk(root);
    return matchedFiles;
}
