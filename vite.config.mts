import { defineConfig } from 'vite';
import { readFileSync, existsSync } from 'node:fs';
import type { Plugin } from 'vite';
import { CONTENT_SECURITY_POLICY } from './src/shared/csp';

// LyriseMusic: 构建标识 + Ed25519 签名
// 私钥只在打包机（.keys/build-ed25519.pem），服务器只存公钥；
// 改过的包无法伪造签名，服务端据此拒绝非官方构建。
const pkgVersion = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version;
const buildStamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+$/, '').slice(0, 13);
const buildChannel = process.env.BETA ? 'beta' : 'release';

function buildSignedTag(): string {
  const base = `v=${pkgVersion};b=${buildStamp};ch=${buildChannel}`;
  const keyPath = process.env.DAKE_BUILD_KEY_PATH || resolve(__dirname, '.keys/build-ed25519.pem');
  try {
    if (!existsSync(keyPath)) {
      // 没有私钥：标成 dev，服务端会拒绝（开发构建本就不该连生产）
      console.warn('[build] 未找到签名私钥，构建标识降级为 dev:', keyPath);
      return `v=${pkgVersion};b=${buildStamp};ch=dev`;
    }
    const { createPrivateKey, sign } = require('node:crypto') as typeof import('node:crypto');
    const key = createPrivateKey(readFileSync(keyPath));
    const sig = sign(null, Buffer.from(base), key).toString('base64url');
    return `${base};sig=${sig}`;
  } catch (error) {
    console.warn('[build] 签名失败，构建标识降级为 dev:', error);
    return `v=${pkgVersion};b=${buildStamp};ch=dev`;
  }
}

// 生产构建注入 CSP meta：file:// 页面拿不到响应头，只能靠 meta
function cspPlugin(): Plugin {
  return {
    name: 'dake-csp',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html: string) {
        const meta = `    <meta http-equiv="Content-Security-Policy" content="${CONTENT_SECURITY_POLICY}" />\n`;
        return html.replace(/<head([^>]*)>/, (match) => match + '\n' + meta);
      },
    },
  };
}

const buildDefines = {
  __DAKE_BUILD_TAG__: JSON.stringify(buildSignedTag()),
};
import vue from '@vitejs/plugin-vue';
import electron from 'vite-plugin-electron';
import renderer from 'vite-plugin-electron-renderer';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'path';
import { mkdirSync, writeFileSync } from 'fs';

const analyzeBundle = process.env.ANALYZE_BUNDLE === '1';
const bundleAnalysisPlugin = () => ({
  name: 'dake-bundle-analysis',
  generateBundle(
    _options: unknown,
    bundle: Record<string, { type: string; code?: string; source?: unknown }>,
  ) {
    if (!analyzeBundle) return;

    const assets = Object.entries(bundle)
      .map(([fileName, item]) => {
        const size =
          item.type === 'chunk'
            ? Buffer.byteLength(item.code ?? '', 'utf8')
            : typeof item.source === 'string'
              ? Buffer.byteLength(item.source, 'utf8')
              : item.source instanceof Uint8Array
                ? item.source.byteLength
                : 0;
        return { fileName, type: item.type, size };
      })
      .sort((a, b) => b.size - a.size);

    mkdirSync('release', { recursive: true });
    writeFileSync(
      'release/bundle-report.json',
      JSON.stringify({ generatedAt: new Date().toISOString(), assets }, null, 2),
    );
  },
});

export default defineConfig({
  define: buildDefines,
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        desktopLyric: resolve(__dirname, 'desktop-lyric.html'),
      },
    },
  },
  plugins: [
    cspPlugin(),
    vue(),
    tailwindcss(),
    bundleAnalysisPlugin(),
    electron([
      {
        entry: 'src/main/index.ts',
        onstart(options) {
          options.startup(['.', '--no-sandbox', '--no-stdio-init']);
        },
        vite: {
          define: buildDefines,
          build: {
            outDir: 'dist-electron/main',
            emptyOutDir: true,
            rollupOptions: {
              external: [
                'electron',
                'font-list',
                'music-metadata',
                'taglib-wasm',
                // onnxruntime-node（人声/伴奏分离）在 dist/binding.js 里用相对路径
                // require 自身原生绑定 ../bin/napi-v6/<platform>/<arch>/onnxruntime_binding.node，
                // 必须外置，否则内联进 bundle 后会到 dist-electron/ 下找而报 Cannot find module。
                'onnxruntime-node',
                '../../native/lyrise-audio-capture',
                '../../native/lyrise-media-controls',
                '../../native/lyrise-platform-adaptor',
                '../../native/lyrise-audio-player',
                '../../native/lyrise-sqlite-store',
              ],
            },
          },
        },
      },
      {
        entry: 'src/preload/index.ts',
        onstart(options) {
          options.reload();
        },
        vite: {
          build: {
            outDir: 'dist-electron/preload', // 明确预加载脚本输出目录
            emptyOutDir: true,
          },
        },
      },
    ]),
    renderer(),
  ].filter(Boolean),
  server: {
    // dev 模式下 API 请求通过 IPC 直连 main 进程，不再需要 HTTP proxy
    watch: {
      ignored: ['**/.planning/**'],
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src/renderer'),
    },
    extensions: ['.ts', '.tsx', '.mts', '.js', '.jsx', '.mjs', '.json', '.vue'],
  },
});
