/**
 * LyriseMusic 扒谱 IPC 模块
 * 文件：index.ts
 * 描述：注册扒谱相关 IPC（引擎探测、开始扒谱、取消、导出 JSON），
 *      引擎是本地 Python 侧车，全部离线运行。
 * 版权：Copyright © 2026 Dake（知之Dake）. All Rights Reserved.
 */
import { dialog, shell } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { ipcRegistry } from '../ipc/registry';
import { assertFeatureEnabled } from '../remoteFlags';
import type { IpcContext } from '../ipc/types';
import { cancelTranscribe, probeEngine, transcribe } from './engine';
import {
  SCOREFLOW_IPC_CHANNELS,
  type ScoreDoc,
  type ScoreOptions,
  type ScorePcmInput,
  type ScoreProgress,
} from '../../shared/scoreflow';

/** 校验并规整渲染层传来的 PCM。 */
function normalizeInput(input: ScorePcmInput | undefined): ScorePcmInput {
  if (!input || !input.data) throw new Error('音频数据为空');
  const sampleRate = Number(input.sampleRate);
  if (!Number.isFinite(sampleRate) || sampleRate < 8000 || sampleRate > 192000) {
    throw new Error('采样率不合法');
  }
  const mono =
    input.data instanceof Float32Array
      ? input.data
      : Float32Array.from(input.data as unknown as ArrayLike<number>);
  if (!mono.length) throw new Error('音频数据为空');
  return {
    channels: Number(input.channels) || 1,
    sampleRate,
    data: mono,
    baseName: String(input.baseName || 'audio').slice(0, 120),
  };
}

/** 注册扒谱模块全部 IPC 处理器。 */
export const registerScoreflowHandlers = (context: IpcContext): void => {
  /** 引擎是否可用（页面进入时先探一次，不可用就提示去哪配）。 */
  ipcRegistry.registerHandler(SCOREFLOW_IPC_CHANNELS.engineStatus, () => {
    // 服务端关闭扒谱时直接报错，页面据此显示禁用提示
    assertFeatureEnabled('scoreflow');
    return probeEngine();
  });

  /** 开始扒谱：结果一次性返回，进度走 progress 事件。 */
  ipcRegistry.registerHandler(
    SCOREFLOW_IPC_CHANNELS.transcribe,
    async (event, payload: { input: ScorePcmInput; options?: ScoreOptions }) => {
      assertFeatureEnabled('scoreflow');
      const input = normalizeInput(payload?.input);
      const options = payload?.options ?? {};

      const send = (progress: ScoreProgress) => {
        if (event.sender.isDestroyed()) return;
        event.sender.send(SCOREFLOW_IPC_CHANNELS.progress, progress);
      };
      send({ stage: '准备音频', percent: 0.01 });

      return transcribe(input, options, send);
    },
  );

  /** 取消进行中的任务。 */
  ipcRegistry.registerHandler(SCOREFLOW_IPC_CHANNELS.cancel, () => cancelTranscribe());

  /** 导出谱面 JSON 到用户选择的位置。 */
  ipcRegistry.registerHandler(
    SCOREFLOW_IPC_CHANNELS.exportJson,
    async (_event, payload: { doc: ScoreDoc; suggestedName?: string }) => {
      const doc = payload?.doc;
      if (!doc || !Array.isArray(doc.measures)) throw new Error('谱面数据无效');
      const window = context.getMainWindow();
      const safeName = String(payload.suggestedName || doc.meta?.title || 'score')
        .replace(/[\\/:*?"<>|]/g, '_')
        .slice(0, 80);
      const result = await dialog.showSaveDialog(window as Electron.BrowserWindow, {
        title: '导出谱面 JSON',
        defaultPath: `${safeName}.scoreflow.json`,
        filters: [{ name: 'ScoreFlow 谱面', extensions: ['json'] }],
      });
      if (result.canceled || !result.filePath) return null;
      fs.writeFileSync(result.filePath, JSON.stringify(doc, null, 2), 'utf8');
      shell.showItemInFolder(result.filePath);
      return result.filePath;
    },
  );
};

/** 供其他模块引用的导出目录提示（当前未使用，保留给后续「打开输出目录」入口）。 */
export const scoreflowOutDirHint = (): string => path.join('', '');
