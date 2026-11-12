/**
 * LyriseMusic 元数据写入模块
 * 作者：知之Dake
 * 文件：MetadataWriter.ts
 * 描述：在歌曲下载完成后，向音频文件内嵌写入元数据——标题 / 歌手 / 专辑 / 封面 / 歌词。
 *      按格式分派两条实现：
 *        · MP3  走 node-id3（纯 JavaScript / CommonJS，无原生与 WASM 依赖，最稳妥）；
 *        · 其余（FLAC / M4A / OGG / WAV 等）走 taglib-wasm（TagLib 的 WASM 构建，全格式支持）。
 *      元数据写入属于"附加增强"：即使失败也不应改变文件已下载完成的事实，由调用方捕获并仅记录。
 * 版权：Copyright © 2026 Dake（知之Dake）. All Rights Reserved.
 * 设计参考：lx-music-desktop（https://github.com/lyswhut/lx-music-desktop），Apache-2.0 License
 */
import { net, type Session } from 'electron';
import * as NodeID3 from 'node-id3';
import type { Tags } from 'node-id3';
import type { DownloadSongMeta } from '../../shared/download';

/** MP3 扩展名：使用 node-id3 实现。 */
const MP3_EXT = 'mp3';

/**
 * 走 taglib-wasm 的扩展名集合（TagLib 支持的常见容器）。
 * 未列入的扩展名一律跳过元数据写入，避免对文件造成未知破坏。
 */
const TAGLIB_EXTS = new Set(['flac', 'm4a', 'mp4', 'ogg', 'opus', 'wma', 'ape', 'wav']);

/** 已下载的封面：二进制数据 + MIME 类型。 */
interface CoverData {
  buffer: Buffer;
  mime: string;
}

/** 模块依赖。 */
export interface MetadataWriterOptions {
  /** 下载封面时使用的网络 session（与下载任务共用，自动应用系统代理）。 */
  session?: Session | null;
}

export class MetadataWriter {
  constructor(private readonly options: MetadataWriterOptions = {}) {}

  /**
   * 向已下载文件写入元数据。
   * @param filePath 最终文件的绝对路径（文件已完成下载）。
   * @param song     歌曲元信息（含可选的封面 URL 与歌词文本）。
   */
  async write(filePath: string, song: DownloadSongMeta): Promise<void> {
    const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
    // 封面两种格式都需要，先下载；封面失败不影响文本标签写入
    const cover = song.coverUrl ? await this.fetchCover(song.coverUrl).catch(() => null) : null;

    if (ext === MP3_EXT) {
      await this.writeMp3(filePath, song, cover);
      console.info(`[Download] 元数据写入完成（node-id3）：${filePath}`);
    } else if (TAGLIB_EXTS.has(ext)) {
      await this.writeWithTaglib(filePath, song, cover);
      console.info(`[Download] 元数据写入完成（taglib-wasm）：${filePath}`);
    }
    // 不支持的扩展名：静默跳过（不报错，下载仍视为成功）
  }

  /**
   * MP3：用 node-id3 写入 ID3v2 标签。
   * @param cover 已下载的封面（可选）。
   */
  private async writeMp3(
    filePath: string,
    song: DownloadSongMeta,
    cover: CoverData | null,
  ): Promise<void> {
    const tags: Tags = {
      title: song.title,
      artist: song.artist,
      album: song.album,
    };

    // 内嵌封面（APIC 帧，类型 3 = Front Cover）
    if (cover) {
      tags.image = {
        mime: cover.mime,
        type: { id: 3, name: 'front cover' },
        description: 'cover',
        imageBuffer: cover.buffer,
      };
    }

    // 内嵌歌词（USLT 帧，语言 ISO 639-2 中文 chi）
    if (song.lyrics) {
      tags.unsynchronisedLyrics = {
        language: 'chi',
        text: song.lyrics,
      };
    }

    const result = await NodeID3.Promise.write(tags, filePath);
    if (result !== true) {
      throw new Error('node-id3 写入返回失败');
    }
  }

  /**
   * 非 MP3 格式：用 taglib-wasm 写入标签。
   * taglib-wasm 是纯 ESM + WASM 包，必须在运行时动态 import（主进程产物为 CJS，静态 import 会失败）。
   * @param cover 已下载的封面（可选）。
   */
  private async writeWithTaglib(
    filePath: string,
    song: DownloadSongMeta,
    cover: CoverData | null,
  ): Promise<void> {
    // 动态加载 ESM 模块；taglib-wasm 已在 vite external 中，运行时从 node_modules 解析以定位 WASM
    const { TagLib } = await import('taglib-wasm');
    const taglib = await TagLib.initialize();

    // Windows Defender 等实时保护会在新文件创建后短暂扫描并锁定文件，
    // 立即 open 会 EPERM。重试 3 次，每次间隔 500ms。
    let file: Awaited<ReturnType<typeof taglib.open>> | null = null;
    let lastError: unknown = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        file = await taglib.open(filePath);
        break;
      } catch (error) {
        lastError = error;
        if (attempt < 2) await new Promise((r) => setTimeout(r, 500));
      }
    }
    if (!file) throw lastError instanceof Error ? lastError : new Error(String(lastError));

    try {
      // 基本文本标签（setTitle / setArtist 等为链式调用）
      const tag = file.tag();
      tag.setTitle(song.title).setArtist(song.artist);
      if (song.album) tag.setAlbum(song.album);

      // 内嵌封面
      if (cover) {
        file.setPictures([
          {
            mimeType: cover.mime,
            data: new Uint8Array(cover.buffer),
            type: 'FrontCover',
            description: 'cover',
          },
        ]);
      }

      // 内嵌歌词（Vorbis LYRICS / MP4 ©lyr 等，由 TagLib 按格式自动处理）
      if (song.lyrics) {
        file.setLyrics([
          {
            text: song.lyrics,
            language: 'chi',
            description: '',
          },
        ]);
      }

      // 保存到内存缓冲，再写回磁盘（原地覆盖）
      file.save();
      await file.saveToFile(filePath);
    } finally {
      // 无论成功失败都释放 WASM 资源
      file.dispose();
    }
  }

  /**
   * 下载封面为二进制数据。
   * 优先使用注入的 session（走代理），否则用默认 net.fetch。
   * @param url 封面 URL。
   */
  private async fetchCover(url: string): Promise<CoverData> {
    const response = this.options.session
      ? await this.options.session.fetch(url)
      : await net.fetch(url);

    if (!response.ok) {
      throw new Error(`封面下载失败：HTTP ${response.status}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    return {
      buffer: Buffer.from(arrayBuffer),
      mime: response.headers.get('content-type') || 'image/jpeg',
    };
  }
}
