import type PakCLILocalPlugin from '../../main';
import { GitManager } from './GitManager';

export function registerGitManager(plugin: PakCLILocalPlugin): GitManager {
  const manager = new GitManager(plugin.app, plugin);
  manager.init();
  return manager;
}

export * from './types';
export * from './constants';
export { GitManager } from './GitManager';
export { GitManagerModal } from './ui/GitManagerModal';
export { renderGitManagerSettings } from './settings';
