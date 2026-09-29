import { getNodeChildProcess, getNodeFs } from "../../utils/nodeHelpers";

export interface PsRunResult {
  success: boolean;
  stdout: string;
  stderr: string;
  durationMs: number;
}

/**
 * Level 0 check — checks multiple sources for PowerShell:
 * 1. PATH: pwsh (PowerShell Core 7+)
 * 2. PATH: powershell (Windows PowerShell 5.1+)
 * 3. Direct filesystem fallbacks:
 *    - C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe
 *    - C:\Program Files\PowerShell\7\pwsh.exe
 *    - C:\Program Files (x86)\PowerShell\7\pwsh.exe
 *    - C:\Windows\SysWOW64\WindowsPowerShell\v1.0\powershell.exe
 * 
 * Returns the executable name or full path, or null if not found.
 */
export function detectPsExe(): string | null {
  const cp = getNodeChildProcess();
  if (!cp) return null;

  // 1. Check PATH for pwsh
  try {
    const out = cp.execSync("where.exe pwsh", { encoding: "utf8", timeout: 2000 });
    const p = out.split(/\r?\n/)[0]?.trim();
    if (p) return "pwsh";
  } catch {
    // Continue to next check
  }

  // 2. Check PATH for powershell
  try {
    const out = cp.execSync("where.exe powershell", { encoding: "utf8", timeout: 2000 });
    const p = out.split(/\r?\n/)[0]?.trim();
    if (p) return "powershell";
  } catch {
    // Continue to fallback paths
  }

  // 3. Fallback direct filesystem checks on Windows
  const fs = getNodeFs();
  if (fs) {
    const fallbacks = [
      "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
      "C:\\Program Files\\PowerShell\\7\\pwsh.exe",
      "C:\\Program Files (x86)\\PowerShell\\7\\pwsh.exe",
      "C:\\Windows\\SysWOW64\\WindowsPowerShell\\v1.0\\powershell.exe",
    ];

    for (const fb of fallbacks) {
      try {
        if (fs.existsSync(fb)) {
          return fb;
        }
      } catch {
        // Continue
      }
    }
  }

  return null;
}

/**
 * Run a PowerShell command with -NoProfile -NonInteractive -ExecutionPolicy Bypass.
 * Caller MUST show ConsentModal and receive confirmation before calling this.
 * Timeout: 60s (covers winget installs).
 */
export function runPsCommand(
  command: string,
  psExe?: string | null
): Promise<PsRunResult> {
  const cp = getNodeChildProcess();
  const t0 = Date.now();

  const targetPs = psExe || detectPsExe();
  if (!targetPs) {
    return Promise.resolve({
      success: false,
      stdout: "",
      stderr: "No PowerShell binary (pwsh / powershell) detected on system",
      durationMs: 0,
    });
  }

  if (!cp) {
    return Promise.resolve({
      success: false,
      stdout: "",
      stderr: "child_process not available (Desktop only feature)",
      durationMs: 0,
    });
  }

  const exeCmd = targetPs.includes(" ") || targetPs.includes("\\") ? `"${targetPs}"` : targetPs;
  const fullCmd = `${exeCmd} -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "${command}"`;

  return new Promise((resolve) => {
    cp.exec(
      fullCmd,
      { timeout: 60000 },
      (err: any, stdout: string, stderr: string) => {
        resolve({
          success: !err,
          stdout: stdout?.trim() || "",
          stderr: stderr?.trim() || err?.message || "",
          durationMs: Date.now() - t0,
        });
      }
    );
  });
}
