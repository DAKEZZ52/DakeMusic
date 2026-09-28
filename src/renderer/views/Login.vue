<script setup lang="ts">
import { ref, reactive, watch, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { useUserStore } from '@/stores/user';
import {
  getLoginQrKey,
  createLoginQr,
  checkLoginQr,
  createWxLogin,
  checkWxLogin,
  loginByOpenPlat,
  createQqLoginQr,
  checkQqLoginQr,
  type QqLoginQrSession,
} from '@/api/user';
import {
  cancelKugouVerification,
  completeKugouLoginVerification,
  kugouVerificationState,
} from '@/utils/kugouVerification';
import logger from '@/utils/logger';
import { closeTransientView } from '@/utils/navigation';

// UI 组件
import Tabs from '@/components/ui/Tabs.vue';
import TabsList from '@/components/ui/TabsList.vue';
import TabsTrigger from '@/components/ui/TabsTrigger.vue';
import TabsContent from '@/components/ui/TabsContent.vue';
import Button from '@/components/ui/Button.vue';
import Tooltip from '@/components/ui/Tooltip.vue';
import OverlayHeader from '@/layouts/OverlayHeader.vue';
import Image from '@/components/ui/Image.vue';

import {
  iconBrandQq,
  iconBrandWechat,
  iconCheck,
  iconChevronLeft,
  iconQrCode,
  iconRefreshCw,
} from '@/icons';

const router = useRouter();
const userStore = useUserStore();

// ============================================================
// 类型定义
// ============================================================

type LoginMethod = 'kugou' | 'qq' | 'wechat';

type QrPanelState = 'idle' | 'loading' | 'waiting' | 'scanned' | 'confirmed' | 'expired' | 'error';

interface QrPanelData {
  url: string;
  state: QrPanelState;
  message: string;
  error: string;
  session: QqLoginQrSession | string | null; // qq 存 session 对象，kugou/wechat 存 key/uuid 字符串
}

// ============================================================
// 登录方式配置
// ============================================================

const loginMethods = [
  { value: 'kugou' as const, label: '酷狗', icon: iconQrCode, tone: 'primary' as const },
  { value: 'qq' as const, label: 'QQ', icon: iconBrandQq, tone: 'qq' as const },
  { value: 'wechat' as const, label: '微信', icon: iconBrandWechat, tone: 'wechat' as const },
];

const activeMethod = ref<LoginMethod>('kugou');

// ============================================================
// 会话版本控制（切换 Tab / 卸载时让旧轮询自动退出）
// ============================================================

let sessionVersion = 0;
let isLoginDone = userStore.isLoggedIn;

const invalidateSession = () => ++sessionVersion;
const isSessionActive = (version: number, method: LoginMethod) =>
  !isLoginDone && version === sessionVersion && activeMethod.value === method;

const POLL_INTERVAL = 3000;
const waitForNextPoll = () =>
  new Promise<void>((resolve) => window.setTimeout(resolve, POLL_INTERVAL));

// ============================================================
// 登录完成处理
// ============================================================

const completeLogin = (data: Record<string, unknown>) => {
  isLoginDone = true;
  invalidateSession();
  userStore.handleLoginSuccess(data);
  completeKugouLoginVerification();
  void closeTransientView(router, { query: router.currentRoute.value.query });
};

const closeLoginPage = async () => {
  if (kugouVerificationState.status === 'awaiting-login') {
    cancelKugouVerification();
  }
  await closeTransientView(router, { query: router.currentRoute.value.query });
};

// ============================================================
// 通用工具
// ============================================================

const getApiErrorBody = (error: unknown): unknown => {
  if (!error || typeof error !== 'object') return null;
  return ((error as { response?: { body?: unknown } }).response?.body) ?? null;
};

const getApiErrorMessage = (error: unknown, fallback: string): string => {
  const body = getApiErrorBody(error);
  if (!body || typeof body !== 'object') return fallback;
  const message = (body as Record<string, unknown>).error ||
    (body as Record<string, unknown>).message ||
    (body as Record<string, unknown>).msg;
  return typeof message === 'string' && message.trim() ? message : fallback;
};

/** 确保图片地址带 data URI 前缀 */
const ensureDataUri = (raw: string, mime: string) =>
  raw.startsWith('data:') ? raw : `data:${mime};base64,${raw}`;

// ============================================================
// 各平台面板状态
// ============================================================

const kugouQr = reactive<QrPanelData>({
  url: '',
  state: 'idle',
  message: '',
  error: '',
  session: null,
});

const qqQr = reactive<QrPanelData>({
  url: '',
  state: 'idle',
  message: '',
  error: '',
  session: null,
});

const wechatQr = reactive<QrPanelData>({
  url: '',
  state: 'idle',
  message: '',
  error: '',
  session: null,
});

const panels: Record<LoginMethod, QrPanelData> = {
  kugou: kugouQr,
  qq: qqQr,
  wechat: wechatQr,
};

// ============================================================
// 酷狗扫码
// ============================================================

const loadKugouQr = async () => {
  if (activeMethod.value !== 'kugou' || isLoginDone) return;
  const version = invalidateSession();
  kugouQr.state = 'loading';
  kugouQr.url = '';
  kugouQr.message = '';
  kugouQr.error = '';
  kugouQr.session = null;

  try {
    const keyRes: any = await getLoginQrKey();
    if (!isSessionActive(version, 'kugou')) return;

    const qrcode = keyRes?.data?.qrcode || keyRes?.data?.key;
    if (keyRes?.status !== 1 || !qrcode) throw new Error('Kugou QR key response invalid');

    kugouQr.session = qrcode;

    if (keyRes.data.qrcode_img) {
      kugouQr.url = keyRes.data.qrcode_img;
    } else {
      const createRes: any = await createLoginQr(qrcode);
      if (!isSessionActive(version, 'kugou')) return;
      if (createRes?.status === 1 && createRes.data?.qrcode_img) {
        kugouQr.url = createRes.data.qrcode_img;
      } else {
        throw new Error('Kugou QR image response invalid');
      }
    }

    kugouQr.state = 'waiting';
    void pollKugouQr(version);
  } catch (e) {
    if (!isSessionActive(version, 'kugou')) return;
    logger.error('Login', 'Load Kugou QR Error:', e);
    kugouQr.state = 'error';
    kugouQr.error = getApiErrorMessage(e, '二维码加载失败，请稍后重试');
  }
};

const pollKugouQr = async (version: number) => {
  while (isSessionActive(version, 'kugou')) {
    try {
      const res: any = await checkLoginQr(kugouQr.session as string);
      if (!isSessionActive(version, 'kugou')) break;

      const status: number = res?.data?.status ?? res?.status ?? 0;
      if (status === 4 && res?.data) {
        completeLogin(res.data);
        break;
      } else if (status === 2) {
        kugouQr.state = 'scanned';
      } else if (status === 0) {
        kugouQr.state = 'expired';
        break;
      }
    } catch (e) {
      if (!isSessionActive(version, 'kugou')) break;
      logger.error('Login', 'Poll Kugou QR Error:', e);
      kugouQr.state = 'error';
      kugouQr.error = getApiErrorMessage(e, '扫码状态检查失败，请稍后重试');
      break;
    }
    await waitForNextPoll();
  }
};

// ============================================================
// QQ 扫码
// ============================================================

const parseQqSession = (response: unknown): QqLoginQrSession | null => {
  if (!response || typeof response !== 'object') return null;
  const r = response as Record<string, unknown>;
  const required = ['cookie', 'qrsig', 'pt_login_sig', 'pt_openlogin_data', 'xlogin_url'];
  if (required.some((f) => typeof r[f] !== 'string' || !r[f])) return null;
  if (typeof r.ptqrtoken !== 'string' && typeof r.ptqrtoken !== 'number') return null;
  if (!String(r.ptqrtoken)) return null;
  return {
    cookie: r.cookie as string,
    qrsig: r.qrsig as string,
    ptqrtoken: r.ptqrtoken as string | number,
    pt_login_sig: r.pt_login_sig as string,
    pt_openlogin_data: r.pt_openlogin_data as string,
    xlogin_url: r.xlogin_url as string,
  };
};

const loadQqQr = async () => {
  if (activeMethod.value !== 'qq' || isLoginDone) return;
  const version = invalidateSession();
  qqQr.state = 'loading';
  qqQr.url = '';
  qqQr.message = '';
  qqQr.error = '';
  qqQr.session = null;

  try {
    const response: any = await createQqLoginQr();
    if (!isSessionActive(version, 'qq')) return;

    const session = parseQqSession(response);
    const qrcode = typeof response?.qrcode === 'string' ? response.qrcode : '';
    if (!session || !qrcode) throw new Error('QQ QR response incomplete');

    qqQr.session = session;
    qqQr.url = ensureDataUri(qrcode, 'image/png');
    qqQr.state = 'waiting';
    qqQr.message = '等待 QQ 扫码';
    void pollQqQr(version);
  } catch (e) {
    if (!isSessionActive(version, 'qq')) return;
    logger.error('Login', 'Load QQ QR Error:', e);
    qqQr.state = 'error';
    qqQr.error = getApiErrorMessage(e, 'QQ 二维码加载失败，请稍后重试');
  }
};

const pollQqQr = async (version: number) => {
  while (isSessionActive(version, 'qq')) {
    try {
      const response: any = await checkQqLoginQr(qqQr.session as QqLoginQrSession);
      if (!isSessionActive(version, 'qq')) break;

      if (Number(response?.status) === 1 && response?.data?.token) {
        completeLogin(response.data);
        break;
      }

      const status = String(response?.status ?? '');
      const msg = typeof response?.msg === 'string' ? response.msg : '';
      if (status === 'wait' || status === '66') {
        qqQr.state = 'waiting';
        qqQr.message = msg || '等待 QQ 扫码';
      } else if (status === '67') {
        qqQr.state = 'scanned';
        qqQr.message = msg || '已扫码，请在 QQ 中确认';
      } else if (status === 'expired' || status === '65') {
        qqQr.state = 'expired';
        qqQr.message = msg || '二维码已过期';
        break;
      } else {
        qqQr.state = 'error';
        qqQr.error = msg || 'QQ 扫码状态异常，请重新加载';
        break;
      }
    } catch (e) {
      if (!isSessionActive(version, 'qq')) break;
      logger.error('Login', 'Poll QQ QR Error:', e);
      qqQr.state = 'error';
      qqQr.error = getApiErrorMessage(e, 'QQ 登录状态检查失败，请稍后重试');
      break;
    }
    await waitForNextPoll();
  }
};

// ============================================================
// 微信扫码
// ============================================================

const loadWechatQr = async () => {
  if (activeMethod.value !== 'wechat' || isLoginDone) return;
  const version = invalidateSession();
  wechatQr.state = 'loading';
  wechatQr.url = '';
  wechatQr.message = '';
  wechatQr.error = '';
  wechatQr.session = null;

  try {
    const res: any = await createWxLogin();
    if (!isSessionActive(version, 'wechat')) return;
    if (!res?.uuid) throw new Error('WeChat QR uuid missing');

    wechatQr.session = res.uuid;
    const base64 = res.qrcode?.qrcodebase64;
    wechatQr.url = base64
      ? ensureDataUri(base64, 'image/jpeg')
      : res.qrcode?.qrcodeurl || '';

    if (!wechatQr.url) throw new Error('WeChat QR image missing');
    wechatQr.state = 'waiting';
    void pollWechatQr(version);
  } catch (e) {
    if (!isSessionActive(version, 'wechat')) return;
    logger.error('Login', 'Load WeChat QR Error:', e);
    wechatQr.state = 'error';
    wechatQr.error = getApiErrorMessage(e, '微信二维码加载失败，请稍后重试');
  }
};

const pollWechatQr = async (version: number) => {
  while (isSessionActive(version, 'wechat')) {
    try {
      const res: any = await checkWxLogin(wechatQr.session as string, Date.now());
      if (!isSessionActive(version, 'wechat')) break;
      if (!res) continue;

      const code = res.wx_errcode || res.status;
      if (code === 405) {
        const wxCode = res.wx_code;
        if (wxCode) {
          const loginRes: any = await loginByOpenPlat(wxCode);
          if (!isSessionActive(version, 'wechat')) break;
          if (loginRes?.status === 1 || loginRes?.code === 200) {
            completeLogin(loginRes.data || loginRes.body?.data || loginRes);
          } else {
            wechatQr.state = 'error';
            wechatQr.error = loginRes?.msg || loginRes?.message || '微信登录失败，请重试';
          }
        } else {
          wechatQr.state = 'error';
          wechatQr.error = '微信授权信息缺失，请重试';
        }
        break;
      } else if (code === 404) {
        wechatQr.state = 'scanned';
      } else if (code === 403 || code === 402) {
        wechatQr.state = 'expired';
        break;
      } else if (code === 408) {
        wechatQr.state = 'expired';
      }
    } catch (e) {
      if (!isSessionActive(version, 'wechat')) break;
      logger.error('Login', 'Poll WeChat QR Error:', e);
      wechatQr.state = 'error';
      wechatQr.error = getApiErrorMessage(e, '微信登录状态检查失败，请稍后重试');
      break;
    }
    await waitForNextPoll();
  }
};

// ============================================================
// Tab 切换调度
// ============================================================

const loaders: Record<LoginMethod, () => void> = {
  kugou: loadKugouQr,
  qq: loadQqQr,
  wechat: loadWechatQr,
};

const activators: Record<LoginMethod, () => void> = {
  kugou: () => {
    if (kugouQr.url && kugouQr.state === 'waiting') {
      void pollKugouQr(sessionVersion);
    } else {
      loadKugouQr();
    }
  },
  qq: () => {
    if (qqQr.url && (qqQr.state === 'waiting' || qqQr.state === 'scanned')) {
      void pollQqQr(sessionVersion);
    } else {
      loadQqQr();
    }
  },
  wechat: () => {
    if (wechatQr.url && wechatQr.state !== 'error' && wechatQr.state !== 'expired') {
      void pollWechatQr(sessionVersion);
    } else {
      loadWechatQr();
    }
  },
};

const activateLoginMethod = (method: LoginMethod) => {
  if (isLoginDone) return;
  invalidateSession();
  logger.info('Login', 'Login method changed to:', method);
  activators[method]();
};

watch(activeMethod, activateLoginMethod);

watch(
  () => userStore.isLoggedIn,
  (loggedIn) => {
    isLoginDone = loggedIn;
    if (loggedIn) invalidateSession();
  },
);

onMounted(() => {
  isLoginDone = userStore.isLoggedIn;
  if (!isLoginDone) activateLoginMethod(activeMethod.value);
});

onUnmounted(() => {
  invalidateSession();
});

// ============================================================
// 面板渲染辅助（数据驱动，模板只写一份）
// ============================================================

const panelMeta: Record<LoginMethod, { title: string; subtitle: string; brandColor: string }> = {
  kugou: { title: '扫码登录', subtitle: '请使用手机酷狗扫码', brandColor: 'text-primary-text' },
  qq: { title: 'QQ 登录', subtitle: '请使用 QQ 扫描二维码', brandColor: 'text-[#12B7F5]' },
  wechat: { title: '微信登录', subtitle: '请使用微信扫描二维码', brandColor: 'text-[#07C160]' },
};

/** 面板底部状态文案 */
const statusText = (panel: QrPanelData): string => {
  switch (panel.state) {
    case 'loading':
      return '正在生成二维码';
    case 'scanned':
      return '已扫码，等待确认';
    case 'waiting':
      return panel.message || '等待扫码';
    default:
      return '等待扫码';
  }
};

const isLoading = (panel: QrPanelData) => panel.state === 'loading';
const showError = (panel: QrPanelData) => panel.state === 'expired' || panel.state === 'error';
const showScanned = (panel: QrPanelData) => panel.state === 'scanned' || panel.state === 'confirmed';
</script>

<template>
  <div
    class="login-page fixed inset-0 overflow-hidden bg-bg-main text-text-main transition-colors duration-500 select-none flex flex-col"
  >
    <!-- 装饰背景 -->
    <div
      class="absolute inset-0 bg-linear-to-br from-bg-sidebar via-bg-main to-bg-sidebar opacity-60 z-0"
    ></div>
    <div
      class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-200 h-200 rounded-full bg-primary/3 blur-[120px] pointer-events-none z-0"
    ></div>

    <OverlayHeader />

    <div class="flex-1 relative overflow-hidden flex items-center justify-center p-6 z-10">
      <!-- 返回按钮 -->
      <div class="absolute top-12 left-6 z-100">
        <Button
          @click="closeLoginPage"
          variant="unstyled"
          size="none"
          class="no-drag h-10 w-10 min-w-0 rounded-full p-0 flex items-center justify-center text-text-main dark:text-white bg-[var(--control-hover-bg)]"
        >
          <Icon :icon="iconChevronLeft" width="24" height="24" />
        </Button>
      </div>

      <div class="w-full max-w-105 max-h-full flex flex-col items-center">
        <Tabs v-model="activeMethod" activationMode="manual" class="w-full">
          <div class="login-panel-card">
            <div class="px-10 pt-8 flex-1 flex flex-col items-center justify-center">
              <TabsContent
                v-for="m in loginMethods"
                :key="m.value"
                :value="m.value"
                class="w-full animate-fade-in flex flex-col items-center"
              >
                <!-- 标题 -->
                <div class="text-center mb-4">
                  <h1 class="text-[26px] font-black tracking-tight leading-tight mb-1">
                    {{ panelMeta[m.value].title }}
                  </h1>
                  <p class="text-[13px] opacity-60 font-bold uppercase tracking-[1.5px]">
                    {{ panelMeta[m.value].subtitle }}
                  </p>
                </div>

                <!-- 二维码卡片 -->
                <div
                  class="relative w-48 h-48 bg-white p-3.5 rounded-[28px] shadow-[0_12px_40px_rgba(0,0,0,0.06)] border border-black/2"
                >
                  <Image :src="panels[m.value].url" class="w-full h-full rounded-xl" />

                  <!-- 加载中 -->
                  <div
                    v-if="isLoading(panels[m.value])"
                    class="absolute inset-0 bg-white rounded-2xl flex items-center justify-center z-30"
                  >
                    <Icon
                      :icon="iconRefreshCw"
                      width="24"
                      height="24"
                      class="animate-spin"
                      :class="panelMeta[m.value].brandColor"
                    />
                  </div>

                  <!-- 过期/错误 -->
                  <div
                    v-else-if="showError(panels[m.value])"
                    class="absolute inset-0 bg-white/95 rounded-2xl flex flex-col items-center justify-center space-y-4 z-30"
                  >
                    <span class="text-[13px] font-black opacity-60">
                      {{ panels[m.value].error || '二维码已过期' }}
                    </span>
                    <Button
                      @click="loaders[m.value]"
                      variant="ghost"
                      size="xs"
                      class="text-[13px] font-black hover:opacity-80"
                      :class="panelMeta[m.value].brandColor"
                      >重新加载</Button
                    >
                  </div>

                  <!-- 已扫码，等待确认 -->
                  <div
                    v-else-if="showScanned(panels[m.value])"
                    class="absolute inset-0 bg-white/98 rounded-2xl flex flex-col items-center justify-center space-y-5 z-30"
                  >
                    <div
                      class="w-14 h-14 rounded-full flex items-center justify-center text-white"
                      :class="
                        m.value === 'qq'
                          ? 'bg-[#12B7F5]'
                          : m.value === 'wechat'
                            ? 'bg-[#07C160]'
                            : 'bg-green-500'
                      "
                    >
                      <Icon :icon="iconCheck" width="32" height="32" />
                    </div>
                    <p class="text-[14px] font-black opacity-80">请在手机端确认</p>
                  </div>
                </div>

                <!-- 底部状态 + 刷新 -->
                <div class="mt-6 w-full relative flex items-center justify-center">
                  <span class="text-[11px] font-black opacity-40 uppercase tracking-[3px]">
                    {{ statusText(panels[m.value]) }}
                  </span>
                  <button
                    class="absolute right-0 w-7 h-7 rounded-full flex items-center justify-center text-text-main/40 hover:opacity-80 transition-all active:scale-90 disabled:opacity-40"
                    :class="`hover:${panelMeta[m.value].brandColor} hover:bg-current/10`"
                    :disabled="isLoading(panels[m.value])"
                    :aria-label="`刷新 ${panelMeta[m.value].title} 二维码`"
                    @click="loaders[m.value]"
                  >
                    <Icon :icon="iconRefreshCw" width="14" height="14" />
                  </button>
                </div>
              </TabsContent>
            </div>

            <!-- 底部：登录方式选择 -->
            <div class="px-8 pb-7">
              <div
                class="pt-5 border-t border-[var(--border-subtle)] flex flex-col items-center space-y-3"
              >
                <span class="text-[11px] font-black opacity-45 uppercase tracking-[3px]"
                  >选择登录方式</span
                >
                <TabsList
                  class="login-method-list grid! grid-cols-3 gap-2 h-auto! w-full items-stretch"
                >
                  <Tooltip
                    v-for="method in loginMethods"
                    :key="method.value"
                    :content="`${method.label}登录`"
                  >
                    <template #trigger>
                      <TabsTrigger
                        :value="method.value"
                        :data-tone="method.tone"
                        :aria-label="`${method.label}登录`"
                        class="login-method-trigger group h-14! pb-0! flex-col! items-center! justify-center! gap-1 rounded-2xl border border-transparent opacity-65! hover:opacity-100! data-[state=active]:opacity-100! [&_.active-line]:hidden"
                      >
                        <Icon :icon="method.icon" width="20" height="20" />
                        <span class="text-[10px] leading-none font-black">{{ method.label }}</span>
                      </TabsTrigger>
                    </template>
                  </Tooltip>
                </TabsList>
              </div>
            </div>
          </div>
        </Tabs>
      </div>
    </div>
  </div>
</template>

<style scoped>
.login-panel-card {
  display: flex;
  flex-direction: column;
  height: 31.875rem;
  overflow: hidden;
  border-radius: 36px;
  background: var(--color-bg-dialog);
  border: 1px solid var(--border-subtle);
  box-shadow: var(--shadow-dialog);
  -webkit-backdrop-filter: var(--surface-backdrop-filter);
  backdrop-filter: var(--surface-backdrop-filter);
  transition: all 0.5s ease;
}

.animate-fade-in {
  animation: fade-in 0.6s cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
}

:deep(.login-method-trigger) {
  color: var(--color-text-secondary);
  transition:
    color 180ms ease,
    background-color 180ms ease,
    border-color 180ms ease,
    transform 180ms ease;
}

:deep(.login-method-trigger:hover) {
  color: var(--color-primary-text);
  background: color-mix(in srgb, var(--color-primary) 7%, transparent);
}

:deep(.login-method-trigger[data-state='active']) {
  color: var(--color-primary-text);
  border-color: color-mix(in srgb, var(--color-primary) 28%, transparent);
  background: color-mix(in srgb, var(--color-primary) 11%, transparent);
  transform: translateY(-1px);
}

:deep(.login-method-trigger[data-tone='qq'][data-state='active']) {
  color: #12b7f5;
  border-color: rgb(18 183 245 / 28%);
  background: rgb(18 183 245 / 10%);
}

:deep(.login-method-trigger[data-tone='wechat'][data-state='active']) {
  color: #07c160;
  border-color: rgb(7 193 96 / 28%);
  background: rgb(7 193 96 / 10%);
}

@keyframes fade-in {
  from {
    opacity: 0;
    transform: translateY(30px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
