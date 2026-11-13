/**
 * LyriseMusic 扒谱引擎桥
 * 文件：engine.ts
 * 描述：定位并调用本地 ScoreFlow 引擎（Python 侧车或打包后的可执行文件），
 *      负责写临时 WAV、转发进度、读回 score.json、清理临时目录。
 * 版权：Copyright © 2026 Dake（知之Dake）. All Rights Reserved.
 */
import { app } from 'electron';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { encodeWav } from '../separator/wav';
import type {
  ScoreDoc,
  ScoreEngineStatus,
  ScoreOptions,
  ScorePcmInput,
  ScoreProgress,
  ScoreResult,
} from '../../shared/scoreflow';

/** 一次扒谱任务最多跑多久（毫秒）。3 分钟的歌在纯 CPU 上约 4 分钟，给足余量。 */
const JOB_TIMEOUT_MS = 30 * 60 * 1000;
/** 探测引擎版本的超时。 */
const PROBE_TIMEOUT_MS = 15_000;

interface EngineHandle {
  /** 可执行文件（python.exe 或打包后的 scoreflow.exe）。 */
  runtime: string;
  /** 传给 runtime 的前置参数（python 需要 -m scoreflow.cli）。 */
  prefix: string[];
  /** 引擎根目录（spawn 的 cwd）。 */
  root: string;
}

/** 当前正在跑的进程（同一时间只允许一个扒谱任务）。 */
let activeJob: { child: ChildProcessWithoutNullStreams; cancelled: boolean } | null = null;
let jobSeq = 0;

/**
 * 定位引擎。顺序：环境变量 → 用户数据目录（打包内置）→ resources（打包内置）
 * → 开发期内置的 ScoreFlow 项目。
 */
function resolveEngine(): EngineHandle | { error: string } {
  const exeName = process.platform === 'win32' ? 'scoreflow.exe' : 'scoreflow';

  const envPython = process.env.SCOREFLOW_PYTHON?.trim();
  const envRoot = process.env.SCOREFLOW_ROOT?.trim();
  if (envPython && fs.existsSync(envPython)) {
    const root = envRoot || path.dirname(path.dirname(path.dirname(envPython)));
    return { runtime: envPython, prefix: ['-m', 'scoreflow.cli'], root };
  }

  // 打包形态 1：可执行文件放在 userData（模型/引擎可更新，不随安装包变大）
  const packedInUserData = path.join(app.getPath('userData'), 'scoreflow', exeName);
  if (fs.existsSync(packedInUserData)) {
    return { runtime: packedInUserData, prefix: [], root: path.dirname(packedInUserData) };
  }

  // 打包形态 2：随安装包额外资源下发
  const packedInResources = path.join(process.resourcesPath || '', 'scoreflow', exeName);
  if (fs.existsSync(packedInResources)) {
    return { runtime: packedInResources, prefix: [], root: path.dirname(packedInResources) };
  }

  // 开发形态：与播放器仓库同级的 ScoreFlow 项目
  const candidates = [
    path.resolve(app.getAppPath(), '..', 'ScoreFlow'),
    path.resolve(process.cwd(), '..', 'ScoreFlow'),
  ];
  for (const root of candidates) {
    const venvPython =
      process.platform === 'win32'
        ? path.join(root, '.venv', 'Scripts', 'python.exe')
        : path.join(root, '.venv', 'bin', 'python');
    if (fs.existsSync(venvPython) && fs.existsSync(path.join(root, 'packages', 'scoreflow'))) {
      return { runtime: venvPython, prefix: ['-m', 'scoreflow.cli'], root };
    }
  }

  return { error: '未找到 ScoreFlow 引擎（可用 SCOREFLOW_PYTHON 环境变量指定解释器）' };
}

/** 跑一段命令，收集 stdout；超时或非零退出返回 null。 */
function runOnce(
  runtime: string,
  args: string[],
  cwd: string,
  timeout: number,
): Promise<string | null> {
  return new Promise((resolve) => {
    let done = false;
    let out = '';
    const child = spawn(runtime, args, {
      cwd,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' },
      windowsHide: true,
    });
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      child.kill();
      resolve(null);
    }, timeout);
    child.stdout.on('data', (chunk: Buffer) => {
      out += chunk.toString('utf8');
    });
    child.stderr.on('data', () => {
      /* 版本探测不关心 stderr */
    });
    child.on('error', () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(null);
    });
    child.on('close', (code) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(code === 0 ? out.trim() : null);
    });
  });
}

/** 探测引擎是否可用（带版本号）。 */
export async function probeEngine(): Promise<ScoreEngineStatus> {
  const handle = resolveEngine();
  if ('error' in handle) {
    return { available: false, runtime: '', root: '', version: '', reason: handle.error };
  }
  const version = await runOnce(
    handle.runtime,
    [...handle.prefix, '--version'],
    handle.root,
    PROBE_TIMEOUT_MS,
  );
  if (version === null) {
    return {
      available: false,
      runtime: handle.runtime,
      root: handle.root,
      version: '',
      reason: '引擎无法启动（依赖未安装或解释器不可用）',
    };
  }
  return {
    available: true,
    runtime: handle.runtime,
    root: handle.root,
    version: version || 'unknown',
  };
}

/** 把渲染层传来的 PCM 写成 24bit WAV。 */
function writeInputWav(input: ScorePcmInput, target: string): void {
  const mono =
    input.data instanceof Float32Array
      ? input.data
      : Float32Array.from(input.data as ArrayLike<number>);
  if (!mono.length) throw new Error('音频数据为空');
  const buffer = encodeWav([mono], input.sampleRate, 24);
  fs.writeFileSync(target, buffer);
}

/** 解析引擎 stderr 里的进度行。 */
function parseProgressLine(line: string): ScoreProgress | null {
  const match = /^@@PROGRESS\|([^|]+)\|([\d.]+)$/.exec(line.trim());
  if (!match) return null;
  const percent = Number(match[2]);
  if (!Number.isFinite(percent)) return null;
  return { stage: match[1], percent: Math.max(0, Math.min(1, percent)) };
}

/** 清理过期的临时目录（只保留本次任务）。 */
function pruneOldJobs(keep: string): void {
  const base = path.join(app.getPath('temp'), 'lyrise-scoreflow');
  try {
    for (const name of fs.readdirSync(base)) {
      const full = path.join(base, name);
      if (full === keep) continue;
      fs.rmSync(full, { recursive: true, force: true });
    }
  } catch {
    /* 目录不存在或占用中，忽略 */
  }
}

/** 取消进行中的任务。 */
export function cancelTranscribe(): boolean {
  const job = activeJob;
  if (!job) return false;
  job.cancelled = true;
  try {
    job.child.kill();
  } catch {
    /* 进程可能已退出 */
  }
  // 不在这里清空 activeJob：close 回调要靠它判断"这次退出是用户取消的"。
  // 提前置空会让 close 里读到 null，最后报成"引擎退出码 null"。
  return true;
}

/**
 * 执行一次扒谱。
 * @param input 渲染层解码好的 PCM
 * @param options 扒谱选项
 * @param onProgress 进度回调（已经做了节流，可以直接发 IPC）
 */
export async function transcribe(
  input: ScorePcmInput,
  options: ScoreOptions,
  onProgress: (progress: ScoreProgress) => void,
): Promise<ScoreResult> {
  if (activeJob) throw new Error('已有扒谱任务在进行中');

  const handle = resolveEngine();
  if ('error' in handle) throw new Error(handle.error);

  const startedAt = Date.now();
  jobSeq += 1;
  const jobDir = path.join(app.getPath('temp'), 'lyrise-scoreflow', `job-${jobSeq}`);
  fs.mkdirSync(jobDir, { recursive: true });
  pruneOldJobs(jobDir);

  const baseName = (input.baseName || 'audio').replace(/[\\/:*?"<>|]/g, '_').slice(0, 80);
  const wavPath = path.join(jobDir, `${baseName}.wav`);
  writeInputWav(input, wavPath);

  const args = [...handle.prefix, 'transcribe', wavPath, '-o', jobDir, '--emit-progress'];
  if (options.title) args.push('--title', options.title);
  if (options.artist) args.push('--artist', options.artist);
  if (options.noSeparate) args.push('--no-separate');
  if (options.noLyrics) args.push('--no-lyrics');
  if (options.grid) args.push('--grid', String(options.grid));
  if (options.bpm) args.push('--bpm', String(options.bpm));
  if (options.meter) args.push('--meter', String(options.meter));
  if (options.whisper) args.push('--whisper', options.whisper);

  const doc = await new Promise<ScoreDoc>((resolve, reject) => {
    const child = spawn(handle.runtime, args, {
      cwd: handle.root,
      env: {
        ...process.env,
        PYTHONIOENCODING: 'utf-8',
        PYTHONUTF8: '1',
        HF_ENDPOINT: process.env.HF_ENDPOINT || 'https://hf-mirror.com',
      },
      windowsHide: true,
    });
    activeJob = { child, cancelled: false };

    let stderrTail = '';
    let lastEmit = 0;
    const timer = setTimeout(() => {
      cancelTranscribe();
      reject(new Error('扒谱超时，请换一首短一点的歌或降低模型精度'));
    }, JOB_TIMEOUT_MS);

    const handleLine = (line: string) => {
      const progress = parseProgressLine(line);
      if (!progress) return;
      const now = Date.now();
      // 节流：最多每 120ms 发一次，避免 IPC 被高频进度刷爆
      if (now - lastEmit < 120 && progress.percent < 0.999) return;
      lastEmit = now;
      onProgress({ ...progress, elapsed: (now - startedAt) / 1000 });
    };

    let buffer = '';
    child.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf8');
      buffer += text;
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        handleLine(line);
        if (!line.startsWith('@@PROGRESS')) stderrTail = (stderrTail + line + '\n').slice(-4000);
      }
    });
    child.stdout.on('data', () => {
      /* 结果从 score.json 读，stdout 不需要 */
    });

    child.on('error', (error) => {
      clearTimeout(timer);
      activeJob = null;
      reject(new Error(`引擎启动失败：${error.message}`));
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      // 先抓住 job 引用再清空：cancelTranscribe 只置 cancelled 标记不清空 activeJob，
      // 这里才能知道"退出是不是用户取消的"。
      const job = activeJob;
      activeJob = null;
      if (job?.cancelled) {
        reject(new Error('已取消'));
        return;
      }
      if (code === null) {
        reject(new Error('引擎进程被意外终止，请重试'));
        return;
      }
      if (code !== 0) {
        reject(
          new Error(`引擎退出码 ${code}${stderrTail ? `：${stderrTail.trim().slice(-500)}` : ''}`),
        );
        return;
      }
      const scorePath = path.join(jobDir, baseName, 'score.json');
      if (!fs.existsSync(scorePath)) {
        reject(new Error('引擎没有产出谱面数据'));
        return;
      }
      try {
        resolve(JSON.parse(fs.readFileSync(scorePath, 'utf8')) as ScoreDoc);
      } catch (error) {
        reject(new Error(`谱面数据解析失败：${(error as Error).message}`));
      }
    });
  });

  return { doc, outDir: path.join(jobDir, baseName), elapsed: (Date.now() - startedAt) / 1000 };
}

/** 引擎根目录（导出 SVG 等附加文件时用）。 */
export function currentOutDirHint(): string {
  return path.join(os.tmpdir(), 'lyrise-scoreflow');
}
