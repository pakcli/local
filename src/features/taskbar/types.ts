export interface TaskbarSettings {
  taskbarIconPath: string;
  taskbarCustomAppId: string;
  taskbarSyncAppearance: boolean;
}

export const DEFAULT_TASKBAR_SETTINGS: TaskbarSettings = {
  taskbarIconPath: '',
  taskbarCustomAppId: '',
  taskbarSyncAppearance: true,
};

export interface ElectronAppDetails {
  appId?: string;
  appIconPath?: string;
  relaunchCommand?: string;
  relaunchDisplayName?: string;
}

export interface ElectronRemoteWindow {
  setAppDetails(options: ElectronAppDetails): void;
}

export interface TaskbarApplyResult {
  success: boolean;
  message: string;
  appId?: string;
  iconPath?: string;
}
