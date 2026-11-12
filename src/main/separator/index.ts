/**
 * LyriseMusic 人声/伴奏分离 IPC 模块
 * 文件：index.ts
 * 描述：注册分离相关 IPC（模型列表、开始分离、保存结果），编排模型下载/加载、推理、WAV 保存。
 * 版权：Copyright © 2026 Dake（知之Dake）. All Rights Reserved.
 */
import { app, dialog, shell } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { ipcRegistry } from '../ipc/registry';
import type { IpcContext } from '../ipc/types';
import {
  MODEL_LIST,
  ensureModel,
  getModelDir,
  isModelDownloaded,
  loadSession,
  setModelDir,
} from './model';
import { separate } from './mdxSeparator';
import { encodeWav } from './wav';
import { pitchShift } from './pitchShift';
import {
  SEPARATOR_IPC_CHANNELS,
  type SeparatorPcmInput,
  type SeparatorProgress,
  type SeparatorModelInfo,
  type SeparatorOutput,
  type SeparatorResult,
} from '../../shared/separator';
import type { InferenceSession } from 'onnxruntime-node';

/** 已加载的推理会话缓存（按 modelId）。 */
const sessionCache = new Map<string, InferenceSession>();

/** 已分离但尚未保存的波形（只保留最近一次，避免长期占用内存）。 */
interface PendingStems {
  baseName: string;
  sampleRate: number;
  vocals: Float32Array[];
  instrumental: Float32Array[];
  /** 变调半音数（0 = 原调）。 */
  keyShift: number;
}

let pendingStems: { id: string; stems: PendingStems } | null = null;
let pendingSeq = 0;

/** 清理文件名中的非法字符。 */
function safeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_').slice(0, 120) || 'audio';
}

/** 注册分离模块全部 IPC 处理器。 */
export const registerSeparatorHandlers = (context: IpcContext): void => {
  // 模型列表
  ipcRegistry.registerHandler(SEPARATOR_IPC_CHANNELS.listModels, (): SeparatorModelInfo[] =>
    MODEL_LIST.map((spec) => ({
      id: spec.id,
      name: spec.name,
      downloaded: isModelDownloaded(spec),
    })),
  );

  // 独立下载模型（与「开始分离」解耦：模型下载在分离模型区单独触发）
  ipcRegistry.registerHandler(
    SEPARATOR_IPC_CHANNELS.downloadModel,
    async (event, payload: { modelId: string }): Promise<boolean> => {
      const spec = MODEL_LIST.find((s) => s.id === payload?.modelId);
      if (!spec) throw new Error('未找到所选模型');
      if (isModelDownloaded(spec)) return true;

      const sendProgress = (percent: number) => {
        event.sender.send(SEPARATOR_IPC_CHANNELS.progress, {
          stage: 'download',
          percent: Math.max(0, Math.min(1, percent)),
        } satisfies SeparatorProgress);
      };

      sendProgress(0);
      await ensureModel(spec, sendProgress);
      return true;
    },
  );

  // 开始分离（只做推理，结果暂存内存，等待保存；模型需已下载）
  ipcRegistry.registerHandler(
    SEPARATOR_IPC_CHANNELS.start,
    async (event, payload: { modelId: string; input: SeparatorPcmInput }) => {
      const spec = MODEL_LIST.find((s) => s.id === payload.modelId);
      if (!spec) throw new Error('未找到所选模型');
      if (!isModelDownloaded(spec)) {
        throw new Error('请先在分离模型处下载模型');
      }
      const { input } = payload;
      if (!input || !Array.isArray(input.data) || input.data.length === 0) {
        throw new Error('音频数据为空');
      }

      // 归一化 PCM：无论收到 Float32Array 还是普通数组（容错），
      // 统一转成 Float32Array 供推理使用，并校验每个声道非空。
      const data: Float32Array[] = input.data.map((channel) =>
        Float32Array.from(channel as ArrayLike<number>),
      );
      if (data.length === 0 || data[0].length === 0) {
        throw new Error('音频数据为空');
      }

      const sendProgress = (stage: SeparatorProgress['stage'], percent: number) => {
        event.sender.send(SEPARATOR_IPC_CHANNELS.progress, {
          stage,
          percent: Math.max(0, Math.min(1, percent)),
        } satisfies SeparatorProgress);
      };

      // 1. 加载会话
      let session = sessionCache.get(spec.id);
      if (!session) {
        session = await loadSession(spec);
        sessionCache.set(spec.id, session);
      }

      // 2. 分离
      const result = await separate(data, spec, session, (p) => sendProgress('separate', p));

      // 3. 暂存波形，交给「保存」步骤落盘
      pendingSeq += 1;
      const cacheId = `separator-${pendingSeq}`;
      const keyShift = Number(payload.input?.keyShift ?? 0);
      const stems: PendingStems = {
        baseName: safeFileName(input.baseName),
        sampleRate: input.sampleRate,
        vocals: result.vocals,
        instrumental: result.instrumental,
        keyShift: Number.isFinite(keyShift) ? keyShift : 0,
      };
      pendingStems = { id: cacheId, stems };

      const durationSec = input.sampleRate > 0 ? data[0].length / input.sampleRate : 0;

      return {
        cacheId,
        baseName: stems.baseName,
        sampleRate: stems.sampleRate,
        durationSec,
      } satisfies SeparatorResult;
    },
  );

  // 保存分离结果（写入指定目录，不弹窗；分离前已设置保存位置）
  ipcRegistry.registerHandler(
    SEPARATOR_IPC_CHANNELS.save,
    async (event, payload: { cacheId: string; dir: string }) => {
      if (!pendingStems || payload?.cacheId !== pendingStems.id) {
        throw new Error('分离结果已失效，请重新分离');
      }
      if (!payload?.dir) {
        throw new Error('未设置保存位置');
      }
      const { baseName, sampleRate, vocals, instrumental, keyShift } = pendingStems.stems;

      const sendProgress = (percent: number) => {
        event.sender.send(SEPARATOR_IPC_CHANNELS.progress, {
          stage: 'save',
          percent: Math.max(0, Math.min(1, percent)),
        } satisfies SeparatorProgress);
      };

      // 1. 确保保存目录存在（默认目录首次使用前已由 getDefaultSaveDir 创建，这里兜底）
      sendProgress(0);
      const dir = payload.dir;
      fs.mkdirSync(dir, { recursive: true });

      // 2. 变调（保持时长；原调直接写盘）
      const vocalOut = keyShift ? pitchShift(vocals, keyShift) : vocals;
      const instrumentalOut = keyShift ? pitchShift(instrumental, keyShift) : instrumental;

      // 3. 写 WAV（24bit 无损）
      const vocalPath = path.join(dir, `${baseName} - 人声.wav`);
      const instrumentalPath = path.join(dir, `${baseName} - 伴奏.wav`);
      fs.writeFileSync(vocalPath, encodeWav(vocalOut, sampleRate, 24));
      fs.writeFileSync(instrumentalPath, encodeWav(instrumentalOut, sampleRate, 24));
      sendProgress(1);

      // 4. 在文件管理器中定位人声文件
      shell.showItemInFolder(vocalPath);

      return { vocalPath, instrumentalPath } satisfies SeparatorOutput;
    },
  );

  // 默认保存位置：桌面/DAKESeparation，不存在则自动新建
  ipcRegistry.registerHandler(SEPARATOR_IPC_CHANNELS.getDefaultSaveDir, async () => {
    const dir = path.join(app.getPath('desktop'), 'DAKESeparation');
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  });

  // 手动选择保存位置：取消返回 null
  ipcRegistry.registerHandler(SEPARATOR_IPC_CHANNELS.pickSaveDir, async () => {
    const window = context.getMainWindow();
    const dirResult = await dialog.showOpenDialog(window as Electron.BrowserWindow, {
      title: '选择分离结果保存位置',
      properties: ['openDirectory', 'createDirectory'],
    });
    if (dirResult.canceled || !dirResult.filePaths.length) return null;
    return dirResult.filePaths[0];
  });

  // 打开目录（在文件管理器中显示该目录；目录不存在时返回错误信息）
  ipcRegistry.registerHandler(
    SEPARATOR_IPC_CHANNELS.revealDir,
    async (_event, payload: { dir: string }) => {
      const dir = payload?.dir;
      if (!dir || typeof dir !== 'string') throw new Error('目录路径为空');
      const err = await shell.openPath(dir);
      if (err) throw new Error(err);
      return true;
    },
  );

  // 当前模型保存目录（默认用户数据目录 models，可在页面更改并持久化）
  ipcRegistry.registerHandler(SEPARATOR_IPC_CHANNELS.getModelDir, () => getModelDir());

  // 手动选择模型保存目录：选择后自动创建目录、搬移旧目录已下载模型并持久化；取消返回 null
  ipcRegistry.registerHandler(SEPARATOR_IPC_CHANNELS.pickModelDir, async () => {
    const window = context.getMainWindow();
    const dirResult = await dialog.showOpenDialog(window as Electron.BrowserWindow, {
      title: '选择模型保存目录',
      properties: ['openDirectory', 'createDirectory'],
    });
    if (dirResult.canceled || !dirResult.filePaths.length) return null;
    const dir = dirResult.filePaths[0];
    try {
      fs.mkdirSync(dir, { recursive: true });
      // 旧目录已下载的模型逐个复制到新目录（同目录或文件不存在时跳过）
      const oldDir = getModelDir();
      if (oldDir !== dir && fs.existsSync(oldDir)) {
        for (const spec of MODEL_LIST) {
          const src = path.join(oldDir, spec.fileName);
          if (!fs.existsSync(src)) continue;
          let stat: fs.Stats;
          try {
            stat = fs.statSync(src);
          } catch {
            continue;
          }
          // 仅搬移完整模型（>1MB，避免半截文件）
          if (!stat.isFile() || stat.size <= 1_000_000) continue;
          try {
            fs.copyFileSync(src, path.join(dir, spec.fileName));
          } catch {
            /* 单个模型搬移失败不阻塞整体，用户可重新下载该模型 */
          }
        }
      }
      setModelDir(dir);
    } catch {
      throw new Error('目录不可写，请重新选择');
    }
    return dir;
  });
};
