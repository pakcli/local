import { App, Notice } from "obsidian";
import { getNodeChildProcess, getNodeOs } from "../../utils/nodeHelpers";
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

  // Body
  const tbody = table.createEl("tbody");

  if (deps.length === 0) {
    const tr = tbody.createEl("tr");
    const td = tr.createEl("td", { attr: { colspan: "4" } });
    td.textContent = "No results yet — click Re-check All to scan.";
    td.style.textAlign = "center";
    td.style.color = "var(--text-muted)";
    td.style.padding = "18px";
    return;
  }

  const isWin = (getNodeOs()?.platform?.() || "") === "win32";

  deps.forEach((dep, idx) => {
    const tr = tbody.createEl("tr", { cls: `pakcli-deps-row status-${dep.status}` });

    // ── Col 1: Name + Status badge ──
    const tdName = tr.createEl("td", { cls: "pakcli-deps-td pakcli-deps-name-cell" });
    const iconMap: Record<string, string> = { ok: "✅", warning: "⚠️", error: "❌", checking: "⏳" };
    const badge = tdName.createSpan({ cls: `pakcli-deps-status-dot status-${dep.status}` });
    badge.textContent = iconMap[dep.status] || "❓";
    badge.title = dep.status;
    tdName.createSpan({ cls: "pakcli-deps-name-text", text: dep.name });
    if (dep.hint) {
      tdName.createDiv({ cls: "pakcli-deps-hint", text: dep.hint });
    }

    // ── Col 2: Version ──
    const tdVer = tr.createEl("td", { cls: "pakcli-deps-td pakcli-deps-mono" });
    tdVer.textContent = dep.version || "—";

    // ── Col 3: Install location + inline copy ──
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
      // update the row status to "checking"
      badge.textContent = "⏳";
      badge.className = `pakcli-deps-status-dot status-checking`;
      tr.className = "pakcli-deps-row status-checking";
      tdVer.textContent = "…";

      const def = DEP_DEFINITIONS.find(d => d.name === dep.name);
      const fresh = def
        ? await checkSingleDep(def, isWin)
        : { ...dep, status: "error" as const, version: "—", installDir: "—", checkedAt: new Date().toISOString(), durationMs: 0 };

      deps[idx] = fresh;

      // Update row in-place
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
    const installBtn = actWrap.createEl("button", {
      cls: "pakcli-deps-action-btn pakcli-deps-install-btn",
      text: "⬇️ Install",
      attr: { title: dep.installCmd },
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
          setTimeout(() => { installBtn.disabled = false; installBtn.textContent = "⬇️ Install"; }, 4000);
        } else {
          installBtn.disabled = false;
          installBtn.textContent = "❌ Failed";
          new Notice(`❌ Install failed for ${dep.name}:\n\n${result.stderr || "Unknown error"}`, 8000);
          setTimeout(() => { installBtn.textContent = "⬇️ Install"; }, 3000);
        }
      } else {
        navigator.clipboard.writeText(dep.installCmd).then(() => {
          new Notice(`📋 Copied install command:\n${dep.installCmd}`);
        });
      }
    };

    // — Uninstall —
    const uninstallBtn = actWrap.createEl("button", {
      cls: "pakcli-deps-action-btn pakcli-deps-uninstall-btn",
      text: "🗑️",
      attr: { title: `Remove ${dep.name} — ${dep.uninstallCmd}` },
    });
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
  });
}
