/**
 * Window-background behavior selected by the host desktop/compositor.
 *
 * Keep backend detection and capabilities in this module so adding another
 * compositor later does not spread platform checks through the renderer and
 * the main window implementation.
 */
export type WindowBackgroundStrategyId = 'default';

export type WindowBackgroundTransparentMode = 'layered' | 'pure';

export type WindowBackgroundFrostMode = 'none' | 'native' | 'compositor';

export type WindowBackgroundFrostBackend =
  | 'none'
  | 'vibrancy'
  | 'acrylic'
  | 'accent-acrylic'
  | 'blur-behind';

export interface WindowBackgroundCapabilities {
  strategy: WindowBackgroundStrategyId;
  supportsFrost: boolean;
  frostBackend: WindowBackgroundFrostBackend;
  frostMode: WindowBackgroundFrostMode;
  /** Whether the selected frost implementation can switch without relaunch. */
  frostLive: boolean;
  /** Whether entering/leaving an enabled background mode can switch live. */
  live: boolean;
  transparentMode: WindowBackgroundTransparentMode;
}

export function resolveWindowBackgroundCapabilities({
  platform,
  build,
  windowsAccentAvailable = false,
}: {
  platform: string;
  build: number;
  windowsAccentAvailable?: boolean;
}): WindowBackgroundCapabilities {
  if (platform === 'win32') {
    const supportsFrost = build >= 22621 || windowsAccentAvailable;
    return {
      strategy: 'default',
      supportsFrost,
      frostBackend: supportsFrost ? (build >= 22621 ? 'acrylic' : 'accent-acrylic') : 'none',
      frostMode: supportsFrost ? 'native' : 'none',
      frostLive: true,
      live: true,
      transparentMode: 'layered',
    };
  }

  if (platform === 'darwin') {
    return {
      strategy: 'default',
      supportsFrost: true,
      frostBackend: 'vibrancy',
      frostMode: 'native',
      frostLive: true,
      live: false,
      transparentMode: 'layered',
    };
  }

  return {
    strategy: 'default',
    supportsFrost: false,
    frostBackend: 'none',
    frostMode: 'none',
    frostLive: false,
    live: false,
    transparentMode: 'layered',
  };
}
