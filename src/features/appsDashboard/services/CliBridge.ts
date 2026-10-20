import { getNodeChildProcess, getNodeFs, getNodePath } from "../../../utils/nodeHelpers";
import type { HealthStatusResponse, DeployRequest, DeployLogChunk, GitCommitRecord } from "../types";
import { MOCK_HEALTH_STATUS, MOCK_COMMITS } from "./MockData";

export class CliBridge {
  private cp = getNodeChildProcess();
  private fs = getNodeFs();
  private path = getNodePath();

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

  public async initGitRepo(appPath: string): Promise<{ success: boolean; message: string }> {
    if (!this.cp?.exec) {
      return { success: false, message: "Node child_process API not available." };
    }

    try {
      // 1. git init
      await this.execAsync("git init", appPath);

      // 2. create .gitignore if not present
      if (this.fs && this.path) {
        const gitignorePath = this.path.join(appPath, ".gitignore");
        if (!this.fs.existsSync(gitignorePath)) {
          const defaultIgnore = [
            "node_modules/",
            "dist/",
            ".DS_Store",
            "Thumbs.db",
            "*.log",
            ".env",
            ".cache/",
          ].join("\n");
          this.fs.writeFileSync(gitignorePath, defaultIgnore, "utf8");
        }
      }

      // 3. git add & initial commit
      await this.execAsync("git add -A", appPath);
      try {
        await this.execAsync('git commit -m "chore: initial release (status 1)"', appPath);
      } catch (commitErr: any) {
        // If nothing to commit, continue
        console.warn("[CliBridge] git commit notice:", commitErr?.message);
      }

      // 4. Ensure branch is main
      try {
        await this.execAsync("git branch -M main", appPath);
      } catch {}

      return { success: true, message: "Git repository initialized successfully with initial commit." };
    } catch (err: any) {
      return { success: false, message: `Failed to initialize git repository: ${err?.message || err}` };
    }
  }

  public async linkGitHubRemote(
    appPath: string,
    remoteUrl: string
  ): Promise<{ success: boolean; message: string }> {
    if (!this.cp?.exec) {
      return { success: false, message: "Node child_process API not available." };
    }

    try {
      const cleanUrl = remoteUrl.trim();
      // Remove existing origin if any
      try {
        await this.execAsync("git remote remove origin", appPath);
      } catch {}

      await this.execAsync(`git remote add origin "${cleanUrl}"`, appPath);
      return { success: true, message: `Remote origin set to ${cleanUrl}` };
    } catch (err: any) {
      return { success: false, message: `Failed to link remote: ${err?.message || err}` };
    }
  }

  public async setupFirebaseHosting(
    appPath: string,
    siteId: string,
    publicDir = "dist"
  ): Promise<{ success: boolean; message: string }> {
    if (!this.fs || !this.path) {
      return { success: false, message: "Node filesystem API not available." };
    }

    try {
      const firebaseJsonPath = this.path.join(appPath, "firebase.json");
      if (!this.fs.existsSync(firebaseJsonPath)) {
        const config = {
          hosting: {
            public: publicDir,
            ignore: ["firebase.json", "**/.*", "**/node_modules/**"],
          },
        };
        this.fs.writeFileSync(firebaseJsonPath, JSON.stringify(config, null, 2), "utf8");
      }

      const firebasercPath = this.path.join(appPath, ".firebaserc");
      if (!this.fs.existsSync(firebasercPath)) {
        const rc = {
          projects: {
            default: siteId,
          },
        };
        this.fs.writeFileSync(firebasercPath, JSON.stringify(rc, null, 2), "utf8");
      }

      return { success: true, message: `Firebase hosting configured for site: ${siteId}` };
    } catch (err: any) {
      return { success: false, message: `Failed to setup Firebase config: ${err?.message || err}` };
    }
  }

  public async setupGitHubPages(
    appPath: string,
    branch = "gh-pages"
  ): Promise<{ success: boolean; message: string }> {
    if (!this.cp?.exec) {
      return { success: false, message: "Node child_process API not available." };
    }

    try {
      // Check if branch exists
      const branches = await this.execAsync("git branch --list", appPath);
      if (!branches.includes(branch)) {
        await this.execAsync(`git branch ${branch}`, appPath);
      }
      return { success: true, message: `GitHub Pages branch '${branch}' prepared.` };
    } catch (err: any) {
      return { success: false, message: `Failed to prepare Pages branch: ${err?.message || err}` };
    }
  }

  public streamDeploy(
    req: DeployRequest,
    appPath: string,
    isDemoMode: boolean,
    onChunk: (chunk: DeployLogChunk) => void
  ): { cancel: () => void } {
    let isCancelled = false;
    const isGh = req.provider === "github_pages";

    if (isDemoMode) {
      // Simulate realistic streaming deploy
      const mockLines = isGh
        ? [
            `=== Deploying to GitHub Pages (${req.appId})...`,
            "i  git: checking working tree status...",
            "✔  git: working tree clean (0 uncommitted)",
            "i  git: pushing HEAD to origin/gh-pages...",
            "✔  git: branch gh-pages updated successfully!",
            "i  pages: triggering GitHub Pages static build...",
            "✔  Deploy complete!",
            `Hosting URL: https://${req.appId}.github.io`,
          ]
        : [
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
              liveUrl: isGh
                ? `https://${req.appId}.github.io`
                : `https://${req.appId}.web.app`,
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

    let procCmd = "firebase";
    let procArgs: string[] = [];

    if (isGh) {
      procCmd = "git";
      procArgs = ["push", "origin", "HEAD:gh-pages", "--force"];
    } else {
      const isPreview = req.mode === "preview";
      procArgs = isPreview
        ? ["hosting:channel:deploy", req.previewChannel || "preview"]
        : ["deploy", "--only", "hosting"];
    }

    const proc = this.cp.spawn(procCmd, procArgs, {
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
