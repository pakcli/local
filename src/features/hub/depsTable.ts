import { App, Notice } from "obsidian";
import { getNodeChildProcess, getNodeOs, getNodeFs } from "../../utils/nodeHelpers";
import { detectPsExe, runPsCommand } from "./psRunner";
import { ConsentModal } from "./consentModal";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface DepResult {
  name: string;
  status: "ok" | "warning" | "error" | "checking";
  version: string;
  installDir: string;
  checkedAt: string; // ISO string
  durationMs: number;
  installCmd: string;
  uninstallCmd: string;
  hint: string;
}

export interface DepsRenderContext {
  app: App;                    // needed for ConsentModal
  bypassConsentGiven: boolean; // if true, skip the consent modal
  onConsentGiven: () => void;  // callback when user checks "never ask again"
}

export interface OsInfo {
  platform: string;
  arch: string;
  release: string;
  hostname: string;
  label: string; // human-readable e.g. "Windows 11 (x64)"
}

export interface DepDefinition {
  name: string;
  cmd: string;
  versionArg: string;
  whichCmd: (isWin: boolean) => string;
  fallbackPaths?: string[];
  installCmd: string;
  uninstallCmd: string;
  hint: string;
}

// ─── Dependency Definitions ──────────────────────────────────────────────────

export const DEP_DEFINITIONS: DepDefinition[] = [
  {
    name: "PowerShell",
    cmd: "powershell",
    versionArg: "-NoProfile -Command $PSVersionTable.PSVersion.ToString()",
    whichCmd: (isWin: boolean) => (isWin ? "where.exe powershell" : "which pwsh"),
    fallbackPaths: [
      "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
      "C:\\Program Files\\PowerShell\\7\\pwsh.exe",
      "C:\\Program Files (x86)\\PowerShell\\7\\pwsh.exe",
      "C:\\Windows\\SysWOW64\\WindowsPowerShell\\v1.0\\powershell.exe",
    ],
    installCmd: "winget install Microsoft.PowerShell",
    uninstallCmd: "# Built-in (Windows PowerShell) or winget uninstall Microsoft.PowerShell",
    hint: "Windows PowerShell 5.1+ or PowerShell Core 7+ (automation engine)",
  },
  {
    name: "yt-dlp",
    cmd: "yt-dlp",
    versionArg: "--version",
    whichCmd: (isWin: boolean) => (isWin ? "where.exe yt-dlp" : "which yt-dlp"),
    fallbackPaths: [
      "C:\\yt-dlp\\yt-dlp.exe",
    ],
    installCmd: "winget install yt-dlp.yt-dlp",
    uninstallCmd: "winget uninstall yt-dlp.yt-dlp",
    hint: "Media downloader binary for YTD feature",
  },
  {
    name: "ffmpeg",
    cmd: "ffmpeg",
    versionArg: "-version",
    whichCmd: (isWin: boolean) => (isWin ? "where.exe ffmpeg" : "which ffmpeg"),
    fallbackPaths: [
      "C:\\ffmpeg\\bin\\ffmpeg.exe",
      "C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe",
    ],
    installCmd: "winget install Gyan.FFmpeg",
    uninstallCmd: "winget uninstall Gyan.FFmpeg",
    hint: "Required for media conversion by yt-dlp",
  },
  {
    name: "Python 3",
    cmd: "python",
    versionArg: "--version",
    whichCmd: (isWin: boolean) => (isWin ? "where.exe python" : "which python3"),
    fallbackPaths: [
      "C:\\Python313\\python.exe",
      "C:\\Python312\\python.exe",
      "C:\\Python311\\python.exe",
      "C:\\Python310\\python.exe",
    ],
    installCmd: "winget install Python.Python.3",
    uninstallCmd: "winget uninstall Python.Python.3",
    hint: "Required for Antigravity CLI",
  },
  {
    name: "pip",
    cmd: "pip",
    versionArg: "--version",
    whichCmd: (isWin: boolean) => (isWin ? "where.exe pip" : "which pip"),
    installCmd: "python -m ensurepip --upgrade",
    uninstallCmd: "# Bundled with Python — remove Python instead",
    hint: "Python package installer",
  },
  {
    name: "Antigravity CLI (agy)",
    cmd: "agy",
    versionArg: "--version",
    whichCmd: (isWin: boolean) => (isWin ? "where.exe agy" : "which agy"),
    installCmd: "pip install antigravity",
    uninstallCmd: "pip uninstall antigravity",
    hint: "Required for PakCLI Agent — get from antigravity.google",
  },
  {
    name: "git",
    cmd: "git",
    versionArg: "--version",
    whichCmd: (isWin: boolean) => (isWin ? "where.exe git" : "which git"),
    fallbackPaths: [
      "C:\\Program Files\\Git\\cmd\\git.exe",
      "C:\\Program Files (x86)\\Git\\cmd\\git.exe",
    ],
    installCmd: "winget install Git.Git",
    uninstallCmd: "winget uninstall Git.Git",
    hint: "Version control — used by some plugin features",
  },
];

// ─── OS Detection ────────────────────────────────────────────────────────────

export function detectOs(): OsInfo {
  const nodeOs = getNodeOs();
  if (!nodeOs) {
    const nav = typeof navigator !== "undefined" ? navigator.platform : "Unknown";
    return {
      platform: nav,
      arch: "unknown",
      release: "unknown",
      hostname: "unknown",
      label: nav,
    };
  }

  const platform = nodeOs.platform() as string; // win32 | darwin | linux | ...
  const arch = nodeOs.arch() as string;
  const release = nodeOs.release() as string;
  const hostname = nodeOs.hostname() as string;

  let label = platform;
  if (platform === "win32") label = `Windows (${arch})`;
  else if (platform === "darwin") label = `macOS ${release} (${arch})`;
  else if (platform === "linux") label = `Linux ${release} (${arch})`;

  return { platform, arch, release, hostname, label };
}

// ─── Dependency Check ────────────────────────────────────────────────────────

function execAsync(cp: any, command: string, timeoutMs = 5000): Promise<string> {
  return new Promise((resolve, reject) => {
    cp.exec(command, { timeout: timeoutMs }, (error: any, stdout: string) => {
      if (error) reject(error);
      else resolve(stdout?.trim() || "");
    });
  });
}

/**
 * Multi-source checker for PowerShell:
 * Checks pwsh (Core 7+) -> powershell (Windows PowerShell 5.1+) -> direct filesystem paths.
 */
async function checkPowerShellDep(
  cp: any,
  def: DepDefinition,
  isWin: boolean,
  checkedAt: string,
  t0: number
): Promise<DepResult> {
  const fs = getNodeFs();

  // 1. Try pwsh in PATH (PowerShell Core 7+)
  try {
    const whichOut = await execAsync(cp, isWin ? "where.exe pwsh" : "which pwsh", 3000);
    const pwshPath = whichOut.split(/\r?\n/).filter(Boolean)[0]?.trim();
    if (pwshPath) {
      const verOut = await execAsync(cp, `pwsh -NoProfile -Command "$PSVersionTable.PSVersion.ToString()"`, 4000);
      const ver = verOut.split(/\r?\n/)[0]?.trim();
      return {
        name: def.name,
        status: "ok",
        version: `${ver || "Core 7+"} (PowerShell Core)`,
        installDir: pwshPath,
        checkedAt,
        durationMs: Date.now() - t0,
        installCmd: def.installCmd,
        uninstallCmd: "winget uninstall Microsoft.PowerShell",
        hint: def.hint,
      };
    }
  } catch {
    // Continue to next check
  }

  // 2. Try powershell in PATH (Windows PowerShell 5.1+)
  try {
    const whichOut = await execAsync(cp, isWin ? "where.exe powershell" : "which powershell", 3000);
    const winPsPath = whichOut.split(/\r?\n/).filter(Boolean)[0]?.trim();
    if (winPsPath) {
      const verOut = await execAsync(cp, `powershell -NoProfile -Command "$PSVersionTable.PSVersion.ToString()"`, 4000);
      const ver = verOut.split(/\r?\n/)[0]?.trim();
      return {
        name: def.name,
        status: "ok",
        version: `${ver || "5.1"} (Windows PowerShell)`,
        installDir: winPsPath,
        checkedAt,
        durationMs: Date.now() - t0,
        installCmd: def.installCmd,
        uninstallCmd: "# Built-in — cannot uninstall",
        hint: def.hint,
      };
    }
  } catch {
    // Continue to direct filesystem fallbacks
  }

  // 3. Fallback direct filesystem checks on Windows
  if (isWin && fs) {
    const candidatePaths = [
      "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
      "C:\\Program Files\\PowerShell\\7\\pwsh.exe",
      "C:\\Program Files (x86)\\PowerShell\\7\\pwsh.exe",
      "C:\\Windows\\SysWOW64\\WindowsPowerShell\\v1.0\\powershell.exe",
    ];

    try {
      const localApp = typeof process !== "undefined" ? process.env?.LOCALAPPDATA : undefined;
      if (localApp) {
        candidatePaths.push(`${localApp}\\Programs\\PowerShell\\7\\pwsh.exe`);
        candidatePaths.push(`${localApp}\\Microsoft\\WindowsApps\\pwsh.exe`);
      }
    } catch {
      // Ignore env lookup failure
    }

    for (const p of candidatePaths) {
      try {
        if (fs.existsSync(p)) {
          const isPwsh = p.toLowerCase().includes("pwsh");
          const verOut = await execAsync(cp, `"${p}" -NoProfile -Command "$PSVersionTable.PSVersion.ToString()"`, 4000);
          const ver = verOut.split(/\r?\n/)[0]?.trim();
          return {
            name: def.name,
            status: "ok",
            version: `${ver || (isPwsh ? "Core 7+" : "5.1")} (${isPwsh ? "PowerShell Core" : "Windows PowerShell"})`,
            installDir: p,
            checkedAt,
            durationMs: Date.now() - t0,
            installCmd: def.installCmd,
            uninstallCmd: isPwsh ? "winget uninstall Microsoft.PowerShell" : "# Built-in — cannot uninstall",
            hint: def.hint,
          };
        }
      } catch {
        // Try next candidate
      }
    }
  }

  // Not found in any source
  return {
    name: def.name,
    status: "error",
    version: "not found",
    installDir: "not installed",
    checkedAt,
    durationMs: Date.now() - t0,
    installCmd: def.installCmd,
    uninstallCmd: def.uninstallCmd,
    hint: def.hint,
  };
}

export async function checkSingleDep(
  def: DepDefinition,
  isWin: boolean
): Promise<DepResult> {
  const cp = getNodeChildProcess();
  const checkedAt = new Date().toISOString();
  const t0 = Date.now();

  if (!cp) {
    return {
      name: def.name,
      status: "error",
      version: "—",
      installDir: "—",
      checkedAt,
      durationMs: 0,
      installCmd: def.installCmd,
      uninstallCmd: def.uninstallCmd,
      hint: "child_process not available (desktop only)",
    };
  }

  // Special multi-source handler for PowerShell
  if (def.name.toLowerCase().includes("powershell")) {
    return checkPowerShellDep(cp, def, isWin, checkedAt, t0);
  }

  const fs = getNodeFs();

  try {
    // 1. Resolve install dir via which/where
    let installDir = "—";
    let binCmd = def.cmd;
    try {
      const whichOut = await execAsync(cp, def.whichCmd(isWin), 3000);
      const lines = whichOut.split(/\r?\n/).filter(Boolean);
      installDir = lines[0]?.trim() || "—";
      if (installDir !== "—") {
        binCmd = installDir.includes(" ") ? `"${installDir}"` : installDir;
      }
    } catch {
      installDir = "not found in PATH";
    }

    // 2. Fallback filesystem check on Windows if not found in PATH
    if (installDir === "not found in PATH" && isWin && fs && def.fallbackPaths) {
      for (const fb of def.fallbackPaths) {
        try {
          if (fs.existsSync(fb)) {
            installDir = fb;
            binCmd = fb.includes(" ") ? `"${fb}"` : fb;
            break;
          }
        } catch {
          // Continue
        }
      }
    }

    // 3. Get version
    const versionOut = await execAsync(cp, `${binCmd} ${def.versionArg}`, 4000);
    const versionLine = versionOut.split(/\r?\n/)[0];

    return {
      name: def.name,
      status: "ok",
      version: versionLine || "unknown",
      installDir: installDir === "not found in PATH" ? "PATH / custom" : installDir,
      checkedAt,
      durationMs: Date.now() - t0,
      installCmd: def.installCmd,
      uninstallCmd: def.uninstallCmd,
      hint: def.hint,
    };
  } catch {
    return {
      name: def.name,
      status: "error",
      version: "not found",
      installDir: "not installed",
      checkedAt,
      durationMs: Date.now() - t0,
      installCmd: def.installCmd,
      uninstallCmd: def.uninstallCmd,
      hint: def.hint,
    };
  }
}

export async function checkAllDeps(): Promise<DepResult[]> {
  const nodeOs = getNodeOs();
  const platform = nodeOs?.platform?.() || "unknown";
  const isWin = platform === "win32";

  const results = await Promise.all(
    DEP_DEFINITIONS.map((def) => checkSingleDep(def, isWin))
  );
  return results;
}

// ─── Export Formatters ───────────────────────────────────────────────────────

export function exportDepsTable(deps: DepResult[], format: "md" | "json" | "csv"): string {
  if (format === "json") {
    return JSON.stringify(deps, null, 2);
  }

  if (format === "csv") {
    const header = "Name,Status,Version,Install Dir,Checked At,Duration (ms),Install Cmd,Hint";
    const rows = deps.map((d) =>
      [
        `"${d.name}"`,
        d.status,
        `"${d.version}"`,
        `"${d.installDir}"`,
        d.checkedAt,
        String(d.durationMs),
        `"${d.installCmd}"`,
        `"${d.hint}"`,
      ].join(",")
    );
    return [header, ...rows].join("\n");
  }

  // Markdown table
  const header = "| Name | Status | Version | Install Dir | Checked At | Duration |";
  const sep = "|------|--------|---------|------------|------------|----------|";
  const rows = deps.map((d) => {
    const icon = d.status === "ok" ? "✅" : d.status === "warning" ? "⚠️" : "❌";
    return `| ${icon} ${d.name} | ${d.status} | ${d.version} | ${d.installDir} | ${d.checkedAt} | ${d.durationMs}ms |`;
  });
  return [header, sep, ...rows].join("\n");
}

// ─── UI Render: OS Badge ─────────────────────────────────────────────────────

export function renderOsBadge(
  container: HTMLElement,
  vaultPath?: string,
  pluginDir?: string
): void {
  const os = detectOs();
  const badge = container.createDiv({ cls: "pakcli-os-badge" });

  const now = new Date().toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const rows: Array<{ icon: string; label: string; value: string }> = [
    { icon: "🖥️", label: "OS", value: os.label },
    { icon: "🏠", label: "Hostname", value: os.hostname },
    { icon: "📂", label: "Vault root", value: vaultPath || "unknown" },
    { icon: "🔌", label: "Plugin dir", value: pluginDir || "unknown" },
    { icon: "🕐", label: "Last refresh", value: now },
  ];

  rows.forEach(({ icon, label, value }) => {
    const row = badge.createDiv({ cls: "pakcli-os-row" });
    row.createSpan({ cls: "pakcli-os-icon", text: icon });
    row.createSpan({ cls: "pakcli-os-label", text: label + ":" });
    const valEl = row.createSpan({ cls: "pakcli-os-value", text: value });

    // Copy on click for paths
    if (label.includes("root") || label.includes("dir")) {
      valEl.addClass("pakcli-os-copyable");
      valEl.title = "Click to copy";
      valEl.onclick = () => {
        navigator.clipboard.writeText(value).then(() => {
          new Notice(`📋 Copied: ${value}`);
        });
      };
    }
  });
}

// ─── UI Render: Deps Table ───────────────────────────────────────────────────

export function renderDepsTable(
  container: HTMLElement,
  deps: DepResult[],
  onRefresh: () => void,
  ctx?: DepsRenderContext
): void {
  container.empty();

  // ── Top bar: export + re-check all ──
  const topBar = container.createDiv({ cls: "pakcli-deps-export-bar" });
  topBar.createSpan({ cls: "pakcli-deps-export-label", text: "Export:" });

  const mkExportBtn = (label: string, fmt: "md" | "json" | "csv") => {
    const btn = topBar.createEl("button", { cls: "pakcli-deps-export-btn", text: label });
    btn.onclick = () => {
      const text = exportDepsTable(deps, fmt);
      navigator.clipboard.writeText(text).then(() => {
        new Notice(`📋 Copied as ${fmt.toUpperCase()}!`);
      });
    };
  };
  mkExportBtn("📝 Markdown", "md");
  mkExportBtn("{ } JSON", "json");
  mkExportBtn("⊞ CSV", "csv");

  const reCheckAllBtn = topBar.createEl("button", {
    cls: "pakcli-deps-export-btn pakcli-deps-refresh-btn",
    text: "🔄 Re-check All",
  });
  reCheckAllBtn.onclick = onRefresh;

  // ── Table ──
  const tableWrap = container.createDiv({ cls: "pakcli-deps-table-wrap" });
  const table = tableWrap.createEl("table", { cls: "pakcli-deps-table" });

  // Head — 4 columns
  const thead = table.createEl("thead");
  const headRow = thead.createEl("tr");
  ["Dependency", "Version", "Install location", "Actions"].forEach((h) => {
    headRow.createEl("th", { text: h });
  });

  const tbody = table.createEl("tbody");
  const nodeOs = getNodeOs();
  const isWin = (nodeOs?.platform?.() || "unknown") === "win32";

  const iconMap: Record<string, string> = {
    ok: "✅",
    warning: "⚠️",
    error: "❌",
    checking: "⏳",
  };

  deps.forEach((dep, idx) => {
    const tr = tbody.createEl("tr", { cls: `pakcli-deps-row status-${dep.status}` });

    // ── Col 1: Dependency (Name + Hint) ──
    const tdName = tr.createEl("td", { cls: "pakcli-deps-td pakcli-deps-name-cell" });
    const nameWrap = tdName.createDiv({ cls: "pakcli-deps-name-wrap" });
    const badge = nameWrap.createSpan({
      cls: `pakcli-deps-status-dot status-${dep.status}`,
      text: iconMap[dep.status] || "❓",
    });
    badge.title = `Status: ${dep.status}`;
    const nameText = nameWrap.createSpan({ cls: "pakcli-deps-name-text", text: dep.name });

    if (dep.hint) {
      tdName.createDiv({ cls: "pakcli-deps-hint-sub", text: dep.hint });
    }

    // ── Col 2: Version ──
    const tdVer = tr.createEl("td", { cls: "pakcli-deps-td pakcli-deps-ver-cell" });
    tdVer.textContent = dep.status === "checking" ? "…" : dep.version || "—";

    // ── Col 3: Install location (with inline copy button) ──
    const tdLoc = tr.createEl("td", { cls: "pakcli-deps-td pakcli-deps-loc-cell" });
    const hasPath = dep.installDir && dep.installDir !== "—" && !dep.installDir.includes("not");

    if (hasPath) {
      const locWrap = tdLoc.createDiv({ cls: "pakcli-deps-loc-wrap" });
      locWrap.createSpan({ cls: "pakcli-deps-dir-text", text: dep.installDir, attr: { title: dep.installDir } });
      const copyBtn = locWrap.createEl("button", { cls: "pakcli-deps-copy-inline", text: "📋" });
      copyBtn.title = "Copy path";
      copyBtn.onclick = () => {
        navigator.clipboard.writeText(dep.installDir).then(() => {
          copyBtn.textContent = "✅";
          new Notice(`📋 Copied: ${dep.installDir}`);
          setTimeout(() => { copyBtn.textContent = "📋"; }, 1800);
        });
      };
    } else {
      tdLoc.createSpan({ cls: "pakcli-deps-na", text: dep.status === "checking" ? "checking…" : "not installed" });
    }

    // ── Col 4: Actions (Rescan | Install | Uninstall) ──
    const tdActions = tr.createEl("td", { cls: "pakcli-deps-td pakcli-deps-actions-cell" });
    const actWrap = tdActions.createDiv({ cls: "pakcli-deps-actions-wrap" });

    // — Rescan (this row only) —
    const rescanBtn = actWrap.createEl("button", {
      cls: "pakcli-deps-action-btn pakcli-deps-rescan-btn",
      text: "🔍",
      attr: { title: `Re-check ${dep.name}` },
    });
    rescanBtn.onclick = async () => {
      rescanBtn.disabled = true;
      rescanBtn.textContent = "⏳";
      badge.textContent = "⏳";
      badge.className = `pakcli-deps-status-dot status-checking`;
      tr.className = "pakcli-deps-row status-checking";
      tdVer.textContent = "…";

      const def = DEP_DEFINITIONS.find(d => d.name === dep.name) ||
                  DEP_DEFINITIONS.find(d => dep.name.toLowerCase().includes("powershell") && d.name.toLowerCase().includes("powershell"));
      const fresh = def
        ? await checkSingleDep(def, isWin)
        : { ...dep, status: "error" as const, version: "—", installDir: "—", checkedAt: new Date().toISOString(), durationMs: 0 };

      deps[idx] = fresh;

      // Update row in-place
      nameText.textContent = fresh.name;
      badge.textContent = iconMap[fresh.status] || "❓";
      badge.className = `pakcli-deps-status-dot status-${fresh.status}`;
      tr.className = `pakcli-deps-row status-${fresh.status}`;
      tdVer.textContent = fresh.version || "—";

      // Update location cell
      tdLoc.empty();
      const freshHasPath = fresh.installDir && fresh.installDir !== "—" && !fresh.installDir.includes("not");
      if (freshHasPath) {
        const locWrap2 = tdLoc.createDiv({ cls: "pakcli-deps-loc-wrap" });
        locWrap2.createSpan({ cls: "pakcli-deps-dir-text", text: fresh.installDir, attr: { title: fresh.installDir } });
        const copyBtn2 = locWrap2.createEl("button", { cls: "pakcli-deps-copy-inline", text: "📋" });
        copyBtn2.title = "Copy path";
        copyBtn2.onclick = () => {
          navigator.clipboard.writeText(fresh.installDir).then(() => {
            copyBtn2.textContent = "✅";
            setTimeout(() => { copyBtn2.textContent = "📋"; }, 1800);
          });
        };
      } else {
        tdLoc.createSpan({ cls: "pakcli-deps-na", text: "not installed" });
      }

      rescanBtn.disabled = false;
      rescanBtn.textContent = "🔍";
    };

    // — Install —
    const isWindowsPs = dep.name.toLowerCase().includes("powershell") && dep.version.toLowerCase().includes("windows");
    const installLabel = isWindowsPs ? "⬆️ Install PS7" : "⬇️ Install";
    const installBtn = actWrap.createEl("button", {
      cls: "pakcli-deps-action-btn pakcli-deps-install-btn",
      text: installLabel,
      attr: { title: isWindowsPs ? "Upgrade to PowerShell Core 7+: winget install Microsoft.PowerShell" : dep.installCmd },
    });
    installBtn.onclick = async () => {
      if (ctx) {
        const psExe = detectPsExe();
        if (!psExe) {
          new Notice("❌ PowerShell not found.\nInstall it first via the Dependencies tab (MS Store or manual download).", 6000);
          return;
        }
        if (!ctx.bypassConsentGiven) {
          const consent = await ConsentModal.ask(ctx.app, psExe, dep.installCmd);
          if (!consent.confirmed) return;
          if (consent.neverAskAgain) ctx.onConsentGiven();
        }
        installBtn.disabled = true;
        installBtn.textContent = "⏳ Installing…";
        const result = await runPsCommand(dep.installCmd, psExe);
        if (result.success) {
          installBtn.textContent = "✅ Done!";
          new Notice(`✅ Installed ${dep.name} successfully!\n\nClick 🔍 to rescan this row.`, 6000);
          setTimeout(() => { installBtn.disabled = false; installBtn.textContent = installLabel; }, 4000);
        } else {
          installBtn.disabled = false;
          installBtn.textContent = "❌ Failed";
          new Notice(`❌ Install failed for ${dep.name}:\n\n${result.stderr || "Unknown error"}`, 8000);
          setTimeout(() => { installBtn.textContent = installLabel; }, 3000);
        }
      } else {
        navigator.clipboard.writeText(dep.installCmd).then(() => {
          new Notice(`📋 Copied install command:\n${dep.installCmd}`);
        });
      }
    };

    // — Uninstall —
    const isBuiltIn = dep.uninstallCmd.startsWith("#");
    const uninstallBtn = actWrap.createEl("button", {
      cls: "pakcli-deps-action-btn pakcli-deps-uninstall-btn",
      text: "🗑️",
      attr: { title: isBuiltIn ? "Built-in system component (cannot uninstall)" : `Remove ${dep.name} — ${dep.uninstallCmd}` },
    });

    if (isBuiltIn) {
      uninstallBtn.disabled = true;
      uninstallBtn.style.opacity = "0.35";
      uninstallBtn.style.cursor = "not-allowed";
    } else {
      uninstallBtn.onclick = async () => {
        if (ctx) {
          const psExe = detectPsExe();
          if (!psExe) {
            new Notice("❌ PowerShell not found. Cannot run uninstall.", 5000);
            return;
          }
          if (!ctx.bypassConsentGiven) {
            const consent = await ConsentModal.ask(ctx.app, psExe, dep.uninstallCmd);
            if (!consent.confirmed) return;
            if (consent.neverAskAgain) ctx.onConsentGiven();
          }
          uninstallBtn.disabled = true;
          uninstallBtn.textContent = "⏳";
          const result = await runPsCommand(dep.uninstallCmd, psExe);
          if (result.success) {
            uninstallBtn.textContent = "✅";
            new Notice(`✅ Removed ${dep.name}.\n\nClick 🔍 to rescan this row.`, 5000);
            setTimeout(() => { uninstallBtn.disabled = false; uninstallBtn.textContent = "🗑️"; }, 4000);
          } else {
            uninstallBtn.disabled = false;
            uninstallBtn.textContent = "❌";
            new Notice(`❌ Uninstall failed:\n\n${result.stderr || "Unknown error"}`, 7000);
            setTimeout(() => { uninstallBtn.textContent = "🗑️"; }, 3000);
          }
        } else {
          navigator.clipboard.writeText(dep.uninstallCmd).then(() => {
            new Notice(`📋 Copied uninstall command:\n${dep.uninstallCmd}`);
          });
        }
      };
    }
  });
}
