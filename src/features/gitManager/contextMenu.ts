import { Menu, Notice, TAbstractFile, TFile, TFolder } from 'obsidian';
import type PakCLILocalPlugin from '../../main';
import { AreaResolver } from './services/AreaResolver';
import { GitCliService } from './services/GitCliService';
import { SnapshotEngine } from './services/SnapshotEngine';
import { DiffAiFormatter } from './services/DiffAiFormatter';
import { RepoAssignModal } from './ui/RepoAssignModal';
import { SnapshotModal } from './ui/SnapshotModal';
import { FileHistoryModal } from './ui/FileHistoryModal';
import { GitManagerModal } from './ui/GitManagerModal';
import { RepoInfo, RepoStatus } from './types';

export function registerGitContextMenu(plugin: PakCLILocalPlugin): void {
  plugin.registerEvent(
    plugin.app.workspace.on('file-menu', (menu: Menu, file: TAbstractFile) => {
      if (!(file instanceof TFolder) && !(file instanceof TFile)) return;

      // Synchronously resolve area so menu items are immediately added to the DOM
      const area = AreaResolver.resolve(plugin.app, file);
      const repoPath = area.gitRootPath || area.areaFolderPath;
      const repoConfig = plugin.settings.gitManager?.repoConfigs?.[repoPath];
      const isGitHub = repoConfig?.mode === 'github';

      menu.addSeparator();

      // ═════════════════════════════════════════════════════════════════════
      // 1. FOLDER CONTEXT MENU
      // ═════════════════════════════════════════════════════════════════════
      if (file instanceof TFolder) {
        menu.addItem((item) => {
          item
            .setTitle(
              area.isGitRepo
                ? `PakCLI Git: Reconfigure Repo (${area.areaFolderName})...`
                : `PakCLI Git: Manage This Folder as Repo...`
            )
            .setIcon('git-branch')
            .onClick(() => {
              new RepoAssignModal(plugin.app, plugin, area).open();
            });
        });

        if (area.isGitRepo) {
          menu.addItem((item) => {
            item
              .setTitle(`PakCLI Git: Snapshot Folder (${area.areaFolderName})`)
              .setIcon('camera')
              .onClick(async () => {
                const info: RepoInfo = {
                  name: area.areaFolderName,
                  absPath: repoPath,
                  isSymlink: false,
                  currentBranch: await GitCliService.getCurrentBranch(repoPath),
                  status: RepoStatus.Clean,
                  aheadBehind: { ahead: 0, behind: 0 },
                  snapshotCount: 0,
                  stagedFiles: [],
                  unstagedFiles: [],
                  untrackedFiles: [],
                };
                new SnapshotModal(
                  plugin.app,
                  info,
                  plugin.settings.gitManager?.includeUntracked ?? false,
                  plugin.settings.gitManager?.retentionCount ?? 20
                ).open();
              });
          });

          if (isGitHub) {
            menu.addItem((item) => {
              item
                .setTitle('PakCLI Git: Push to GitHub')
                .setIcon('upload-cloud')
                .onClick(async () => {
                  try {
                    await SnapshotEngine.createSnapshot(repoPath, 'safety checkpoint before push');
                    new Notice('⏳ Pushing to GitHub…');
                    await GitCliService.push(repoPath);
                    new Notice('✅ Successfully pushed to GitHub!');
                  } catch (err) {
                    new Notice(`❌ Push failed: ${err instanceof Error ? err.message : String(err)}`);
                  }
                });
            });

            menu.addItem((item) => {
              item
                .setTitle('PakCLI Git: Pull from GitHub')
                .setIcon('download-cloud')
                .onClick(async () => {
                  try {
                    await SnapshotEngine.createSnapshot(repoPath, 'safety checkpoint before pull');
                    new Notice('⏳ Pulling from GitHub…');
                    await GitCliService.pull(repoPath);
                    new Notice('✅ Successfully pulled from GitHub!');
                  } catch (err) {
                    new Notice(`❌ Pull failed: ${err instanceof Error ? err.message : String(err)}`);
                  }
                });
            });
          }

          menu.addItem((item) => {
            item
              .setTitle('PakCLI Git: Open in Git Sentinel')
              .setIcon('layout-dashboard')
              .onClick(() => {
                new GitManagerModal(plugin.app, plugin, repoPath).open();
              });
          });
        }
      }

      // ═════════════════════════════════════════════════════════════════════
      // 2. FILE CONTEXT MENU
      // ═════════════════════════════════════════════════════════════════════
      if (file instanceof TFile) {
        menu.addItem((item) => {
          item
            .setTitle(
              area.isGitRepo
                ? `PakCLI Git: Manage Area Repo (${area.areaFolderName})...`
                : `PakCLI Git: Manage This Area as Repo (${area.areaFolderName})...`
            )
            .setIcon('git-branch')
            .onClick(() => {
              new RepoAssignModal(plugin.app, plugin, area).open();
            });
        });

        if (area.isGitRepo && area.relativeFilePath) {
          const relPath = area.relativeFilePath;

          menu.addItem((item) => {
            item
              .setTitle(`PakCLI Git: Snapshot This Note Only`)
              .setIcon('camera')
              .onClick(async () => {
                try {
                  const snap = await SnapshotEngine.createSnapshot(
                    repoPath,
                    `file snapshot of ${file.name}`
                  );
                  new Notice(`✅ Snapshot created: ${snap.label}`);
                } catch (err) {
                  new Notice(`❌ Failed: ${err instanceof Error ? err.message : String(err)}`);
                }
              });
          });

          menu.addItem((item) => {
            item
              .setTitle(`PakCLI Git: View Note Commit History`)
              .setIcon('history')
              .onClick(() => {
                new FileHistoryModal(plugin.app, repoPath, relPath).open();
              });
          });

          menu.addItem((item) => {
            item
              .setTitle(`PakCLI Git: Copy Note Diff for AI`)
              .setIcon('copy')
              .onClick(async () => {
                try {
                  const diff = await GitCliService.getFileDiff(repoPath, relPath);
                  const text = DiffAiFormatter.formatAiDiff(
                    area.areaFolderName,
                    repoPath,
                    await GitCliService.getCurrentBranch(repoPath),
                    diff,
                    `File: ${relPath}`
                  );
                  await DiffAiFormatter.copyTextToClipboard(text, `📋 Copied diff for ${file.name}!`);
                } catch (err) {
                  new Notice(`❌ Failed to copy diff: ${err instanceof Error ? err.message : String(err)}`);
                }
              });
          });

          menu.addItem((item) => {
            item
              .setTitle('PakCLI Git: Open Containing Repo in Git Sentinel')
              .setIcon('layout-dashboard')
              .onClick(() => {
                new GitManagerModal(plugin.app, plugin, repoPath).open();
              });
          });
        }
      }
    })
  );
}
