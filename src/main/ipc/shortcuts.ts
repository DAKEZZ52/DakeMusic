import { globalShortcut, type BrowserWindow } from 'electron';
import { ipcRegistry } from './registry';
import { hideMainWindow, showMainWindow } from '../window';
import { restoreActiveWindowMode } from '../window/modeController';
import { toggleMiniPlayerWindow } from '../miniPlayer';
import type {
  ShortcutCommand,
  ShortcutMap,
  ShortcutRegistrationFailure,
  ShortcutRegistrationRequest,
  ShortcutRegistrationResult,
} from '../../shared/shortcuts';
import type { IpcContext } from './types';

let requestedShortcuts: ShortcutMap | null = null;
const appRegisteredAccelerators = new Set<string>();

let requestedLocalShortcuts: ShortcutMap | null = null;
let localShortcutsEnabled = false;
let localEditableSuspend = false;
const appRegisteredLocalAccelerators = new Set<string>();
let localShortcutFocusBound = false;

const unregisterAppShortcuts = () => {
  for (const accelerator of appRegisteredAccelerators) {
    globalShortcut.unregister(accelerator);
  }
  appRegisteredAccelerators.clear();
};

const unregisterLocalShortcuts = () => {
  for (const accelerator of appRegisteredLocalAccelerators) {
    globalShortcut.unregister(accelerator);
  }
  appRegisteredLocalAccelerators.clear();
};

const forwardToRenderer = (command: ShortcutCommand, getMainWindow: () => BrowserWindow | null) => {
  const win = getMainWindow();
  if (!win) return;
  if (command === 'toggleMainLyric') {
    showMainWindow();
  }
  win.webContents.send('shortcut-trigger', command);
};

const handleShortcutTrigger = (
  command: ShortcutCommand,
  getMainWindow: () => BrowserWindow | null,
  isEligible: (win: BrowserWindow | null) => boolean,
) => {
  if (!isEligible(getMainWindow())) return;
  if (command === 'toggleWindow') {
    const win = getMainWindow();
    if (!win) return;
    if (win.isVisible()) hideMainWindow();
    else void restoreActiveWindowMode();
    return;
  }
  if (command === 'toggleMiniPlayer') {
    void toggleMiniPlayerWindow();
    return;
  }
  forwardToRenderer(command, getMainWindow);
};

const registerAcceleratorMap = (
  shortcutMap: ShortcutMap,
  registeredSet: Set<string>,
  scope: 'local' | 'global',
  handleTrigger: (command: ShortcutCommand) => void,
  shouldRegister?: (accelerator: string) => boolean,
): ShortcutRegistrationResult => {
  const registered = {} as ShortcutMap;
  const failures: ShortcutRegistrationFailure[] = [];

  (Object.entries(shortcutMap) as Array<[ShortcutCommand, string]>).forEach(
    ([command, accelerator]) => {
      if (!accelerator) return;
      if (shouldRegister && !shouldRegister(accelerator)) return;
      try {
        const didRegister = globalShortcut.register(accelerator, () => handleTrigger(command));
        if (didRegister && globalShortcut.isRegistered(accelerator)) {
          registered[command] = accelerator;
          registeredSet.add(accelerator);
        } else {
          failures.push({ command, accelerator, scope, reason: 'conflict' });
        }
      } catch {
        failures.push({ command, accelerator, scope, reason: 'invalid' });
      }
    },
  );
  return { registered, failures };
};

const registerShortcuts = (
  shortcutMap: ShortcutMap,
  getMainWindow: () => BrowserWindow | null,
): ShortcutRegistrationResult => {
  unregisterAppShortcuts();
  requestedShortcuts = shortcutMap;
  return registerAcceleratorMap(shortcutMap, appRegisteredAccelerators, 'global', (command) =>
    handleShortcutTrigger(command, getMainWindow, () => true),
  );
};

// 无修饰键的独立按键（如 F5、Space）保留渲染层 keydown 处理，保留输入框守卫
const MODIFIER_ACCELERATOR_PATTERN = /CmdOrCtrl|Ctrl|Shift|Alt|Meta/i;

const registerLocalShortcuts = (
  shortcutMap: ShortcutMap,
  getMainWindow: () => BrowserWindow | null,
): ShortcutRegistrationResult => {
  unregisterLocalShortcuts();
  return registerAcceleratorMap(
    shortcutMap,
    appRegisteredLocalAccelerators,
    'local',
    (command) =>
      handleShortcutTrigger(command, getMainWindow, (win) =>
        Boolean(win && !win.isDestroyed() && win.isFocused()),
      ),
    (accelerator) => MODIFIER_ACCELERATOR_PATTERN.test(accelerator),
  );
};

const syncLocalShortcuts = (
  getMainWindow: () => BrowserWindow | null,
): ShortcutRegistrationResult | null => {
  if (!localShortcutsEnabled || !requestedLocalShortcuts) {
    unregisterLocalShortcuts();
    return null;
  }
  const win = getMainWindow();
  if (!win || win.isDestroyed()) {
    unregisterLocalShortcuts();
    return null;
  }
  // 输入框等可编辑上下文激活时暂停，让出输入法对 Ctrl+Space 等组合键的占用
  if (localEditableSuspend) {
    unregisterLocalShortcuts();
    return null;
  }
  // 仅主窗口聚焦时注册本地快捷键，失焦即注销，保证其他应用不被抢占
  if (win.isFocused()) {
    return registerLocalShortcuts(requestedLocalShortcuts, getMainWindow);
  }
  unregisterLocalShortcuts();
  return null;
};

export const registerShortcutHandlers = ({ getMainWindow }: IpcContext) => {
  ipcRegistry.registerHandler(
    'shortcuts:register',
    (_event, payload: ShortcutRegistrationRequest) => {
      let result: ShortcutRegistrationResult;
      if (!payload?.enabled) {
        unregisterAppShortcuts();
        requestedShortcuts = null;
        result = { registered: {} as ShortcutMap, failures: [] };
      } else {
        result = registerShortcuts(payload.shortcutMap, getMainWindow);
      }

      // 本地快捷键：Windows 下系统级注册以绕过输入法对 Ctrl+Space 等组合键的抢占，仅聚焦时生效
      requestedLocalShortcuts = payload.localShortcutMap ?? null;
      localShortcutsEnabled = Boolean(payload.localEnabled);
      const win = getMainWindow();
      if (win && !win.isDestroyed() && !localShortcutFocusBound) {
        localShortcutFocusBound = true;
        win.on('focus', () => syncLocalShortcuts(getMainWindow));
        win.on('blur', () => syncLocalShortcuts(getMainWindow));
        win.once('closed', () => {
          localShortcutFocusBound = false;
          unregisterLocalShortcuts();
        });
      }
      const localResult = syncLocalShortcuts(getMainWindow);
      if (localResult) {
        for (const failure of localResult.failures) {
          result.failures.push(failure);
        }
      }
      return result;
    },
  );

  ipcRegistry.registerHandler('shortcuts:refresh', () => {
    if (!requestedShortcuts) {
      return { registered: {} as ShortcutMap, failures: [] };
    }
    const result = registerShortcuts(requestedShortcuts, getMainWindow);
    syncLocalShortcuts(getMainWindow);
    return result;
  });

  ipcRegistry.registerHandler('shortcuts:set-local-editable-active', (_event, active: boolean) => {
    localEditableSuspend = Boolean(active);
    syncLocalShortcuts(getMainWindow);
  });
};
