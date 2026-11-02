/**
 * 混合 radix FFT，精确复刻 torch.stft 使用的 DFT。
 *
 * 支持 n = 2^a 或 n = 3 * 2^a，例如：
 *   - 4096 = 2^12
 *   - 6144 = 3 * 2^11（UVR-MDX-NET-Inst_HQ_3 的 n_fft）
 *
 * 非 2 的幂长度用 Cooley–Tukey 两因子分解（n = n1 * n2，n1 = 3，n2 = n/3）：
 *   输入映射  i = i1 + n1*i2
 *   输出映射  k = n2*k1 + k2
 * 复数以两个等长 Float32Array（re / im）表示。
 */

const SQRT3_2 = Math.sqrt(3) / 2;
/** 3 点 DFT 的单位根：forward e^{-2πi/3}，inverse e^{+2πi/3}。 */
const W3 = {
  fwd: { re: -0.5, im: -SQRT3_2 },
  inv: { re: -0.5, im: SQRT3_2 },
};

/** twiddle 表缓存。 */
const twiddleCache = new Map<string, { cos: Float32Array; sin: Float32Array }>();

function getTwiddle(n: number, invert: boolean) {
  const key = `${n}:${invert ? 1 : 0}`;
  let table = twiddleCache.get(key);
  if (table) return table;
  const cos = new Float32Array(n);
  const sin = new Float32Array(n);
  const sign = invert ? 1 : -1;
  for (let k = 0; k < n; k += 1) {
    const angle = (sign * 2 * Math.PI * k) / n;
    cos[k] = Math.cos(angle);
    sin[k] = Math.sin(angle);
  }
  table = { cos, sin };
  twiddleCache.set(key, table);
  return table;
}

/**
 * 纯 2 的幂 in-place FFT（radix-2 DIT）。
 * 操作 re.subarray(start, start+n) / im 同样。
 */
function fftPowerOfTwo(
  re: Float32Array,
  im: Float32Array,
  n: number,
  start: number,
  invert: boolean,
): void {
  // bit reversal
  for (let i = 0; i < n; i += 1) {
    let j = 0;
    let x = i;
    let bit = 1;
    while (bit < n) {
      j = (j << 1) | (x & 1);
      x >>= 1;
      bit <<= 1;
    }
    if (j > i) {
      const a = start + i;
      const b = start + j;
      let t = re[a];
      re[a] = re[b];
      re[b] = t;
      t = im[a];
      im[a] = im[b];
      im[b] = t;
    }
  }
  // butterflies
  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1;
    const tw = getTwiddle(len, invert);
    for (let base = 0; base < n; base += len) {
      for (let k = 0; k < half; k += 1) {
        const idx0 = start + base + k;
        const idx1 = idx0 + half;
        const c = tw.cos[k];
        const s = tw.sin[k];
        const br = re[idx1];
        const bi = im[idx1];
        const tr = br * c - bi * s;
        const ti = br * s + bi * c;
        const ar = re[idx0];
        const ai = im[idx0];
        re[idx0] = ar + tr;
        im[idx0] = ai + ti;
        re[idx1] = ar - tr;
        im[idx1] = ai - ti;
      }
    }
  }
}

/** 3 点 DFT（in-place，三个点由 a,b,c 给出）。结果写回 y0,y1,y2 数组。 */
function dft3(
  ar: number,
  ai: number,
  br: number,
  bi: number,
  cr: number,
  ci: number,
  invert: boolean,
): [number, number, number, number, number, number] {
  const w = invert ? W3.inv : W3.fwd;
  // Y0 = a + b + c
  const y0r = ar + br + cr;
  const y0i = ai + bi + ci;
  // Y1 = a + b*w + c*w^2
  const bwr = br * w.re - bi * w.im;
  const bwi = br * w.im + bi * w.re;
  const cw2r = cr * w.re + ci * w.im;
  const cw2i = ci * w.re - cr * w.im;
  const y1r = ar + bwr + cw2r;
  const y1i = ai + bwi + cw2i;
  // Y2 = a + b*w^2 + c*w
  const bw2r = br * w.re + bi * w.im;
  const bw2i = bi * w.re - br * w.im;
  const cwr = cr * w.re - ci * w.im;
  const cwi = cr * w.im + ci * w.re;
  const y2r = ar + bw2r + cwr;
  const y2i = ai + bw2i + cwi;
  return [y0r, y0i, y1r, y1i, y2r, y2i];
}

/** 执行 in-place FFT（n = 2^a 或 3*2^a）。 */
export function fftRadix(re: Float32Array, im: Float32Array, invert = false): void {
  const n = re.length;
  if (n === 1) return;

  // 纯 2 的幂
  if ((n & (n - 1)) === 0) {
    fftPowerOfTwo(re, im, n, 0, invert);
    return;
  }

  // 两因子分解：n = n1 * n2，n1 = 3
  if (n % 3 !== 0) throw new Error(`FFT: 不支持的长度 ${n}`);
  const n1 = 3;
  const n2 = n / 3;
  if ((n2 & (n2 - 1)) !== 0) throw new Error(`FFT: 不支持的长度 ${n}`);

  // 工作缓冲：
  //  bufR/bufI：n2 连续点，供 radix-2
  //  wR/wI：二维布局 work[i1*n2 + k2]
  const bufR = new Float32Array(n2);
  const bufI = new Float32Array(n2);
  const wR = new Float32Array(n);
  const wI = new Float32Array(n);

  const sign = invert ? 1 : -1;
  for (let i1 = 0; i1 < n1; i1 += 1) {
    // gather：i = i1 + n1*i2
    for (let i2 = 0; i2 < n2; i2 += 1) {
      const idx = i1 + n1 * i2;
      bufR[i2] = re[idx];
      bufI[i2] = im[idx];
    }
    // 沿 i2 做 n2 点 FFT
    fftPowerOfTwo(bufR, bufI, n2, 0, invert);
    // 乘 twiddle W_n^{i1*k2}，存 work[i1,k2]
    for (let k2 = 0; k2 < n2; k2 += 1) {
      const angle = (sign * 2 * Math.PI * i1 * k2) / n;
      const c = Math.cos(angle);
      const s = Math.sin(angle);
      const vr = bufR[k2];
      const vi = bufI[k2];
      const out = i1 * n2 + k2;
      wR[out] = vr * c - vi * s;
      wI[out] = vr * s + vi * c;
    }
  }

  // 沿 i1 对每个 k2 做 3 点 DFT，输出 k = n2*k1 + k2
  for (let k2 = 0; k2 < n2; k2 += 1) {
    const a = k2;
    const b = n2 + k2;
    const c = 2 * n2 + k2;
    const [y0r, y0i, y1r, y1i, y2r, y2i] = dft3(wR[a], wI[a], wR[b], wI[b], wR[c], wI[c], invert);
    re[k2] = y0r;
    im[k2] = y0i;
    re[n2 + k2] = y1r;
    im[n2 + k2] = y1i;
    re[2 * n2 + k2] = y2r;
    im[2 * n2 + k2] = y2i;
  }
}

/** 正变换（结果在 re/im 中）。 */
export function forwardFft(re: Float32Array, im: Float32Array): void {
  fftRadix(re, im, false);
}

/** 逆变换（含 1/n 归一化）。 */
export function inverseFft(re: Float32Array, im: Float32Array): void {
  fftRadix(re, im, true);
  const n = re.length;
  for (let i = 0; i < n; i += 1) {
    re[i] /= n;
    im[i] /= n;
  }
}
