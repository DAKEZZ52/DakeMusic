# Desktop packaging dependencies

The renderer, desktop lyrics, and plugin window are bundled by Vite. Packages
used only by those entry points belong in the root `devDependencies`: their
runtime code is already included in `dist`. This includes Vue and the Vue API
exposed to plugins by the host.

electron-builder also collects production `node_modules`, even when `build.files`
only lists `dist` and `dist-electron`. Putting renderer-only packages in root
`dependencies` therefore ships an additional, unused copy of their source trees.

Keep main-process and preload dependencies in `dependencies`. In particular,
`font-list` and `music-metadata` are external in `vite.config.mts` and must remain
available at runtime. This optimization intentionally leaves the other
main-process dependencies in place, including updater and logging support.

`ieee754` (used by `music-metadata` through `token-types`) and `ms` (used by
`debug`) are explicit production dependencies as a packaging workaround. With
the current pnpm/electron-builder dependency collector, the comparison package
omitted these shared transitive dependencies. Keep them explicit until a packaged
dependency-resolution check confirms that the collector includes them reliably.

Before moving another dependency:

1. Check imports and dynamic loading in main, preload, shared code, and plugin
   host APIs, not just the main renderer.
2. Run `pnpm exec vue-tsc --noEmit` and `pnpm exec vite build`.
3. Inspect the generated main/preload imports and the packaged ASAR. Verify that
   external runtime packages are present and renderer-only source trees are absent.
4. Compare packages built from the same renderer/native artifacts, architecture,
   server dependencies, signing settings, and archive format. Report compressed
   archive size separately from installed application size.

The server submodule has its own runtime dependencies. CI replaces its pnpm
workspace links with an npm production install before packaging. When preparing
local comparison builds, use an equivalent flat production dependency directory;
copying workspace symlinks through `extraResources` can create broken links.

Bundled third-party code still has license obligations when its package is a
development dependency. Keep `LICENSES` and `THIRD_PARTY_NOTICES.md` in the package.

## Electron upgrade regression checks

Windows background effects depend on Electron's compositor internals, not just
whether the native API returns success. Before shipping an Electron upgrade:

1. On Windows 10 and early Windows 11 (builds below 22621), both clear and frost
   use `transparent: true`, without a constructor background material. Entering
   or leaving effects requires restart; clear/frost switches are live. Verify
   saved tint/opacity and restoration of native frame behavior after selecting
   off and restarting. Both effects have the disclosed native snap/animation
   limitations. Rebuild the platform addon for modes 10/11: they enable/clear
   Accent without resetting Electron's DWM alpha or margins. Older addons must
   fail explicitly. Test clear → frost → clear, drag/resize suspension and restore,
   cold starts, show/hide and fullscreen on actual Windows.
2. On Windows 11 22H2+, verify clear remains unblurred after theme changes,
   zoom, resize, maximize/restore and page reload. Electron prepares its surface
   as Acrylic, then native mode 5 sets the DWM backdrop to `NONE` and enables DWM alpha. Repeated
   updates must not re-enable blur; leaving clear must reset both states.
3. Check window animations, edge resizing, native controls and lyric-page button
   contrast, including light theme. Test a nonzero clear transparency setting.
4. Verify missing/outdated native addons and failed composition calls fall back
   to a solid background with a message. Repeat with system transparency disabled,
   energy-saving settings and remote desktop where available; record OS build,
   Electron version and visible results separately from API success.

Review `native/echo-platform-adaptor/README.md` alongside Electron's constructor,
`IsTranslucent`, `ShouldWindowContentsBeTransparent` and `SetBackgroundMaterial`
implementations. Automated state tests and cross-compilation do not replace these
Windows visual checks. `thickFrame` is a Windows-only option in Electron 43.6.0;
Linux resize behavior must be tested through its actual frame/WCO/compositor path.

## Size comparison (2026-09-07)

Local macOS arm64 comparison for 2.3.1-beta.25 / Electron 43.6.0, using identical
renderer/main/preload artifacts and native binaries, the same temporary flat
server production install, ad-hoc signing, and electron-builder's ZIP target:

| Measurement                    |     Before |      After |         Reduction |
| ------------------------------ | ---------: | ---------: | ----------------: |
| ZIP download                   | 128.59 MiB | 124.88 MiB |   3.71 MiB (2.9%) |
| Application regular-file bytes | 337.74 MiB | 316.67 MiB |  21.07 MiB (6.2%) |
| app.asar                       |  29.78 MiB |   8.71 MiB | 21.07 MiB (70.8%) |

Application size above excludes symlinks and filesystem allocation overhead;
it is not a `du` measurement. Results include the two explicit transitive runtime
dependencies noted above. No dependency versions were upgraded.

Validation: TypeScript checking and Vite production builds passed; the root
lockfile passed an isolated offline frozen-lockfile check. The optimized ASAR
omits all 13 renderer-only package directories, resolves the nine declared runtime
dependencies and generated static main/preload imports, loads `font-list`, and
parses a WAV with the packaged `music-metadata`. App code and native binaries
match the comparison package byte for byte. Full application interaction and
Windows/Linux packaging were not tested in this comparison.

## Native platform addon

Windows additionally builds `native/echo-platform-adaptor` for DWM background
composition and taskbar previews. Its `.node` file is listed in `win.extraResources`
and verified by the release workflow. It is not a dependency of
`echo-media-controls` and is not packaged on macOS/Linux. See
[window shell build instructions](../native/echo-platform-adaptor/README.md).

When a packaged Windows build still appears opaque, collect `复制窗口诊断信息`
from Appearance settings before changing the compositor implementation again.
Include whether Acrylic works and the visible result. Rebuild the platform addon
for native DWM/Accent readback; an older binary produces a partial report with
`nativeDiagnosticsAvailable: false`. API acceptance, readback and visible output
are distinct observations and must not be reported as interchangeable test results.

## Windows Authenticode signing

当前状态（2026-11-10）：产物**没有** Authenticode 签名。

`Get-AuthenticodeSignature release\win-unpacked\DakeMusic.exe` 返回 `NotSigned`。
构建日志里的 `signing with signtool.exe` 是 electron-builder 26 的固定文案：设置
`win.signAndEditExecutable` 后，即使没有证书它也会走这一步，但只改写版本资源，
不会产生签名。不要把这条日志当成「已经签好了」。

`pnpm sign:doctor`（即 `scripts/check-code-signing.mjs`）会在打包前打印是否具备签名条件，
`build:win` 已接入；它只提示、不阻断构建。

### 让产物真正被签名

三种可行路径：

| 方案 | 成本 | 用户端表现 |
|---|---|---|
| OV / EV 代码签名证书 | 约 ¥1000–3000/年，需实名或企业资料 | EV 免 SmartScreen 冷启动提示；OV 需积累信誉 |
| Azure Trusted Signing | 约 $9.99/月，需 Azure 账号 + 身份验证 | 等同 OV，按次计费 |
| 自签名证书 | 免费 | 仅内部分发有效，公开分发仍提示「未知发布者」 |

拿到 `.pfx` 后二选一：

```bat
:: 方式一：环境变量（CI 与本地都适用，推荐，证书不进仓库）
set CSC_LINK=D:\certs\dakemusic.pfx
set CSC_KEY_PASSWORD=证书密码
pnpm build:win
```

```json
// 方式二：写进 package.json 的 build.win（证书路径不要提交）
{
  "certificateFile": "D:\\certs\\dakemusic.pfx",
  "signingHashAlgorithms": ["sha256"],
  "rfc3161TimeStampServer": "http://timestamp.digicert.com"
}
```

哈希算法与 RFC3161 时间戳已经在 `package.json` 里配好；缺少证书时会静默跳过签名，
不会让构建失败。

### 为什么仍然要做「非 Authenticode」的完整性校验

Authenticode 解决的是「Windows 认不认发布者」，不能覆盖所有分发场景（免安装版、
被二次打包、更新包被替换）。所以项目另外做了两层，二者互补、不能互相替代：

- Ed25519 更新清单签名（`scripts/sign-update-manifest.mjs` → `latest.yml.sig`），安装前校验；
- 构建标识 `X-Dake-Build`，服务端只放行官方构建。
