/**
 * MDX 模型清单 + 下载 / 缓存 / 加载管理。
 *
 * 模型首次使用时下载，缓存到模型保存目录（默认用户数据目录 models/）下，避免重复下载。
 * 模型保存目录可在人声分离页「模型保存位置」处更改并持久化。
 * 提供多个下载源（GitHub 官方 + 国内加速镜像）自动 fallback。
 */

import { app } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import https from 'node:https';
import { InferenceSession } from 'onnxruntime-node';

/** 分离模块配置文件名（模型保存目录等）。 */
const SEPARATOR_CONFIG_FILE = 'separator-config.json';

export interface ModelSpec {
  id: string;
  /** 展示名。 */
  name: string;
  fileName: string;
  urls: string[];
  /** 模型参数（MDX 标准值）。 */
  nFft: number;
  hop: number;
  dimF: number;
  dimT: number;
  /** 输出增益补偿。 */
  compensate: number;
  /** 模型直接输出的轨：Inst 模型输出伴奏，人声由 mix−伴奏 得到。 */
  primaryStem: 'instrumental' | 'vocals';
}

/** 可用模型清单（人声 / 伴奏分离，全部为 MDX-Net 6144/1024/3072/256 同架构）。 */
export const MODEL_LIST: ModelSpec[] = [
  {
    id: 'inst-hq-3',
    name: 'Inst_HQ_3（伴奏优先・高质量（默认））',
    fileName: 'Inst_HQ_3.onnx',
    urls: [
      'https://gh-proxy.com/https://github.com/k2-fsa/sherpa-onnx/releases/download/source-separation-models/UVR-MDX-NET-Inst_HQ_3.onnx',
      'https://github.com/k2-fsa/sherpa-onnx/releases/download/source-separation-models/UVR-MDX-NET-Inst_HQ_3.onnx',
      'https://ghfast.top/https://github.com/k2-fsa/sherpa-onnx/releases/download/source-separation-models/UVR-MDX-NET-Inst_HQ_3.onnx',
    ],
    nFft: 6144,
    hop: 1024,
    dimF: 3072,
    dimT: 256,
    compensate: 1.03,
    primaryStem: 'instrumental',
  },
  {
    id: 'inst-hq-5',
    name: 'Inst_HQ_5（伴奏优先・高质量（最新））',
    fileName: 'Inst_HQ_5.onnx',
    urls: [
      'https://gh-proxy.com/https://github.com/k2-fsa/sherpa-onnx/releases/download/source-separation-models/UVR-MDX-NET-Inst_HQ_5.onnx',
      'https://github.com/k2-fsa/sherpa-onnx/releases/download/source-separation-models/UVR-MDX-NET-Inst_HQ_5.onnx',
      'https://ghfast.top/https://github.com/k2-fsa/sherpa-onnx/releases/download/source-separation-models/UVR-MDX-NET-Inst_HQ_5.onnx',
    ],
    nFft: 6144,
    hop: 1024,
    dimF: 3072,
    dimT: 256,
    compensate: 1.03,
    primaryStem: 'instrumental',
  },
  {
    id: 'inst-main',
    name: 'Inst_Main（伴奏优先・标准档（快））',
    fileName: 'Inst_Main.onnx',
    urls: [
      'https://gh-proxy.com/https://github.com/k2-fsa/sherpa-onnx/releases/download/source-separation-models/UVR-MDX-NET-Inst_Main.onnx',
      'https://github.com/k2-fsa/sherpa-onnx/releases/download/source-separation-models/UVR-MDX-NET-Inst_Main.onnx',
      'https://ghfast.top/https://github.com/k2-fsa/sherpa-onnx/releases/download/source-separation-models/UVR-MDX-NET-Inst_Main.onnx',
    ],
    // 实测校验：UVR-MDX-NET-Inst_Main.onnx 输入张量为 (1,4,2048,256)，dimF=2048 → nFft=4096（非 6144 家族）
    nFft: 4096,
    hop: 1024,
    dimF: 2048,
    dimT: 256,
    compensate: 1.03,
    primaryStem: 'instrumental',
  },
  {
    id: 'voc-ft',
    name: 'Voc_FT（人声优先・保真）',
    fileName: 'Voc_FT.onnx',
    urls: [
      'https://gh-proxy.com/https://github.com/k2-fsa/sherpa-onnx/releases/download/source-separation-models/UVR-MDX-NET-Voc_FT.onnx',
      'https://github.com/k2-fsa/sherpa-onnx/releases/download/source-separation-models/UVR-MDX-NET-Voc_FT.onnx',
      'https://ghfast.top/https://github.com/k2-fsa/sherpa-onnx/releases/download/source-separation-models/UVR-MDX-NET-Voc_FT.onnx',
    ],
    nFft: 6144,
    hop: 1024,
    dimF: 3072,
    dimT: 256,
    compensate: 1.03,
    primaryStem: 'vocals',
  },
  {
    id: 'kara',
    name: 'MDXNET_KARA（伴奏优先·卡拉OK特化）',
    fileName: 'MDXNET_KARA.onnx',
    urls: [
      'https://gh-proxy.com/https://github.com/k2-fsa/sherpa-onnx/releases/download/source-separation-models/UVR_MDXNET_KARA.onnx',
      'https://github.com/k2-fsa/sherpa-onnx/releases/download/source-separation-models/UVR_MDXNET_KARA.onnx',
      'https://ghfast.top/https://github.com/k2-fsa/sherpa-onnx/releases/download/source-separation-models/UVR_MDXNET_KARA.onnx',
    ],
    // 实测校验：该模型输入张量为 (1,4,2048,256)，dimF=2048 → nFft=4096（非 6144 家族）
    nFft: 4096,
    hop: 1024,
    dimF: 2048,
    dimT: 256,
    // 社区未发布 KARA 专属补偿值，沿用 MDX 标准 1.03；如输出音量偏差可在此调整
    compensate: 1.03,
    primaryStem: 'instrumental',
  },
];

/** 模型保存目录默认值：用户数据目录下 models。 */
export function getDefaultModelDir(): string {
  return path.join(app.getPath('userData'), 'models');
}

/** 读取持久化的模型保存目录；未设置过时返回默认目录。 */
export function getModelDir(): string {
  try {
    const configPath = path.join(app.getPath('userData'), SEPARATOR_CONFIG_FILE);
    if (!fs.existsSync(configPath)) return getDefaultModelDir();
    const raw = fs.readFileSync(configPath, 'utf8');
    const config = JSON.parse(raw) as { modelDir?: unknown };
    if (typeof config?.modelDir === 'string' && config.modelDir.trim()) {
      return config.modelDir.trim();
    }
  } catch {
    /* 配置损坏时回退默认目录 */
  }
  return getDefaultModelDir();
}

/** 持久化模型保存目录（调用方已确认目录存在且可写）。 */
export function setModelDir(dir: string): void {
  const configPath = path.join(app.getPath('userData'), SEPARATOR_CONFIG_FILE);
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify({ modelDir: dir }, null, 2), 'utf8');
}

export function getModelPath(spec: ModelSpec): string {
  return path.join(getModelDir(), spec.fileName);
}

/** 模型是否已下载（且大小 > 1MB，避免半截文件）。 */
export function isModelDownloaded(spec: ModelSpec): boolean {
  const p = getModelPath(spec);
  return fs.existsSync(p) && fs.statSync(p).size > 1_000_000;
}

/** 下载单个 URL（写入临时文件，完成后重命名）。 */
function downloadUrl(
  url: string,
  dest: string,
  onProgress: (received: number, total: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    // 连接超时：超过该时长仍未建立连接（或收到首个字节）则视为该源不可用。
    const CONNECT_TIMEOUT_MS = 10_000;
    // 卡死超时：下载开始后超过该时长没有新数据，判定该源"僵尸慢"，自动中止换源。
    const STALL_TIMEOUT_MS = 20_000;

    /** 发起一次 HTTP GET，成功返回响应流，失败 reject。 */
    const getOnce = (u: string): Promise<import('node:http').IncomingMessage> =>
      new Promise((res, rej) => {
        const req = https.get(u, { headers: { 'User-Agent': 'DakeMusic' } }, res);
        // 连接/首响应超时
        const connectTimer = setTimeout(() => {
          req.destroy(new Error('连接超时'));
        }, CONNECT_TIMEOUT_MS);
        req.on('response', () => clearTimeout(connectTimer));
        req.on('error', (err) => {
          clearTimeout(connectTimer);
          rej(err);
        });
      });

    /** 跟随重定向，把响应写入临时文件，完成后重命名。 */
    const download = (u: string, redirectsLeft: number): void => {
      getOnce(u)
        .then((res) => {
          if (
            res.statusCode &&
            res.statusCode >= 300 &&
            res.statusCode < 400 &&
            res.headers.location
          ) {
            if (redirectsLeft <= 0) {
              reject(new Error('重定向过多'));
              return;
            }
            res.resume();
            download(res.headers.location, redirectsLeft - 1);
            return;
          }
          if (res.statusCode !== 200) {
            reject(new Error(`HTTP ${res.statusCode}`));
            return;
          }
          const total = parseInt(res.headers['content-length'] || '0', 10);
          let received = 0;
          const tmp = `${dest}.part`;
          const file = fs.createWriteStream(tmp);

          // 卡死超时：超过该时长无新数据则中止本次请求，让 ensureModel 换下一个源
          let stallTimer: NodeJS.Timeout | null = null;
          const refreshStall = () => {
            if (stallTimer) clearTimeout(stallTimer);
            stallTimer = setTimeout(() => {
              res.destroy();
              file.destroy();
              reject(new Error('下载停滞（无进展超时）'));
            }, STALL_TIMEOUT_MS);
          };
          refreshStall();

          res.on('data', (chunk) => {
            received += chunk.length;
            onProgress(received, total);
            refreshStall();
          });
          res.pipe(file);
          file.on('finish', () => {
            if (stallTimer) clearTimeout(stallTimer);
            file.close((err) => {
              if (err) {
                reject(err);
                return;
              }
              fs.renameSync(tmp, dest);
              resolve();
            });
          });
          file.on('error', reject);
        })
        .catch(reject);
    };

    download(url, 5);
  });
}

/**
 * 确保模型已下载（必要时下载）。
 * @param onProgress 进度百分比 0..1
 */
export async function ensureModel(
  spec: ModelSpec,
  onProgress: (percent: number) => void,
): Promise<void> {
  if (isModelDownloaded(spec)) return;
  fs.mkdirSync(getModelDir(), { recursive: true });
  const dest = getModelPath(spec);
  let lastError: unknown = null;
  for (const url of spec.urls) {
    try {
      await downloadUrl(url, dest, (received, total) => {
        if (total > 0) onProgress(received / total);
      });
      if (isModelDownloaded(spec)) return;
    } catch (err) {
      lastError = err;
      // 清理半截文件，尝试下一个源
      try {
        if (fs.existsSync(`${dest}.part`)) fs.unlinkSync(`${dest}.part`);
      } catch {
        /* ignore */
      }
    }
  }
  throw new Error(
    `模型下载失败，请检查网络后重试。${lastError instanceof Error ? `（${lastError.message}）` : ''}`,
  );
}

/** 加载 ONNX 推理会话。 */
export async function loadSession(spec: ModelSpec): Promise<InferenceSession> {
  const session = await InferenceSession.create(getModelPath(spec), {
    graphOptimizationLevel: 'all',
  });
  return session;
}
