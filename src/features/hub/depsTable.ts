import { Notice } from "obsidian";
import { getNodeChildProcess, getNodeOs } from "../../utils/nodeHelpers";

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

export interface OsInfo {
  platform: string;
  arch: string;
  release: string;
  hostname: string;
  label: string; // human-readable e.g. "Windows 11 (x64)"
}

// ─── Dependency Definitions ──────────────────────────────────────────────────

export const DEP_DEFINITIONS = [
  {
    name: "PowerShell (pwsh)",
    cmd: "pwsh",
    versionArg: "--version",
    whichCmd: (isWin: boolean) => (isWin ? "where.exe pwsh" : "which pwsh"),
    installCmd: "winget install Microsoft.PowerShell",
    uninstallCmd: "winget uninstall Microsoft.PowerShell",
    hint: "Install PowerShell Core from Microsoft",
  },
  {
    name: "Windows PowerShell",
    cmd: "powershell",
    versionArg: "-NoProfile -Command $PSVersionTable.PSVersion.ToString()",
    whichCmd: (isWin: boolean) => (isWin ? "where.exe powershell" : "which powershell"),
    installCmd: "# Built-in on Windows",
    uninstallCmd: "# Built-in — cannot uninstall",
    hint: "Pre-installed on Windows",
  },
  {
    name: "yt-dlp",
    cmd: "yt-dlp",
    versionArg: "--version",
    whichCmd: (isWin: boolean) => (isWin ? "where.exe yt-dlp" : "which yt-dlp"),
    installCmd: "winget install yt-dlp.yt-dlp",
    uninstallCmd: "winget uninstall yt-dlp.yt-dlp",
    hint: "Media downloader binary for YTD feature",
  },
  {
    name: "ffmpeg",
    cmd: "ffmpeg",
    versionArg: "-version",
    whichCmd: (isWin: boolean) => (isWin ? "where.exe ffmpeg" : "which ffmpeg"),
    installCmd: "winget install Gyan.FFmpeg",
    uninstallCmd: "winget uninstall Gyan.FFmpeg",
    hint: "Required for media conversion by yt-dlp",
  },
  {
    name: "Python 3",
    cmd: "python",
    versionArg: "--version",
    whichCmd: (isWin: boolean) => (isWin ? "where.exe python" : "which python3"),
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

export async function checkSingleDep(
  def: (typeof DEP_DEFINITIONS)[number],
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

  try {
    // 1. Resolve install dir via which/where
    let installDir = "—";
    try {
      const whichOut = await execAsync(cp, def.whichCmd(isWin), 3000);
      const lines = whichOut.split(/\r?\n/).filter(Boolean);
      installDir = lines[0]?.trim() || "—";
    } catch {
      installDir = "not found in PATH";
    }

    // 2. Get version
    const versionOut = await execAsync(cp, `${def.cmd} ${def.versionArg}`, 4000);
    const versionLine = versionOut.split(/\r?\n/)[0];

    return {
      name: def.name,
      status: "ok",
      version: versionLine || "unknown",
      installDir,
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
    const time = d.checkedAt ? new Date(d.checkedAt).toLocaleTimeString() : "—";
    return `| ${d.name} | ${icon} ${d.status} | ${d.version} | \`${d.installDir}\` | ${time} | ${d.durationMs}ms |`;
  });
  return [header, sep, ...rows].join("\n");
}

// ─── UI Render: OS Badge ─────────────────────────────────────────────────────

export function renderOsBadge(
  container: HTMLElement,
  vaultPath: string,
  pluginDir: string
): void {
  const os = detectOs();
  const now = new Date().toLocaleString();

  const badge = container.createDiv({ cls: "pakcli-os-badge" });

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
  onRefresh: () => void
): void {
  container.empty();

  // ── Export bar ──
  const exportBar = container.createDiv({ cls: "pakcli-deps-export-bar" });
  exportBar.createSpan({ cls: "pakcli-deps-export-label", text: "Export:" });

  const mkExportBtn = (label: string, fmt: "md" | "json" | "csv") => {
    const btn = exportBar.createEl("button", { cls: "pakcli-deps-export-btn", text: label });
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

  // ── Refresh button ──
  const refreshBtn = exportBar.createEl("button", {
    cls: "pakcli-deps-export-btn pakcli-deps-refresh-btn",
    text: "🔄 Re-check",
  });
  refreshBtn.onclick = onRefresh;

  // ── Table ──
  const tableWrap = container.createDiv({ cls: "pakcli-deps-table-wrap" });
  const table = tableWrap.createEl("table", { cls: "pakcli-deps-table" });

  // Head
  const thead = table.createEl("thead");
  const headRow = thead.createEl("tr");
  const headers = [
    "Dependency",
    "Status",
    "Version",
    "Checked at",
    "Duration",
    "Install dir",
    "📋 Path",
    "⬇️ Install",
    "🗑️ Uninstall",
  ];
  headers.forEach((h) => {
    const th = headRow.createEl("th");
    th.textContent = h;
  });

  // Body
  const tbody = table.createEl("tbody");

  if (deps.length === 0) {
    const tr = tbody.createEl("tr");
    const td = tr.createEl("td", { attr: { colspan: "9" } });
    td.textContent = "No results yet — click Re-check to scan.";
    td.style.textAlign = "center";
    td.style.color = "var(--text-muted)";
    td.style.padding = "18px";
    return;
  }

  deps.forEach((dep) => {
    const tr = tbody.createEl("tr", { cls: `pakcli-deps-row status-${dep.status}` });

    // 1. Name
    const tdName = tr.createEl("td", { cls: "pakcli-deps-td pakcli-deps-name-cell" });
    tdName.textContent = dep.name;

    // 2. Status icon
    const tdStatus = tr.createEl("td", { cls: "pakcli-deps-td pakcli-deps-status-cell" });
    const iconMap = { ok: "✅", warning: "⚠️", error: "❌", checking: "⏳" };
    const statusSpan = tdStatus.createSpan({ cls: `pakcli-deps-status-badge status-${dep.status}` });
    statusSpan.textContent = (iconMap[dep.status] || "❓") + " " + dep.status;

    // 3. Version
    const tdVer = tr.createEl("td", { cls: "pakcli-deps-td pakcli-deps-mono" });
    tdVer.textContent = dep.version || "—";

    // 4. Checked at
    const tdTime = tr.createEl("td", { cls: "pakcli-deps-td pakcli-deps-mono pakcli-deps-time" });
    tdTime.textContent = dep.checkedAt
      ? new Date(dep.checkedAt).toLocaleTimeString()
      : "—";
    tdTime.title = dep.checkedAt || "";

    // 5. Duration
    const tdDur = tr.createEl("td", { cls: "pakcli-deps-td pakcli-deps-mono pakcli-deps-dur" });
    tdDur.textContent = dep.durationMs > 0 ? `${dep.durationMs}ms` : "—";

    // 6. Install dir
    const tdDir = tr.createEl("td", { cls: "pakcli-deps-td pakcli-deps-dir-cell" });
    const dirSpan = tdDir.createSpan({ cls: "pakcli-deps-dir-text" });
    dirSpan.textContent = dep.installDir || "—";
    dirSpan.title = dep.installDir || "";

    // 7. Copy path button
    const tdCopy = tr.createEl("td", { cls: "pakcli-deps-td pakcli-deps-action-cell" });
    if (dep.installDir && dep.installDir !== "—" && !dep.installDir.includes("not")) {
      const copyBtn = tdCopy.createEl("button", {
        cls: "pakcli-deps-action-btn pakcli-deps-copy-btn",
        text: "📋 Copy",
      });
      copyBtn.onclick = () => {
        navigator.clipboard.writeText(dep.installDir).then(() => {
          new Notice(`📋 Copied: ${dep.installDir}`);
          copyBtn.textContent = "✅ Copied!";
          setTimeout(() => { copyBtn.textContent = "📋 Copy"; }, 1800);
        });
      };
    } else {
      tdCopy.createSpan({ cls: "pakcli-deps-na", text: "—" });
    }

    // 8. Install button
    const tdInstall = tr.createEl("td", { cls: "pakcli-deps-td pakcli-deps-action-cell" });
    const installBtn = tdInstall.createEl("button", {
      cls: "pakcli-deps-action-btn pakcli-deps-install-btn",
      text: "⬇️ Install",
    });
    installBtn.title = dep.installCmd;
    installBtn.onclick = () => {
      navigator.clipboard.writeText(dep.installCmd).then(() => {
        new Notice(`📋 Copied install command:\n${dep.installCmd}`);
      });
    };

    // 9. Uninstall button
    const tdUninstall = tr.createEl("td", { cls: "pakcli-deps-td pakcli-deps-action-cell" });
    const uninstallBtn = tdUninstall.createEl("button", {
      cls: "pakcli-deps-action-btn pakcli-deps-uninstall-btn",
      text: "🗑️ Remove",
    });
    uninstallBtn.title = dep.uninstallCmd;
    uninstallBtn.onclick = () => {
      navigator.clipboard.writeText(dep.uninstallCmd).then(() => {
        new Notice(`📋 Copied uninstall command:\n${dep.uninstallCmd}`);
      });
    };
  });
}
