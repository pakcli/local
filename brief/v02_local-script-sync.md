Developer Brief: Two-Way Synchronization Engine (pakcli-local)
Feature: Bidirectional Sync between Vault Markdown Codeblocks and Standalone Script Files (.ps1, .sh, .bat, .py)
Target Plugin: pakcli-local (Module: ScriptSync Engine / CodeblockSync)
Environment: Obsidian Desktop (Node.js fs, path, crypto, child_process)

1. Objective & Problem Statement
Currently, pakcli-local contains an early implementation of script synchronization (resolveCliPath, getSyncStatus, executeSync). However, it has key limitations:

Single / First Codeblock Blind Spot: It naively extracts only the very first codeblock using a basic regex (/^([ \t]*)({3,}|~{3,})...$/m`). Many notes contain metadata, explanation blocks, or output examples (e.g. diff ...) before or after the real script.
File Naming Friction: Long descriptive note titles (with spaces and Indonesian sentences) produce cumbersome script filenames on disk.
Echo / Re-entrancy Loop Risk: Modifying a file from disk triggers Obsidian's vault.on('modify'), which can trigger a reverse write back to disk.
2. Directory Architecture & Mapping Specification
2.1 1:1 Parallel Mirrored Directory Tree
The directory tree must mirror relative subpaths between the Note Source and Script Target:

Manager Directory (Vault): Digital Library/CLI & Commands/
CLI Target Directory (Disk): Scripts/ (or configured external directory)
Mapping Rule: 
Vault Path
:
Digital
 
Library/CLI
 
&
 
Commands/<SubCategory>/<NoteName>.md
Vault Path:Digital Library/CLI & Commands/<SubCategory>/<NoteName>.md 
⇓
⇓ 
Disk Path
:
Scripts/<SubCategory>/<Filename>.<ext>
Disk Path:Scripts/<SubCategory>/<Filename>.<ext>

2.2 Filename Resolution Strategy
Programmer must implement a 2-tier resolution for the output filename:

Tier 1 (Frontmatter Override): Check note YAML for cli_name: <custom-filename>.<ext>. If present, use this exact filename.
Tier 2 (Fallback): Use sanitized note basename + mapped extension:
Powershell/ note 
→
→ .ps1
Gitbash/ or Linux/ note 
→
→ .sh
Command Prompt/ note 
→
→ .bat
3. Codeblock Selection & Extraction Algorithm
3.1 Language-Filtered Codeblock Matching
Do NOT simply grab the first ``` found. The parser must find the target executable script block:

typescript


interface CodeBlockMatch {
  language: string;
  code: string;
  startIndex: number;
  endIndex: number;
  blockIndex: number; // 0-based index among candidate codeblocks
}
function extractTargetCodeblock(content: string, targetLangMap: Record<string, string>): CodeBlockMatch | null
Selection Priority:

Explicit Tag Match: If a block has language tagged with :sync (e.g. ```powershell:sync or ```bash:sync), prioritize this block immediately.
Frontmatter Target: If YAML specifies sync_codeblock: 2 (or 1), target that specific block index.
Recognized Script Language: Iterate all codeblocks in document order. Skip non-executable blocks (diff, text, asci, json, yaml, markdown). Pick the first codeblock whose language exists in languageExtensionMap.
4. Two-Way Sync Engine & Concurrency Control
4.1 Anti-Loop Mutex (Echo Suppression)
To prevent infinite ping-pong between node:fs.watch and app.vault.on('modify'):

typescript


class SyncLockManager {
  private activeLocks = new Set<string>(); // stores normalized file paths
  public isLocked(filePath: string): boolean {
    return this.activeLocks.has(normalizePath(filePath));
  }
  public async withLock<T>(filePath: string, action: () => Promise<T>): Promise<T> {
    const key = normalizePath(filePath);
    this.activeLocks.add(key);
    try {
      return await action();
    } finally {
      // Debounce release slightly (300ms) to outlive OS file event flush
      setTimeout(() => this.activeLocks.delete(key), 300);
    }
  }
}
4.2 Content Normalization & Hash Comparison
Windows CRLF (\r\n) and Unix LF (\n) will cause false positive diffs if compared directly.

Strip BOM.
Standardize line endings before hashing:
typescript


function computeNormalizedHash(content: string): string {
  const normalized = content.replace(/\r\n/g, '\n').trim();
  return crypto.createHash('sha256').update(normalized, 'utf8').digest('hex');
}
4.3 Directional Execution
Manager 
→
→ CLI (manager_to_cli):
Extract script code from .md.
Acquire lock on disk path.
Ensure target subdirectories exist (fs.mkdirSync(..., { recursive: true })).
Write raw code directly to disk (fs.writeFileSync(..., 'utf8')).
CLI 
→
→ Manager (cli_to_manager):
Read script file from disk.
Acquire lock on vault note path.
Replace the target code block's inner text while strictly preserving surrounding Markdown (frontmatter, explanations, other codeblocks).
Write updated markdown back via app.vault.modify().
5. UI / Settings Updates Needed in Plugin
Settings Tab (PluginSettingTab):
managerRootFolder: Default to Digital Library/CLI & Commands.
cliRootFolder: Default to Scripts (or absolute path if targeting an external folder).
autoWatchCliFolder: Toggle for active fs.watch.
syncStrategy: Dropdown ("Language Filtered First Block", "Explicit :sync Tag Only").
Status Modal / Dashboard (ie modal in pakcli-local):
Keep existing Diff view (ei()), but ensure line diffs ignore trailing \r.
Add a badge indicating which codeblock index was selected (e.g. [Block #1 (bash)]).
6. Acceptance Criteria for the Programmer
 No Loop: Editing .ps1 in VS Code updates the .md note in Obsidian without triggering a reverse write.
 No Overwrite of Non-Script Blocks: If a note contains an explanation codeblock or ```diff example, the sync engine only touches the actual script block.
 Preserves Markdown Integrity: When updating .md from disk, headings, tags, frontmatter, and notes outside the target codeblock remain 100% untouched.
 Subfolder Mirroring: A note inside Digital Library/CLI & Commands/Gitbash Current Directory/ exports to Scripts/Gitbash Current Directory/.
 Frontmatter cli_name Support: Specifying cli_name: my-script.ps1 in note frontmatter saves the file as my-script.ps1 instead of using the full note title. 