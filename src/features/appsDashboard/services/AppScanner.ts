import { getNodeFs, getNodePath, getNodeOs, getNodeChildProcess } from "../../../utils/nodeHelpers";
import type {
  AppScanRecord,
  GitInfo,
  HostingInfo,
  FirebaseHostConfig,
  GitHubPagesHostConfig,
  AppCatalogMeta,
} from "../types";
import { MOCK_APPS } from "./MockData";

export class AppScanner {
  private fs = getNodeFs();
  private path = getNodePath();
  private os = getNodeOs();
  private cp = getNodeChildProcess();

  public resolvePath(rawPath: string, vaultRoot?: string): string {
    if (!rawPath) return "";
    let resolved = rawPath.trim();

    // 1. Home directory (~/...)
    if (resolved.startsWith("~")) {
      const homedir = this.os?.homedir?.() || "";
      resolved = this.path?.join(homedir, resolved.slice(1)) || resolved;
      return this.path?.resolve(resolved) || resolved;
    }

    // 2. Absolute path
    if (this.path?.isAbsolute(resolved)) {
      return this.path.resolve(resolved);
    }

    // 3. Vault-relative path (e.g. root/apps/ or apps/)
    if (vaultRoot && this.path && this.fs) {
      // Direct path check: <vaultRoot>/<rawPath>
      const direct = this.path.join(vaultRoot, resolved);
      if (this.fs.existsSync(direct)) return direct;

      // If user specified "root/apps/", check if folder is directly "apps/" in vault root
      if (resolved.startsWith("root/") || resolved.startsWith("root\\")) {
        const stripped = resolved.replace(/^root[\/\\]/, "");
        const strippedPath = this.path.join(vaultRoot, stripped);
        if (this.fs.existsSync(strippedPath)) return strippedPath;
      }

      // Check standard fallback <vaultRoot>/apps
      const fallbackApps = this.path.join(vaultRoot, "apps");
      if (this.fs.existsSync(fallbackApps)) return fallbackApps;

      return direct;
    }

    return this.path?.resolve(resolved) || resolved;
  }

  public async scanDirectory(
    rootFolder: string,
    depth = 1,
    isDemoMode = false,
    vaultRoot?: string
  ): Promise<AppScanRecord[]> {
    if (isDemoMode) {
      return [...MOCK_APPS];
    }

    const resolvedRoot = this.resolvePath(rootFolder, vaultRoot);
    if (!this.fs || !this.path || !this.fs.existsSync(resolvedRoot)) {
      console.warn(`[AppScanner] Root directory does not exist: ${resolvedRoot}. Falling back to demo data.`);
      return [...MOCK_APPS];
    }

    const results: AppScanRecord[] = [];

    try {
      const entries = this.fs.readdirSync(resolvedRoot, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (entry.name.startsWith(".") || entry.name === "node_modules" || entry.name === "trash-bin") {
          continue;
        }

        const appPath = this.path.join(resolvedRoot, entry.name);
        const record = await this.inspectAppFolder(entry.name, appPath, depth);
        results.push(record);
      }
    } catch (err) {
      console.error(`[AppScanner] Failed to scan root ${resolvedRoot}:`, err);
      return [...MOCK_APPS];
    }

    return results;
  }

  private async inspectAppFolder(folderName: string, appPath: string, maxDepth: number): Promise<AppScanRecord> {
    const gitInfo = this.extractGitInfo(appPath);
    const hostingInfo = this.extractHostingInfo(appPath, gitInfo);
    const monorepoInfo = this.detectMonorepo(appPath);
    const catalogMeta = this.extractCatalogMeta(appPath);

    return {
      id: `app_${Buffer.from(appPath).toString("base64").replace(/[^a-zA-Z0-9]/g, "").slice(0, 16)}`,
      folderName,
      absolutePath: appPath,
      isMonorepoRoot: monorepoInfo.isMonorepo,
      monorepoPackages: monorepoInfo.packages,
      git: gitInfo,
      hosting: hostingInfo,
      catalog: catalogMeta,
    };
  }

  private extractCatalogMeta(appPath: string): AppCatalogMeta | undefined {
    if (!this.fs || !this.path) return undefined;

    const catalog: AppCatalogMeta = {};
    let found = false;

    // 1. Check index.md frontmatter
    const indexPath = this.path.join(appPath, "index.md");
    if (this.fs.existsSync(indexPath)) {
      try {
        const content = this.fs.readFileSync(indexPath, "utf8");
        const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
        if (fmMatch && fmMatch[1]) {
          const fm = fmMatch[1];
          found = true;

          // Title
          const titleMatch = fm.match(/^title:\s*(.+)$/m);
          if (titleMatch) catalog.title = titleMatch[1].trim().replace(/^["']|["']$/g, "");

          // Category (sector combined into category per user spec)
          const catMatch = fm.match(/^category:\s*(.+)$/m);
          const sectorMatch = fm.match(/^sector:\s*(.+)$/m);
          if (catMatch) {
            catalog.category = catMatch[1].trim().replace(/^["']|["']$/g, "");
          } else if (sectorMatch) {
            catalog.category = sectorMatch[1].trim().replace(/^["']|["']$/g, "");
          }

          // File Size
          const sizeMatch = fm.match(/^(?:file-size|fileSize):\s*(.+)$/m);
          if (sizeMatch) catalog.fileSize = sizeMatch[1].trim().replace(/^["']|["']$/g, "");

          // Badge
          const badgeMatch = fm.match(/^badge:\s*(.+)$/m);
          if (badgeMatch) catalog.badge = badgeMatch[1].trim().replace(/^["']|["']$/g, "");

          // Overview
          const overviewMatch = fm.match(/^overview:\s*(.+)$/m);
          if (overviewMatch) catalog.overview = overviewMatch[1].trim().replace(/^["']|["']$/g, "");

          // Thumbnail / Img
          const imgMatch = fm.match(/^(?:img|thumbnail):\s*(.+)$/m);
          if (imgMatch) {
            let rawImg = imgMatch[1].trim().replace(/^["']|["']$/g, "");
            // If obsidian format [[img-lightmode.webp]], extract first file
            const obsMatch = rawImg.match(/\[\[([^\]]+)\]\]/);
            if (obsMatch && obsMatch[1]) {
              rawImg = obsMatch[1].split(",")[0].trim();
            }
            catalog.img = rawImg;
          }

          // Tags: supports BOTH multi-line list (- tag) AND inline array ([tag1, tag2])
          const tagsBlockMatch = fm.match(/^tags:\s*\r?\n((?:\s*-\s*.+\r?\n?)+)/m);
          if (tagsBlockMatch && tagsBlockMatch[1]) {
            const tagLines = tagsBlockMatch[1].split("\n");
            catalog.tags = tagLines
              .map((l) => l.replace(/^\s*-\s*/, "").trim().replace(/^["']|["']$/g, ""))
              .filter((t) => t.length > 0);
          } else {
            const inlineTagsMatch = fm.match(/^tags:\s*\[(.*?)\]/m);
            if (inlineTagsMatch && inlineTagsMatch[1]) {
              catalog.tags = inlineTagsMatch[1]
                .split(",")
                .map((t) => t.trim().replace(/^["']|["']$/g, ""))
                .filter((t) => t.length > 0);
            }
          }
        }
      } catch (err) {
        console.warn(`[AppScanner] Error parsing index.md for ${appPath}:`, err);
      }
    }

    // 2. Check index_catalog.json or _catalog.json
    const jsonPath = this.path.join(appPath, "index_catalog.json");
    const rootCatalogPath = this.path.join(appPath, "_catalog.json");
    const targetJson = this.fs.existsSync(jsonPath) ? jsonPath : this.fs.existsSync(rootCatalogPath) ? rootCatalogPath : null;

    if (targetJson) {
      try {
        const raw = JSON.parse(this.fs.readFileSync(targetJson, "utf8"));
        const item = Array.isArray(raw) ? raw[0] : raw;
        if (item) {
          found = true;
          if (!catalog.title && item.title) catalog.title = item.title;
          if (!catalog.category && (item.category || item.sector)) catalog.category = item.category || item.sector;
          if (!catalog.fileSize && (item.fileSize || item["file-size"])) catalog.fileSize = item.fileSize || item["file-size"];
          if (!catalog.badge && item.badge) catalog.badge = item.badge;
          if (!catalog.overview && item.overview) catalog.overview = item.overview;
          if (!catalog.tags && Array.isArray(item.tags)) catalog.tags = item.tags;
          if (!catalog.img && (item.img || item.thumbnail)) catalog.img = item.img || item.thumbnail;
          if (item.linkLive) catalog.linkLive = item.linkLive;
          if (item.linkPlayground) catalog.linkPlayground = item.linkPlayground;
          if (item.linkGithub) catalog.linkGithub = item.linkGithub;
        }
      } catch (err) {
        console.warn(`[AppScanner] Error parsing catalog json for ${appPath}:`, err);
      }
    }

    // 3. Check for HTML endpoints
    const htmlIndex = this.path.join(appPath, "index.html");
    if (this.fs.existsSync(htmlIndex) && !catalog.linkLive) {
      catalog.linkLive = "index.html";
      found = true;
    }

    const htmlPlayground = this.path.join(appPath, "index_playground.html");
    if (this.fs.existsSync(htmlPlayground) && !catalog.linkPlayground) {
      catalog.linkPlayground = "index_playground.html";
      found = true;
    }

    return found ? catalog : undefined;
  }

  private extractGitInfo(appPath: string): GitInfo {
    const defaultInfo: GitInfo = {
      isRepo: false,
      isClean: true,
      uncommittedCount: 0,
      aheadCount: 0,
      behindCount: 0,
    };

    if (!this.fs || !this.path) return defaultInfo;

    const gitDir = this.path.join(appPath, ".git");
    if (!this.fs.existsSync(gitDir)) {
      return defaultInfo;
    }

    defaultInfo.isRepo = true;

    // 1. Read git config for remote url
    try {
      const configPath = this.path.join(gitDir, "config");
      if (this.fs.existsSync(configPath)) {
        const rawConfig = this.fs.readFileSync(configPath, "utf8");
        const urlMatch = rawConfig.match(/url\s*=\s*(.+)/);
        if (urlMatch && urlMatch[1]) {
          let remote = urlMatch[1].trim();
          remote = remote
            .replace(/^git@github\.com:/, "github.com/")
            .replace(/^https?:\/\//, "")
            .replace(/\.git$/, "");
          defaultInfo.remoteUrl = remote;
        }
      }
    } catch {}

    // 2. Read HEAD for current branch
    try {
      const headPath = this.path.join(gitDir, "HEAD");
      if (this.fs.existsSync(headPath)) {
        const headContent = this.fs.readFileSync(headPath, "utf8").trim();
        if (headContent.startsWith("ref: refs/heads/")) {
          defaultInfo.currentBranch = headContent.replace("ref: refs/heads/", "");
        } else {
          defaultInfo.currentBranch = `detached @ ${headContent.slice(0, 7)}`;
        }
      }
    } catch {}

    // 3. Quick porcelain status check
    try {
      if (this.cp?.execSync) {
        const out = this.cp
          .execSync("git status --porcelain", {
            cwd: appPath,
            encoding: "utf8",
            timeout: 1500,
            stdio: ["ignore", "pipe", "ignore"],
          })
          .trim();

        if (out) {
          const lines = out.split("\n").filter((l) => l.trim().length > 0);
          defaultInfo.uncommittedCount = lines.length;
          defaultInfo.isClean = lines.length === 0;
        } else {
          defaultInfo.isClean = true;
          defaultInfo.uncommittedCount = 0;
        }
      }
    } catch {
      defaultInfo.isClean = true;
    }

    return defaultInfo;
  }

  private extractHostingInfo(appPath: string, gitInfo: GitInfo): HostingInfo {
    const hosting: HostingInfo = {};
    if (!this.fs || !this.path) return hosting;

    // 1. Firebase detection via .firebaserc and firebase.json
    const rcPath = this.path.join(appPath, ".firebaserc");
    if (this.fs.existsSync(rcPath)) {
      try {
        const rcJson = JSON.parse(this.fs.readFileSync(rcPath, "utf8"));
        const defaultProj = rcJson.projects?.default || rcJson.projects?.production || "";
        const targetSites = rcJson.targets?.[defaultProj]?.hosting || {};
        const siteId = Object.keys(targetSites)[0] || defaultProj;

        let publicDir = "public";
        const jsonPath = this.path.join(appPath, "firebase.json");
        if (this.fs.existsSync(jsonPath)) {
          const fJson = JSON.parse(this.fs.readFileSync(jsonPath, "utf8"));
          if (fJson.hosting?.public) {
            publicDir = fJson.hosting.public;
          }
        }

        if (siteId) {
          const fbConfig: FirebaseHostConfig = {
            configured: true,
            siteId,
            project: defaultProj,
            publicDir,
            liveUrl: `https://${siteId}.web.app`,
            status: "live",
          };
          hosting.firebase = fbConfig;
        }
      } catch {}
    }

    // 2. GitHub Pages detection
    if (gitInfo.remoteUrl && gitInfo.remoteUrl.includes("github.com/")) {
      const parts = gitInfo.remoteUrl.replace("github.com/", "").split("/");
      if (parts.length >= 2) {
        const owner = parts[0];
        const repo = parts[1];
        const ghPagesConfig: GitHubPagesHostConfig = {
          configured: true,
          branch: "gh-pages",
          url: `https://${owner}.github.io/${repo}`,
          enabled: true,
        };
        hosting.githubPages = ghPagesConfig;
      }
    }

    return hosting;
  }

  private detectMonorepo(appPath: string): { isMonorepo: boolean; packages?: string[] } {
    if (!this.fs || !this.path) return { isMonorepo: false };

    const pnpmWorkspace = this.path.join(appPath, "pnpm-workspace.yaml");
    const lernaJson = this.path.join(appPath, "lerna.json");
    const packageJson = this.path.join(appPath, "package.json");

    if (this.fs.existsSync(pnpmWorkspace) || this.fs.existsSync(lernaJson)) {
      const packagesDir = this.path.join(appPath, "packages");
      let pkgs: string[] = [];
      if (this.fs.existsSync(packagesDir)) {
        try {
          pkgs = this.fs
            .readdirSync(packagesDir, { withFileTypes: true })
            .filter((d) => d.isDirectory())
            .map((d) => d.name);
        } catch {}
      }
      return { isMonorepo: true, packages: pkgs };
    }

    if (this.fs.existsSync(packageJson)) {
      try {
        const pkg = JSON.parse(this.fs.readFileSync(packageJson, "utf8"));
        if (pkg.workspaces) {
          return {
            isMonorepo: true,
            packages: Array.isArray(pkg.workspaces) ? pkg.workspaces : [],
          };
        }
      } catch {}
    }

    return { isMonorepo: false };
  }
}
