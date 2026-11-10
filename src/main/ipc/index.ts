import { ipcRegistry } from './registry';
import { registerApiServerHandlers } from './server';
import { registerWindowHandlers } from './window';
import { registerPlayerIpc } from './player';
import { registerSettingsHandlers } from './settings';
import { registerShortcutHandlers } from './shortcuts';
import { registerTrayHandlers } from './tray';
import { registerDesktopLyricHandlers } from '../desktopLyric';
import { registerMainWindowPreferenceHandlers } from '../window';
import { registerMiniPlayerHandlers } from '../miniPlayer';
import { registerObsOverlayHandlers } from '../obsOverlay';
import { registerNowPlayingHandlers } from '../nowPlaying';
import { registerExternalHandlers } from './external';
import { registerStorageHandlers } from './storage';
import { registerShareHandlers } from './share';
import { registerDiagnosticsHandlers } from './diagnostics';
import { registerCloudHandlers } from './cloud';
import { registerSettingsBackupHandlers } from './settingsBackup';
import { registerRecognizeHandlers } from './recognize';
import { registerDownloadHandlers } from '../download';
import { registerSeparatorHandlers } from '../separator';
import { registerLocalMusicHandlers } from './localMusic';
import { registerChorusHandlers } from './chorus';
import type { IpcContext } from './types';

let registered = false;

export const registerIpcHandlers = (context: IpcContext) => {
  if (registered) return;
  registerWindowHandlers(context);
  registerMainWindowPreferenceHandlers();
  registerApiServerHandlers();
  registerPlayerIpc(context.playerRef);
  registerSettingsHandlers(context);
  registerShortcutHandlers(context);
  registerTrayHandlers();
  registerNowPlayingHandlers(context);
  registerDesktopLyricHandlers();
  registerMiniPlayerHandlers();
  registerObsOverlayHandlers();
  registerExternalHandlers();
  registerStorageHandlers();
  registerShareHandlers();
  registerDiagnosticsHandlers();
  registerCloudHandlers(context);
  registerSettingsBackupHandlers();
  registerRecognizeHandlers();
  registerDownloadHandlers(context);
  registerSeparatorHandlers(context);
  registerLocalMusicHandlers();
  registerChorusHandlers();
  registered = true;
};

export const unregisterIpcHandlers = () => {
  ipcRegistry.unregisterAll();
  registered = false;
};
