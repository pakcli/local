import { getNodeChildProcess } from "../../utils/nodeHelpers";

export interface PsRunResult {
  success: boolean;
  stdout: string;
  stderr: string;
  durationMs: number;
}

/**
 * Level 0 check — uses Node where.exe directly, no PowerShell needed.
 * Returns "pwsh" | "powershell" | null
 */
export function detectPsExe(): "pwsh" | "powershell" | null {
  const cp = getNodeChildProcess();
  if (!cp) return null;
  try {
    cp.execSync("where.exe pwsh", { encoding: "utf8", timeout: 2000 });
    return "pwsh";
  } catch {
    try {
      cp.execSync("where.exe powershell", { encoding: "utf8", timeout: 2000 });
      return "powershell";
    } catch {
      return null;
    }
  }
}

/**
 * Run a PowerShell command with -NoProfile -NonInteractive -ExecutionPolicy Bypass.
 * Caller MUST show ConsentModal and receive confirmation before calling this.
 * Timeout: 60s (covers winget installs).
 */
export function runPsCommand(
  command: string,
  psExe: "pwsh" | "powershell"
): Promise<PsRunResult> {
  const cp = getNodeChildProcess();
  const t0 = Date.now();

  if (!cp) {
    return Promise.resolve({
      success: false,
      stdout: "",
      stderr: "child_process not available (Desktop only feature)",
      durationMs: 0,
    });
  }

  const fullCmd = `${psExe} -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "${command}"`;

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
