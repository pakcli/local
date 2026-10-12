export type TaskbarSubwindowMode =
  | 'subwindows-collapse'   // change other subwindows aswell + can be join collpase with main
  | 'subwindows-separate'   // change other subwindows aswell
  | 'none';                 // none

export interface TaskbarSettings {
  taskbarIconPath: string;
  taskbarCustomAppId: string;
  taskbarSyncAppearance: boolean;
  taskbarSubwindowMode: TaskbarSubwindowMode;
}

export const DEFAULT_TASKBAR_SETTINGS: TaskbarSettings = {
  taskbarIconPath: '',
  taskbarCustomAppId: '',
  taskbarSyncAppearance: true,
  taskbarSubwindowMode: 'subwindows-collapse',
};

export interface ElectronAppDetails {
  appId?: string;
  appIconPath?: string;
  relaunchCommand?: string;
  relaunchDisplayName?: string;
}

export interface ElectronRemoteWindow {
  id?: number;
  setAppDetails(options: ElectronAppDetails): void;
}

export interface TaskbarApplyResult {
  success: boolean;
  message: string;
  appId?: string;
  iconPath?: string;
}
