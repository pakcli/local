/**
 * markdownParser.ts
 *
 * Implements multi-codeblock extraction, selection algorithms, and precise
 * reverse-injection for Markdown notes, strictly preserving all surrounding markdown.
 */
import { getNodeCrypto } from '../../utils/nodeHelpers';
import { CodeBlockMatch, ScriptNoteFrontmatter, SyncStrategy } from './types';
export type { CodeBlockMatch };

export const NON_SCRIPT_LANGUAGES = new Set([
    'diff',
    'text',
    'txt',
    'ascii',
    'asci',
    'json',
    'yaml',
    'yml',
    'markdown',
    'md',
    'xml',
    'html',
    'css',
    'scss',
    'csv',
    'tsv',
    'output',
    'log'
]);

/**
 * Parses all fenced codeblocks (``` or ~~~) from markdown content.
 */
export function parseAllCodeBlocks(content: string): CodeBlockMatch[] {
    if (!content) return [];

    const regex = /^([ \t]*)(`{3,}|~{3,})([^\r\n]*)\r?\n([\s\S]*?)\r?\n\1\2[ \t]*$/gm;
    const matches: CodeBlockMatch[] = [];
    let match: RegExpExecArray | null;
    let blockIndex = 0;

    while ((match = regex.exec(content)) !== null) {
        const fullMatch = match[0];
        const startIndex = match.index;
        const endIndex = startIndex + fullMatch.length;
        const fence = match[2];
        const rawInfo = (match[3] || '').trim();
        const firstToken = rawInfo.split(/\s+/)[0] || '';

        let language = 'text';
        let tag: string | undefined = undefined;

        if (firstToken.includes(':')) {
            const parts = firstToken.split(':');
            language = (parts[0] || '').toLowerCase() || 'text';
            tag = (parts[1] || '').toLowerCase();
        } else {
            language = firstToken.toLowerCase() || 'text';
        }

        const code = match[4] || '';

        matches.push({
            language,
            tag,
            code,
            startIndex,
            endIndex,
            blockIndex: blockIndex++,
            header: fence + rawInfo
        });
    }

    return matches;
}

/**
 * Extracts target codeblock following priority rules:
 *   1. Explicit Tag Match (e.g. ```powershell:sync or ```bash:sync)
 *   2. Frontmatter Target (e.g. sync_codeblock: 2 - 1-based index)
 *   3. Recognized Script Language (first block matching executable script language in langMap)
 */
export function extractTargetCodeblock(
    content: string,
    langMap: Record<string, string>,
    frontmatter?: ScriptNoteFrontmatter,
    strategy: SyncStrategy = 'language_first'
): CodeBlockMatch | null {
    const allBlocks = parseAllCodeBlocks(content);
    if (allBlocks.length === 0) return null;

    // Strategy 1: Explicit tag only mode
    if (strategy === 'explicit_tag_only') {
        const taggedBlock = allBlocks.find(b => b.tag === 'sync');
        if (taggedBlock) {
            return { ...taggedBlock, matchedRule: 'explicit_tag' };
        }
        return null;
    }

    // Priority 1: Explicit :sync tag match in standard mode
    const taggedBlock = allBlocks.find(b => b.tag === 'sync');
    if (taggedBlock) {
        return { ...taggedBlock, matchedRule: 'explicit_tag' };
    }

    // Priority 2: Frontmatter sync_codeblock specified (1-based index)
    if (frontmatter && typeof frontmatter.sync_codeblock === 'number') {
        const targetIdx = Math.floor(frontmatter.sync_codeblock) - 1;
        if (targetIdx >= 0 && targetIdx < allBlocks.length) {
            const block = allBlocks[targetIdx];
            if (block) {
                return { ...block, matchedRule: 'frontmatter_index' };
            }
        }
    }

    // Priority 3: Recognized script language (skip non-executable diff, json, yaml, etc.)
    for (const block of allBlocks) {
        const normLang = block.language.toLowerCase();
        if (NON_SCRIPT_LANGUAGES.has(normLang)) {
            continue;
        }
        if (langMap[normLang] !== undefined) {
            return { ...block, matchedRule: 'language_filter' };
        }
    }

    // Fallback: If no recognized executable block found, pick first block with language in map
    for (const block of allBlocks) {
        if (langMap[block.language.toLowerCase()] !== undefined) {
            return { ...block, matchedRule: 'language_filter' };
        }
    }

    return null;
}

/**
 * Injects new script code into the target codeblock.
 * Strictly preserves all surrounding markdown, headings, frontmatter, and other blocks.
 */
export function injectTargetCodeblock(
    fullMarkdown: string,
    newCode: string,
    targetMatch: CodeBlockMatch | null,
    fallbackLanguage = 'powershell'
): string {
    if (targetMatch) {
        const before = fullMarkdown.slice(0, targetMatch.startIndex);
        const after = fullMarkdown.slice(targetMatch.endIndex);

        // Keep existing opening fence and tag info
        const header = targetMatch.header.trim() || `\`\`\`${fallbackLanguage}`;
        const fence = header.startsWith('~~~') ? '~~~' : '```';

        // Ensure clean newlines without carriage returns
        const cleanCode = newCode.replace(/\r\n/g, '\n');
        const replacement = `${header}\n${cleanCode}\n${fence}`;

        return `${before}${replacement}${after}`;
    }

    // If no existing block, append cleanly at bottom
    const cleanCode = newCode.replace(/\r\n/g, '\n');
    const trimmed = fullMarkdown.trimEnd();
    const prefix = trimmed.length > 0 ? `${trimmed}\n\n` : '';
    return `${prefix}\`\`\`${fallbackLanguage}\n${cleanCode}\n\`\`\`\n`;
}

/**
 * Computes SHA-256 hash after normalizing CRLF and stripping BOM.
 */
export function computeNormalizedHash(content: string): string {
    // 1. Strip UTF-8 BOM if present
    let normalized = (content || '').replace(/^\uFEFF/, '');
    // 2. Standardize CRLF to LF and trim trailing whitespace
    normalized = normalized.replace(/\r\n/g, '\n').trim();

    // 3. Compute SHA-256 hash using Node crypto
    const crypto = getNodeCrypto();
    if (crypto && typeof crypto.createHash === 'function') {
        return crypto.createHash('sha256').update(normalized, 'utf8').digest('hex');
    }

    // 4. Pure JS fallback hash (FNV-1a 32-bit hex)
    let hash = 2166136261;
    for (let i = 0; i < normalized.length; i++) {
        hash ^= normalized.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16);
}

/**
 * Backward compatibility: Extracts the first candidate script code block.
 */
export function extractFirstCodeBlock(content: string): CodeBlockMatch | null {
    const blocks = parseAllCodeBlocks(content);
    return blocks[0] || null;
}

/**
 * Backward compatibility: Injects new code into the first codeblock.
 */
export function injectFirstCodeBlock(fullMarkdown: string, newCode: string, language?: string): string {
    const first = extractFirstCodeBlock(fullMarkdown);
    return injectTargetCodeblock(fullMarkdown, newCode, first, language);
}
