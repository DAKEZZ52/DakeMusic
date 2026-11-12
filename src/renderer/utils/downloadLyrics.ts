/**
 * LyriseMusic 下载歌词收集模块
 * 作者：知之Dake
 * 文件：downloadLyrics.ts
 * 描述：为下载任务收集 LRC 歌词文本，直接调用歌词搜索 / 详情 API，不经过歌词 store，
 *      因此不会改动全局播放歌词与候选弹窗状态（无副作用）。
 *      查找顺序：① 酷狗 hash 精确匹配（man=no 取最佳候选）；② 歌名兜底搜索（getKugouLyric）。
 * 版权：Copyright © 2026 Dake（知之Dake）. All Rights Reserved.
 */
import { getLyric, searchLyric } from '@/api/music';
import { getKugouLyric } from '@/utils/lyric';
import logger from '@/utils/logger';

/** 歌词收集所需的歌曲信息。 */
export interface DownloadLyricSource {
  /** 酷狗文件 hash。 */
  hash?: string;
  /** 歌名。 */
  title?: string;
  /** 歌手。 */
  artist?: string;
  /** 时长（秒），用于提升匹配准确度。 */
  duration?: number;
  /** 酷狗 mixSongId / albumAudioId。 */
  mixSongId?: string | number;
}

/** 单个歌词候选（仅需要 id + accesskey 即可拉取详情）。 */
interface LyricCandidate {
  id?: string | number;
  accesskey?: string;
}

/** 歌词详情响应（解码后的 LRC / 原始文本）。 */
interface LyricDetail {
  decodeContent?: string;
  lyric?: string;
}

/** 兼容服务端可能把数据放在 data 字段的情况。 */
const unwrapData = (payload: any): any => {
  if (payload && payload.data && typeof payload.data === 'object') return payload.data;
  return payload;
};

/** 从搜索响应中提取候选列表（优先 candidates，其次 info）。 */
const extractCandidates = (payload: unknown): LyricCandidate[] => {
  const data = unwrapData(payload);
  const candidates = Array.isArray(data?.candidates) ? data.candidates : [];
  const info = Array.isArray(data?.info) ? data.info : [];
  return (candidates.length ? candidates : info) as LyricCandidate[];
};

/** 从详情响应中提取歌词文本。 */
const extractDetail = (payload: unknown): LyricDetail | null => {
  const data = unwrapData(payload);
  const decodeContent = typeof data?.decodeContent === 'string' ? data.decodeContent : '';
  const lyric = typeof data?.lyric === 'string' ? data.lyric : '';
  if (!decodeContent && !lyric) return null;
  return { decodeContent, lyric };
};

/** 判断候选是否可用（必须同时具备 id 与 accesskey）。 */
const isUsable = (candidate: LyricCandidate | null | undefined): boolean =>
  Boolean(candidate?.id && candidate?.accesskey);

/**
 * 获取歌曲的 LRC 歌词文本。
 * @param source 歌曲信息（hash / 歌名 / 歌手 / 时长）。
 * @returns LRC 文本；任何环节失败都返回 undefined（不影响下载）。
 */
export async function fetchDownloadLyrics(
  source: DownloadLyricSource,
): Promise<string | undefined> {
  // ① hash 精确匹配
  const hash = String(source.hash ?? '').trim();
  if (hash) {
    try {
      const candidates = extractCandidates(
        await searchLyric(hash, {
          duration: source.duration,
          albumAudioId: source.mixSongId,
          man: 'no',
        }),
      );
      const candidate = candidates[0];
      if (isUsable(candidate)) {
        const detail = extractDetail(
          await getLyric(String(candidate.id), String(candidate.accesskey)),
        );
        const text = detail?.decodeContent || detail?.lyric;
        if (text) return text;
      }
    } catch (error) {
      logger.warn('DownloadLyrics', 'Hash lyric search failed', error);
    }
  }

  // ② 歌名兜底搜索（自动清洗伴奏/变调后缀）
  if (source.title) {
    try {
      const fallback = await getKugouLyric(source.title, source.artist || '');
      if (fallback) return fallback;
    } catch (error) {
      logger.warn('DownloadLyrics', 'Fallback lyric search failed', error);
    }
  }

  return undefined;
}
