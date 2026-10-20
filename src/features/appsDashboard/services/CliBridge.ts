import { requestUrl } from "obsidian";
import { getNodeChildProcess, getNodeFs, getNodePath } from "../../../utils/nodeHelpers";
import type {
  HealthStatusResponse,
  DeployRequest,
  DeployLogChunk,
  GitCommitRecord,
  SystemAccountsInfo,
  FirebaseProjectSummary,
} from "../types";
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

    // 1. Git version & user
    try {
      const gitVer = await this.execAsync("git --version");
      health.cli.git = { installed: true, version: gitVer.replace("git version", "").trim() };
      try {
        const gitEmail = await this.execAsync("git config user.email");
        if (gitEmail.trim()) health.cli.git.userEmail = gitEmail.trim();
      } catch {}
    } catch {}

    // 2. Firebase version & user
    try {
      const fbVer = await this.execAsync("firebase --version");
      health.cli.firebase = { installed: true, version: fbVer.trim() };
      try {
        const fbLoginOut = await this.execAsync("firebase login:list");
        const m = fbLoginOut.match(/Logged in as\s+([^\s\r\n]+)/i);
        if (m && m[1]) health.cli.firebase.userEmail = m[1].trim();
      } catch {}
    } catch {}

    // 3. GitHub CLI version & user
    try {
      const ghVer = await this.execAsync("gh --version");
      health.cli.gh = { installed: true, version: ghVer.split("\n")[0].replace("gh version", "").trim() };
      try {
        const ghUser = await this.execAsync("gh api user --jq .login");
        if (ghUser.trim() && !ghUser.toLowerCase().includes("error")) {
          health.cli.gh.userEmail = ghUser.trim();
        }
      } catch {}
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

  /**
   * Ensures that standard ignore patterns exist in the target app's .gitignore.
   * If .gitignore does not exist, it creates one with recommended defaults.
   * If it already exists, any missing patterns are appended to prevent accidental leaks.
   */
  public ensureGitignore(appPath: string): void {
    if (!this.fs || !this.path) return;
    try {
      const gitignorePath = this.path.join(appPath, ".gitignore");
      const requiredPatterns = [
        "node_modules/",
        "dist/",
        ".DS_Store",
        "Thumbs.db",
        "*.log",
        ".env",
        ".cache/",
        ".firebase/hosting..cache",
        ".firebase/",
      ];

      if (!this.fs.existsSync(gitignorePath)) {
        const content = [
          "# Dependencies",
          "node_modules/",
          "",
          "# Production Builds",
          "dist/",
          "build/",
          "",
          "# System Files",
          ".DS_Store",
          "Thumbs.db",
          "",
          "# Logs",
          "*.log",
          "",
          "# Environment & Secrets",
          ".env",
          ".env.*",
          "*.local",
          "",
          "# Caches",
          ".cache/",
          ".firebase/hosting..cache",
          ".firebase/",
          "",
        ].join("\n");
        this.fs.writeFileSync(gitignorePath, content, "utf8");
      } else {
        const existing = this.fs.readFileSync(gitignorePath, "utf8");
        const lines = existing.split(/\r?\n/).map((l: string) => l.trim());
        const missing: string[] = [];

        for (const pat of requiredPatterns) {
          if (!lines.includes(pat)) {
            missing.push(pat);
          }
        }

        if (missing.length > 0) {
          const prefix = existing.endsWith("\n") ? "" : "\n";
          const appendContent = prefix + "\n# Auto-added essential ignore patterns\n" + missing.join("\n") + "\n";
          this.fs.appendFileSync(gitignorePath, appendContent, "utf8");
        }
      }
    } catch (err) {
      console.warn("[CliBridge] ensureGitignore warning:", err);
    }
  }

  public async initGitRepo(appPath: string): Promise<{ success: boolean; message: string }> {
    if (!this.cp?.exec) {
      return { success: false, message: "Node child_process API not available." };
    }

    try {
      // 1. git init
      await this.execAsync("git init", appPath);

      // 2. ensure .gitignore exists and contains all required patterns
      this.ensureGitignore(appPath);

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

  public async unlinkGitHubRemote(appPath: string): Promise<{ success: boolean; message: string }> {
    if (!this.cp?.exec) {
      return { success: false, message: "Node child_process API not available." };
    }
    try {
      await this.execAsync("git remote remove origin", appPath);
      return { success: true, message: "Remote origin unlinked." };
    } catch (err: any) {
      return { success: false, message: `Failed to unlink remote: ${err?.message || err}` };
    }
  }

  public async checkGitHubRepoExists(
    owner: string,
    repo: string
  ): Promise<{ exists: boolean; isPrivate?: boolean; htmlUrl?: string; error?: string }> {
    const cleanOwner = owner.trim();
    const cleanRepo = repo.trim();
    if (!cleanOwner || !cleanRepo) {
      return { exists: false, error: "Owner and repo name are required" };
    }

    // 1. First attempt: Native Obsidian requestUrl to GitHub REST API (Fast, no-token public check)
    try {
      if (typeof requestUrl === "function") {
        const resp = await requestUrl({
          url: `https://api.github.com/repos/${cleanOwner}/${cleanRepo}`,
          headers: { "User-Agent": "Obsidian-PakCLI" },
          throw: false,
        });

        if (resp.status === 200) {
          return {
            exists: true,
            isPrivate: resp.json?.private ?? false,
            htmlUrl: resp.json?.html_url ?? `https://github.com/${cleanOwner}/${cleanRepo}`,
          };
        }
      }
    } catch {}

    // 2. Second attempt: Check via gh CLI (detects private repositories of the active user)
    if (this.cp?.exec) {
      try {
        const ghOut = await this.execAsync(`gh repo view "${cleanOwner}/${cleanRepo}" --json isPrivate,url`);
        const parsed = JSON.parse(ghOut.trim());
        return {
          exists: true,
          isPrivate: parsed?.isPrivate ?? false,
          htmlUrl: parsed?.url ?? `https://github.com/${cleanOwner}/${cleanRepo}`,
        };
      } catch {
        return { exists: false };
      }
    }

    return { exists: false };
  }

  public createGitHubRepo(
    appPath: string,
    owner: string,
    repo: string,
    isPrivate = false,
    onLog: (line: string) => void
  ): { promise: Promise<{ success: boolean; message: string }>; cancel: () => void } {
    let proc: any;
    let isCancelled = false;

    const promise = new Promise<{ success: boolean; message: string }>((resolve) => {
      if (!this.cp?.spawn) {
        resolve({ success: false, message: "Node child_process not available." });
        return;
      }

      const targetSlug = `${owner}/${repo}`;
      const visFlag = isPrivate ? "--private" : "--public";
      onLog(`🚀 Creating GitHub repository '${targetSlug}'...\n`);
      onLog(`> gh repo create ${targetSlug} ${visFlag} --source=. --remote=origin --push\n\n`);

      proc = this.cp.spawn(
        "gh",
        ["repo", "create", targetSlug, visFlag, "--source=.", "--remote=origin", "--push"],
        { cwd: appPath, shell: true }
      );

      proc.stdout?.on("data", (data: any) => {
        onLog(data.toString());
      });

      proc.stderr?.on("data", (data: any) => {
        onLog(data.toString());
      });

      proc.on("close", (exitCode: number) => {
        if (isCancelled) {
          resolve({
            success: false,
            message: "Repository creation was cancelled by user (Ctrl+C).",
          });
        } else if (exitCode === 0) {
          onLog(`\n✔ Repository created and pushed: https://github.com/${targetSlug}\n`);
          resolve({
            success: true,
            message: `✔ Repository created and pushed: https://github.com/${targetSlug}`,
          });
        } else {
          onLog(`\n❌ Process exited with code ${exitCode}\n`);
          resolve({
            success: false,
            message: `gh repo create failed with code ${exitCode}. See log for details.`,
          });
        }
      });

      proc.on("error", (err: any) => {
        if (isCancelled) {
          resolve({
            success: false,
            message: "Repository creation was cancelled by user.",
          });
        } else {
          onLog(`\n❌ Spawn error: ${err.message || err}\n`);
          resolve({ success: false, message: `Error: ${err.message || err}` });
        }
      });
    });

    const cancel = () => {
      isCancelled = true;
      onLog("\n🛑 Execution halted: Ctrl+C triggered (canceled by user). Terminating process...\n");
      try {
        if (proc && proc.pid) {
          const isWin = process.platform === "win32";
          if (isWin) {
            this.cp.exec(`taskkill /pid ${proc.pid} /t /f`, () => {});
          } else {
            proc.kill("SIGINT");
          }
        }
      } catch {}
    };

    return { promise, cancel };
  }

  public async setupFirebaseHosting(
    appPath: string,
    siteId: string,
    publicDir = "."
  ): Promise<{ success: boolean; message: string }> {
    if (!this.fs || !this.path) {
      return { success: false, message: "Node filesystem API not available." };
    }

    try {
      const firebaseJsonPath = this.path.join(appPath, "firebase.json");
      const config = {
        hosting: {
          public: publicDir,
          ignore: ["firebase.json", "**/.*", "**/node_modules/**"],
        },
      };
      this.fs.writeFileSync(firebaseJsonPath, JSON.stringify(config, null, 2), "utf8");

      const firebasercPath = this.path.join(appPath, ".firebaserc");
      const rc = {
        projects: {
          default: siteId,
        },
      };
      this.fs.writeFileSync(firebasercPath, JSON.stringify(rc, null, 2), "utf8");

      return { success: true, message: `Firebase hosting configured for project: ${siteId} (public: ${publicDir})` };
    } catch (err: any) {
      return { success: false, message: `Failed to setup Firebase config: ${err?.message || err}` };
    }
  }

  public async getSystemAccountsInfo(isDemoMode = false): Promise<SystemAccountsInfo> {
    if (isDemoMode) {
      return {
        firebase: {
          activeEmail: "demo@gmail.com",
          availableEmails: ["demo@gmail.com", "second@gmail.com"],
        },
        github: {
          username: "demo-dev",
          email: "demo@users.noreply.github.com",
        },
      };
    }

    const info: SystemAccountsInfo = {
      firebase: {
        activeEmail: undefined,
        availableEmails: [],
      },
      github: {
        username: undefined,
        email: undefined,
      },
    };

    if (!this.cp?.exec) return info;

    // 1. Parse Firebase accounts from firebase login:list
    try {
      const fbOut = await this.execAsync("firebase login:list");
      const activeMatch = fbOut.match(/Logged in as\s+([^\s\r\n]+)/i);
      if (activeMatch && activeMatch[1]) {
        info.firebase.activeEmail = activeMatch[1].trim();
        info.firebase.availableEmails.push(info.firebase.activeEmail);
      }
      const otherMatches = Array.from(fbOut.matchAll(/^\s*-\s+([^\s\r\n]+@[^\s\r\n]+)/gm));
      for (const om of otherMatches) {
        const em = om[1].trim();
        if (!info.firebase.availableEmails.includes(em)) {
          info.firebase.availableEmails.push(em);
        }
      }
    } catch {}

    // 2. Parse GitHub account from gh and git
    try {
      const ghUser = await this.execAsync("gh api user --jq .login");
      const login = ghUser.trim();
      if (login && !login.toLowerCase().includes("error")) {
        info.github.username = login;
      }
    } catch {}

    try {
      const gitEmail = await this.execAsync("git config user.email");
      if (gitEmail.trim()) info.github.email = gitEmail.trim();
      if (!info.github.username) {
        const gitUser = await this.execAsync("git config user.name");
        if (gitUser.trim()) info.github.username = gitUser.trim();
      }
    } catch {}

    return info;
  }

  public async listFirebaseProjects(isDemoMode = false): Promise<FirebaseProjectSummary[]> {
    if (isDemoMode) {
      return [
        { projectId: "demo-static-1", displayName: "Demo Static App" },
        { projectId: "demo-portfolio", displayName: "Demo Portfolio" },
      ];
    }

    if (!this.cp?.exec) return [];

    try {
      const raw = await this.execAsync("firebase projects:list --json");
      const parsed = JSON.parse(raw);
      const list = parsed.result || (Array.isArray(parsed) ? parsed : []);
      return list.map((item: any) => ({
        projectId: item.projectId,
        displayName: item.displayName || item.projectId,
        hostingSite: item.resources?.hostingSite || item.projectId,
      }));
    } catch (err) {
      console.warn("[CliBridge] Failed to list Firebase projects:", err);
      return [];
    }
  }

  public async switchFirebaseAccount(email: string): Promise<{ success: boolean; message: string }> {
    if (!this.cp?.exec) return { success: false, message: "Node child_process not available" };
    try {
      await this.execAsync(`firebase login:use "${email}"`);
      return { success: true, message: `Active Firebase account switched to: ${email}` };
    } catch (err: any) {
      return { success: false, message: `Failed to switch account: ${err?.message || err}` };
    }
  }

  public async logoutFirebaseAccount(email?: string): Promise<{ success: boolean; message: string }> {
    if (!this.cp?.exec) return { success: false, message: "Node child_process not available" };
    try {
      const cmd = email ? `firebase logout "${email}"` : `firebase logout`;
      await this.execAsync(cmd);
      return { success: true, message: `Logged out ${email || "account"} successfully.` };
    } catch (err: any) {
      return { success: false, message: `Failed to logout: ${err?.message || err}` };
    }
  }

  public openInteractiveFirebaseLogin(): void {
    if (!this.cp?.spawn) return;
    const psScript = [
      '$host.UI.RawUI.WindowTitle = "PakCLI - Firebase Authentication Manager"',
      'Write-Host "==========================================================" -ForegroundColor Cyan',
      'Write-Host " 🔥 PAKCLI - FIREBASE AUTHENTICATION (Interactive Console)" -ForegroundColor Yellow',
      'Write-Host "==========================================================" -ForegroundColor Cyan',
      'Write-Host "[*] Launching browser for Google Firebase authorization..." -ForegroundColor White',
      'Write-Host "[*] Executing: firebase login" -ForegroundColor Gray',
      'Write-Host ""',
      'firebase login',
      'Write-Host ""',
      'Write-Host "==========================================================" -ForegroundColor Cyan',
      'Write-Host "[OK] Process finished! You can close this window and return to Obsidian." -ForegroundColor Green',
      'Write-Host "==========================================================" -ForegroundColor Cyan',
    ].join("\n");

    this.cp.spawn("cmd.exe", ["/c", "start", "powershell.exe", "-NoExit", "-Command", psScript], {
      detached: true,
      stdio: "ignore",
    });
  }

  public openInteractiveGitHubLogin(): void {
    if (!this.cp?.spawn) return;
    const psScript = [
      '$host.UI.RawUI.WindowTitle = "PakCLI - GitHub Authentication Manager"',
      'Write-Host "==========================================================" -ForegroundColor Cyan',
      'Write-Host " 🐙 PAKCLI - GITHUB AUTHENTICATION (Interactive Console)  " -ForegroundColor Yellow',
      'Write-Host "==========================================================" -ForegroundColor Cyan',
      'Write-Host "[*] Executing: gh auth login" -ForegroundColor White',
      'Write-Host ""',
      'gh auth login',
      'Write-Host ""',
      'Write-Host "==========================================================" -ForegroundColor Cyan',
      'Write-Host "[OK] Process finished! You can close this window and return to Obsidian." -ForegroundColor Green',
      'Write-Host "==========================================================" -ForegroundColor Cyan',
    ].join("\n");

    this.cp.spawn("cmd.exe", ["/c", "start", "powershell.exe", "-NoExit", "-Command", psScript], {
      detached: true,
      stdio: "ignore",
    });
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

    // 1. Self-Healing: Check if firebase.json has public: "dist" but dist does not exist
    if (!isGh && this.fs && this.path) {
      try {
        const fbJsonPath = this.path.join(appPath, "firebase.json");
        if (this.fs.existsSync(fbJsonPath)) {
          const cfg = JSON.parse(this.fs.readFileSync(fbJsonPath, "utf-8"));
          const currentPub = cfg?.hosting?.public;
          if (currentPub && currentPub !== ".") {
            const pubDir = this.path.join(appPath, currentPub);
            const rootIndex = this.path.join(appPath, "index.html");
            if (!this.fs.existsSync(pubDir) && this.fs.existsSync(rootIndex)) {
              cfg.hosting.public = ".";
              this.fs.writeFileSync(fbJsonPath, JSON.stringify(cfg, null, 2), "utf-8");
              onChunk({
                timestamp: Date.now(),
                appId: req.appId,
                stream: "stdout",
                line: `🔧 Self-Healing: Adjusted firebase.json 'public' from '${currentPub}' to '.' (root) because index.html is located in root.\n`,
              });
            }
          }
        }
      } catch {}
    }

    // 2. Ensure .gitignore has node_modules/, dist/, .cache/, .firebase/hosting..cache, etc.
    this.ensureGitignore(appPath);

    isCancelled = false;
    let currentProc: any = null;
    let hasAttemptedAutoCreate = false;

    const executeDeploy = () => {
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

      let detectedMissingProject = "";

      const proc = this.cp.spawn(procCmd, procArgs, {
        cwd: appPath,
        shell: true,
      });
      currentProc = proc;

      proc.stdout?.on("data", (data: any) => {
        onChunk({
          timestamp: Date.now(),
          appId: req.appId,
          stream: "stdout",
          line: data.toString(),
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

        const m = text.match(/Failed to get Firebase project\s+([^\s\r\n.]+)/i);
        if (m && m[1]) {
          detectedMissingProject = m[1].trim();
        }
      });

      proc.on("close", (exitCode: number) => {
        if (isCancelled) {
          onChunk({
            timestamp: Date.now(),
            appId: req.appId,
            stream: "stderr",
            line: "\n🛑 Deployment cancelled by user (Ctrl+C).",
            isComplete: true,
            exitCode: 1,
          });
          return;
        }

        // Auto-heal: If missing project detected on user's Firebase account, auto-create via Firebase CLI
        if (exitCode !== 0 && detectedMissingProject && !hasAttemptedAutoCreate && !isGh) {
          hasAttemptedAutoCreate = true;
          onChunk({
            timestamp: Date.now(),
            appId: req.appId,
            stream: "stdout",
            line: `\n🚀 Detected missing Firebase project: '${detectedMissingProject}'.\n🔄 Auto-creating project on Firebase via plugin engine...\n> firebase projects:create ${detectedMissingProject} -n "${detectedMissingProject}"\n\n`,
          });

          const createProc = this.cp.spawn(
            "firebase",
            ["projects:create", detectedMissingProject, "-n", detectedMissingProject],
            { cwd: appPath, shell: true }
          );
          currentProc = createProc;

          createProc.stdout?.on("data", (d: any) => {
            onChunk({
              timestamp: Date.now(),
              appId: req.appId,
              stream: "stdout",
              line: d.toString(),
            });
          });

          createProc.stderr?.on("data", (d: any) => {
            onChunk({
              timestamp: Date.now(),
              appId: req.appId,
              stream: "stderr",
              line: d.toString(),
            });
          });

          createProc.on("close", (createCode: number) => {
            if (isCancelled) return;
            if (createCode === 0) {
              onChunk({
                timestamp: Date.now(),
                appId: req.appId,
                stream: "stdout",
                line: `\n✔ Firebase project '${detectedMissingProject}' successfully created!\n🚀 Proceeding with deployment...\n\n`,
              });
              executeDeploy();
            } else {
              onChunk({
                timestamp: Date.now(),
                appId: req.appId,
                stream: "stderr",
                line: `\n❌ Failed to auto-create project '${detectedMissingProject}'. Exit code ${createCode}.\n💡 You can choose an existing project in [⚙️ Edit Config] or check your Google Cloud quota.\n`,
                isComplete: true,
                exitCode: createCode,
              });
            }
          });

          createProc.on("error", (err: any) => {
            if (isCancelled) return;
            onChunk({
              timestamp: Date.now(),
              appId: req.appId,
              stream: "stderr",
              line: `\n❌ Auto-create error: ${err.message || err}\n`,
              isComplete: true,
              exitCode: 1,
            });
          });

          return;
        }

        onChunk({
          timestamp: Date.now(),
          appId: req.appId,
          stream: exitCode === 0 ? "stdout" : "stderr",
          line: exitCode === 0 ? "✔ Deployment completed." : `Deployment failed with exit code ${exitCode}`,
          isComplete: true,
          exitCode,
        });
      });
    };

    executeDeploy();

    return {
      cancel: () => {
        isCancelled = true;
        try {
          if (currentProc && currentProc.pid) {
            const isWin = process.platform === "win32";
            if (isWin) {
              this.cp.exec(`taskkill /pid ${currentProc.pid} /t /f`, () => {});
            } else {
              currentProc.kill("SIGINT");
            }
          }
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
