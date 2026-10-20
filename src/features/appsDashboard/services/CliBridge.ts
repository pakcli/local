import { getNodeChildProcess } from "../../../utils/nodeHelpers";
import type { HealthStatusResponse, DeployRequest, DeployLogChunk, GitCommitRecord } from "../types";
import { MOCK_HEALTH_STATUS, MOCK_COMMITS } from "./MockData";

export class CliBridge {
  private cp = getNodeChildProcess();

  public async checkHealth(isDemoMode = false): Promise<HealthStatusResponse> {
    if (isDemoMode) {
      return { ...MOCK_HEALTH_STATUS };
    }

    const health: HealthStatusResponse = {
      server: {
        status: "connected",
        version: "1.0.0",
        uptimeSeconds: Math.floor(process.uptime ? process.uptime() : 120),
        port: 4747,
      },
      cli: {
        firebase: { installed: false },
        git: { installed: false },
        gh: { installed: false },
      },
    };

    if (!this.cp?.exec) {
      return health;
    }

    // 1. Git version
    try {
      const gitVer = await this.execAsync("git --version");
      health.cli.git = { installed: true, version: gitVer.replace("git version", "").trim() };
    } catch {}

    // 2. Firebase version
    try {
      const fbVer = await this.execAsync("firebase --version");
      health.cli.firebase = { installed: true, version: fbVer.trim() };
    } catch {}

    // 3. GitHub CLI version
    try {
      const ghVer = await this.execAsync("gh --version");
      health.cli.gh = { installed: true, version: ghVer.split("\n")[0].replace("gh version", "").trim() };
    } catch {}

    return health;
  }

  public async getGitHistory(appPath: string, isDemoMode = false): Promise<GitCommitRecord[]> {
    if (isDemoMode) {
      return [...MOCK_COMMITS];
    }

    if (!this.cp?.exec) return [...MOCK_COMMITS];

    try {
      const raw = await this.execAsync('git log -n 15 --pretty=format:"%H|%h|%s|%cr|%an"', appPath);
      const lines = raw.split("\n").filter((l) => l.trim().length > 0);
      return lines.map((line, idx) => {
        const [hash, shortHash, message, date, author] = line.split("|");
        return {
          hash: hash || "",
          shortHash: shortHash || "",
          message: message || "No commit message",
          date: date || "",
          author: author || "",
          isLive: idx === 0,
        };
      });
    } catch {
      return [...MOCK_COMMITS];
    }
  }

  public streamDeploy(
    req: DeployRequest,
    appPath: string,
    isDemoMode: boolean,
    onChunk: (chunk: DeployLogChunk) => void
  ): { cancel: () => void } {
    let isCancelled = false;

    if (isDemoMode) {
      // Simulate realistic streaming deploy
      const mockLines = [
        `=== Deploying to '${req.appId}'...`,
        "i  hosting: checking build directory and files...",
        `✔  hosting: found target public directory`,
        "i  hosting: beginning upload [====================] 100%",
        "✔  hosting: upload complete!",
        "i  hosting: releasing new version...",
        "✔  Deploy complete!",
        `\nProject Console: https://console.firebase.google.com/project/${req.appId}/overview`,
        `Hosting URL: https://${req.appId}.web.app`,
      ];

      let idx = 0;
      const interval = setInterval(() => {
        if (isCancelled || idx >= mockLines.length) {
          clearInterval(interval);
          if (!isCancelled) {
            onChunk({
              timestamp: Date.now(),
              appId: req.appId,
              stream: "stdout",
              line: "✔ Process finished successfully.",
              isComplete: true,
              exitCode: 0,
              liveUrl: `https://${req.appId}.web.app`,
            });
          }
          return;
        }

        onChunk({
          timestamp: Date.now(),
          appId: req.appId,
          stream: "stdout",
          line: mockLines[idx],
        });
        idx++;
      }, 350);

      return {
        cancel: () => {
          isCancelled = true;
          clearInterval(interval);
        },
      };
    }

    // Real CLI spawn
    if (!this.cp?.spawn) {
      onChunk({
        timestamp: Date.now(),
        appId: req.appId,
        stream: "stderr",
        line: "Error: Node child_process API not available in this environment.",
        isComplete: true,
        exitCode: 1,
      });
      return { cancel: () => {} };
    }

    const isPreview = req.mode === "preview";
    const args = isPreview
      ? ["hosting:channel:deploy", req.previewChannel || "preview"]
      : ["deploy", "--only", "hosting"];

    const proc = this.cp.spawn("firebase", args, {
      cwd: appPath,
      shell: true,
    });

    proc.stdout?.on("data", (data: any) => {
      const text = data.toString();
      onChunk({
        timestamp: Date.now(),
        appId: req.appId,
        stream: "stdout",
        line: text,
      });
    });

    proc.stderr?.on("data", (data: any) => {
      const text = data.toString();
      onChunk({
        timestamp: Date.now(),
        appId: req.appId,
        stream: "stderr",
        line: text,
      });
    });

    proc.on("close", (exitCode: number) => {
      onChunk({
        timestamp: Date.now(),
        appId: req.appId,
        stream: exitCode === 0 ? "stdout" : "stderr",
        line: exitCode === 0 ? "✔ Deployment completed." : `Deployment failed with exit code ${exitCode}`,
        isComplete: true,
        exitCode,
      });
    });

    return {
      cancel: () => {
        isCancelled = true;
        try {
          proc.kill();
        } catch {}
      },
    };
  }

  private execAsync(cmd: string, cwd?: string): Promise<string> {
    return new Promise((resolve, reject) => {
      this.cp.exec(cmd, { cwd, timeout: 5000 }, (err: any, stdout: string) => {
        if (err) reject(err);
        else resolve(stdout);
      });
    });
  }
}
