/**
 * DakeMusic 人声/伴奏分离模块（共享类型）
 * 文件：separator.ts
 * 描述：基于 MDX-Net（参考 UVR5）的人声/伴奏分离，模型首次使用时下载，输出 WAV。
 * 版权：Copyright © 2026 Dake（知之Dake）. All Rights Reserved.
 */

/** 模型信息（用于界面展示）。 */
export interface SeparatorModelInfo {
  id: string;
  name: string;
  /** 模型是否已下载到本地。 */
  downloaded: boolean;
}

/** 渲染层解码后的 PCM 输入（已重采样到 44100）。 */
export interface SeparatorPcmInput {
  /** 声道数（1 或 2）。 */
  channels: number;
  sampleRate: number;
  /** 每个声道的 PCM（Float32，-1..1）。 */
  data: Float32Array[];
  /** 用于输出文件命名的基础名（通常为歌名）。 */
  baseName: string;
  /**
   * 变调半音数（可选）：>0 升调、<0 降调、0 或省略保持原调。
   * 以 C 为基准的 12 调映射见主进程 pitchShift.ts 的 KEY_SEMITONES。
   */
  keyShift?: number;
}

/** 分离进度事件。 */
export interface SeparatorProgress {
  stage: 'download' | 'separate' | 'save';
  /** 0..1。 */
  percent: number;
}

/**
 * 分离结果（波形暂存在主进程内存中，分离成功后自动写入保存位置）。
 * 保存位置需在分离前设置：start 做推理并自动落盘，不再单独弹窗选目录。
 */
export interface SeparatorResult {
  /** 结果 id，保存时用它取回主进程缓存的波形。 */
  cacheId: string;
  /** 输出文件命名的基础名。 */
  baseName: string;
  sampleRate: number;
  /** 音频时长（秒）。 */
  durationSec: number;
}

/** 分离结果写盘后的文件路径。 */
export interface SeparatorOutput {
  vocalPath: string;
  instrumentalPath: string;
}

/** 分离相关 IPC 通道常量。 */
export const SEPARATOR_IPC_CHANNELS = {
  /** 获取模型列表（入参无，返回 SeparatorModelInfo[]）。 */
  listModels: 'separator:listModels',
  /** 独立下载模型（入参 { modelId }，返回 boolean；进度经 progress 事件广播）。 */
  downloadModel: 'separator:downloadModel',
  /** 开始分离，推理完成后自动保存到已设置的保存位置（入参 { modelId, input: SeparatorPcmInput }，返回 SeparatorResult）。 */
  start: 'separator:start',
  /** 保存分离结果到指定目录（入参 { cacheId, dir }，直接写盘不弹窗，返回 SeparatorOutput）。 */
  save: 'separator:save',
  /** 获取默认保存位置（桌面/DAKESeparation，不存在则自动创建，返回绝对路径字符串）。 */
  getDefaultSaveDir: 'separator:getDefaultSaveDir',
  /** 弹出目录选择框选择保存位置（返回绝对路径字符串；取消返回 null）。 */
  pickSaveDir: 'separator:pickSaveDir',
  /** 打开指定目录（在文件管理器中显示该目录；返回打开结果）。 */
  revealDir: 'separator:revealDir',
  /** 获取模型保存目录（返回绝对路径字符串；未自定义时为用户数据目录 models）。 */
  getModelDir: 'separator:getModelDir',
  /** 弹出目录选择框选择模型保存目录并持久化（返回新绝对路径；取消返回 null）。 */
  pickModelDir: 'separator:pickModelDir',
  /** 主进程 -> 渲染层的进度事件（入参 SeparatorProgress）。 */
  progress: 'separator:progress',
} as const;
