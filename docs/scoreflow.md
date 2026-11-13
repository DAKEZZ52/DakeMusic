# 扒谱模块（ScoreFlow）

把音频转成简谱：音符、时值、小节、和弦、歌词逐字对齐，全部在本机跑。

## 链路

```
views/Score.vue（页面）
  └─ window.electron.scoreflow.transcribe(pcm, options)      preload 暴露
       └─ main/scoreflow/index.ts  IPC 注册与入参校验
            └─ main/scoreflow/engine.ts  定位引擎、写临时 WAV、spawn、读 score.json
                 └─ ScoreFlow（Python 侧车）  separation → melody → beats → chords → lyrics → quantize → render
```

关键技术点：

- **PCM 传单声道 `Float32Array`**，不要套进普通对象里。preload 的 `toPlainIpcPayload`
  对顶层 `ArrayBuffer` 视图是直接透传的，套进对象会被 `JSON.stringify` ——
  一首 3 分钟的歌 800 万个采样点，序列化会产生上百 MB 的中间字符串。
- **进度走 stderr**：引擎用 `--emit-progress` 输出 `@@PROGRESS|阶段|0..1`，
  主进程逐行解析并按 120ms 节流后发 IPC。
- **同时只允许一个任务**：`engine.ts` 里的 `activeJob` 保证互斥，`cancel()` 直接 kill 子进程。
- **结果从文件读**：引擎在临时目录写 `score.json`，主进程读回来解析成 `ScoreDoc`，
  stdout 只用于丢弃。

## 引擎定位顺序

`main/scoreflow/engine.ts` 的 `resolveEngine()`：

1. 环境变量 `SCOREFLOW_PYTHON`（开发/调试用）
2. `userData/scoreflow/scoreflow.exe`（打包后可由启动器单独下发/更新）
3. `resources/scoreflow/scoreflow.exe`（随安装包 `extraResources` 下发）
4. 同级 ScoreFlow 项目的 `.venv/Scripts/python.exe`（开发形态）

第 4 条要求 `E:\01-项目开发\ScoreFlow` 与播放器仓库同级，且已 `uv pip install -e ".[full]"`。

## 开发期跑通

```powershell
# 1. 准备引擎（一次性）
cd ..\ScoreFlow
uv venv --python 3.11 .venv
uv pip install -e ".[full]"
$env:HF_ENDPOINT="https://hf-mirror.com"    # 首次下 demucs 权重

# 2. 启播放器
cd ..\DakeMusic
pnpm dev

# 3. 标题栏「…」→「扒谱」
```

## 打包注意

- 引擎用 PyInstaller 打 `--onedir`（不要 `--onefile`，首次解压太慢），产物放
  `extraResources` 的 `scoreflow/` 目录；
- demucs / whisper 的模型权重**不要**打进包（体积翻十倍），首次使用时下载到
  `userData/scoreflow/models`；
- 打包后 `resolveEngine()` 会命中第 2 或第 3 条，不需要用户装 Python。

## 与「人声分离」的关系

两者都用到人声分离，但目的不同：

| | 用途 | 实现 |
|---|---|---|
| 人声分离页 | 导出人声/伴奏 WAV 给用户 | MDX-Net ONNX，主进程内推理 |
| 扒谱 | 分离只是为了喂给音高检测和和弦识别 | demucs，Python 侧车内部跑 |

没有合并成一个管线，是因为分离页的输出要落盘给用户、扒谱的分离结果只活在临时目录里，
生命周期和失败处理都不一样。后续如果嫌重复，可以让扒谱在没有 Python 环境时回退调用
主进程的 MDX 分离（此时引擎只做音高/和弦/量化）。
