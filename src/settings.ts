import { SymlinkManagerSettings, DEFAULT_SYMLINK_SETTINGS } from './features/symlink/settings';
import { YTCaptureSettings, DEFAULT_YTCAPTURE_SETTINGS } from './features/ytd/types';
import { FolderSyncSettings, DEFAULT_FOLDER_SYNC_SETTINGS } from './features/scriptSync/types';

export interface PakCLILocalSettings extends 
    SymlinkManagerSettings, 
    YTCaptureSettings, 
    FolderSyncSettings 
{
    autoCheckDependencies?: boolean;
}

export const DEFAULT_LOCAL_SETTINGS: PakCLILocalSettings = {
    ...DEFAULT_SYMLINK_SETTINGS,
    ...DEFAULT_YTCAPTURE_SETTINGS,
    ...DEFAULT_FOLDER_SYNC_SETTINGS,
    autoCheckDependencies: true,
};
