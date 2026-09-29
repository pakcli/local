import { SymlinkManagerSettings, DEFAULT_SYMLINK_SETTINGS } from './features/symlink/settings';
import { YTCaptureSettings, DEFAULT_YTCAPTURE_SETTINGS } from './features/ytd/types';
import { FolderSyncSettings, DEFAULT_FOLDER_SYNC_SETTINGS } from './features/scriptSync/types';
import { CopyPasteSettings, DEFAULT_COPYPASTE_SETTINGS } from './features/copypaste/types';
import { GitManagerSettings, DEFAULT_GIT_MANAGER_SETTINGS } from './features/gitManager/types';

export interface PakCLILocalSettings extends 
    SymlinkManagerSettings, 
    YTCaptureSettings, 
    FolderSyncSettings,
    CopyPasteSettings 
{
    autoCheckDependencies?: boolean;
    gitManager?: GitManagerSettings;
}

export const DEFAULT_LOCAL_SETTINGS: PakCLILocalSettings = {
    ...DEFAULT_SYMLINK_SETTINGS,
    ...DEFAULT_YTCAPTURE_SETTINGS,
    ...DEFAULT_FOLDER_SYNC_SETTINGS,
    ...DEFAULT_COPYPASTE_SETTINGS,
    autoCheckDependencies: true,
    gitManager: { ...DEFAULT_GIT_MANAGER_SETTINGS },
};
