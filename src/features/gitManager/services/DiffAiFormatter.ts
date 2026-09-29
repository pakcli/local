import { Notice } from 'obsidian';
import { GitCliService } from './GitCliService';

export class DiffAiFormatter {
  /**
   * Builds an AI-optimized markdown document containing the unified diff
   */
  static formatAiDiff(
    repoName: string,
    repoPath: string,
    branch: string,
    rawDiff: string,
    contextNote?: string
  ): string {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const ts = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;

    let out = `=== Git Diff Export ===\n`;
    out += `Repo    : ${repoName}\n`;
    out += `Branch  : ${branch}\n`;
    out += `Path    : ${repoPath}\n`;
    out += `Exported: ${ts}\n`;
    if (contextNote) {
      out += `Context : ${contextNote}\n`;
    }
    out += `========================\n\n`;
    out += `\`\`\`diff\n`;
    out += rawDiff.trim() ? rawDiff : '# No changes detected (clean working tree)\n';
    out += `\n\`\`\`\n\n`;
    out += `========================\n`;

    return out;
  }

  /**
   * Fetches the current working diff for the repo, formats for AI, and copies to clipboard
   */
  static async exportWorkingDiffToClipboard(
    repoName: string,
    repoPath: string,
    branch: string
  ): Promise<void> {
    try {
      const rawDiff = await GitCliService.getFullWorkingDiff(repoPath);
      const text = this.formatAiDiff(repoName, repoPath, branch, rawDiff);
      await navigator.clipboard.writeText(text);

      const lines = rawDiff.split(/\r?\n/).filter(Boolean).length;
      new Notice(`📋 Copied Git Diff for AI (${lines} lines) to clipboard!`);
    } catch (err) {
      console.error('[DiffAiFormatter] Clipboard export failed:', err);
      new Notice(`❌ Failed to copy diff: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * Formats a raw patch or snapshot diff and copies to clipboard
   */
  static async copyTextToClipboard(text: string, successNotice = '📋 Copied to clipboard!'): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      new Notice(successNotice);
    } catch (err) {
      new Notice(`❌ Failed to copy: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
