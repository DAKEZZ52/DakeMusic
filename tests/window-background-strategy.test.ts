import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveWindowBackgroundCapabilities } from '../src/shared/windowBackgroundStrategy.ts';

test('Windows 11 uses native acrylic; older builds depend on accent availability', () => {
  assert.deepEqual(resolveWindowBackgroundCapabilities({ platform: 'win32', build: 22621 }), {
    strategy: 'default',
    supportsFrost: true,
    frostBackend: 'acrylic',
    frostMode: 'native',
    frostLive: true,
    live: true,
    transparentMode: 'layered',
  });
  assert.deepEqual(
    resolveWindowBackgroundCapabilities({ platform: 'win32', build: 19045 }),
    {
      strategy: 'default',
      supportsFrost: false,
      frostBackend: 'none',
      frostMode: 'none',
      frostLive: true,
      live: true,
      transparentMode: 'layered',
    },
  );
  assert.deepEqual(
    resolveWindowBackgroundCapabilities({
      platform: 'win32',
      build: 19045,
      windowsAccentAvailable: true,
    }),
    {
      strategy: 'default',
      supportsFrost: true,
      frostBackend: 'accent-acrylic',
      frostMode: 'native',
      frostLive: true,
      live: true,
      transparentMode: 'layered',
    },
  );
});

test('macOS always reports vibrancy without live toggling', () => {
  assert.deepEqual(resolveWindowBackgroundCapabilities({ platform: 'darwin', build: 0 }), {
    strategy: 'default',
    supportsFrost: true,
    frostBackend: 'vibrancy',
    frostMode: 'native',
    frostLive: true,
    live: false,
    transparentMode: 'layered',
  });
});
