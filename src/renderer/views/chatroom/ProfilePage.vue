<!--
  DakeMusic 语聊房模块
  作者：知之Dake
  文件：ProfilePage.vue
  描述：个人中心页 - 头像/昵称/个人资料编辑
-->
<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import { roomApi } from '@/utils/roomApi';
import { useChatRoomStore } from '@/stores/chatRoom';
import { useSettingStore } from '@/stores/setting';
import Button from '@/components/ui/Button.vue';

const router = useRouter();
const chatStore = useChatRoomStore();
const settingStore = useSettingStore();

interface UserProfile {
  userId: number;
  name: string;
  nickname?: string;   // 昵称（显示名，优先于 name 展示）
  avatar: string;
  age: number;
  zodiac: string;
  photos: string[];
  bio: string;
  city?: string;       // DakeMusic: 城市
  gender?: string;     // DakeMusic: 性别 male/female/secret
  ip?: string;         // DakeMusic: IP 地址（脱敏）
}

const profile = ref<UserProfile | null>(null);
const loading = ref(false);
const saving = ref(false);
const editMode = ref(false);

// 编辑表单
const editBio = ref('');
const editPhotos = ref<string[]>([]);
const editAvatar = ref('');
const editName = ref('');
// DakeMusic: 新增资料编辑
const editAge = ref(0);
const editCity = ref('');
const editGender = ref('secret');

// DakeMusic: 自动检测背景亮度，动态调整文字颜色
const isDarkBg = ref(true); // 默认深色背景

async function detectBackgroundBrightness() {
  if (!settingStore.chatroomBackgroundImage) {
    isDarkBg.value = true; // 没有自定义背景，用默认深色
    return;
  }
  try {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.src = settingStore.chatroomBackgroundImage;
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
    });
    // 采样图片平均亮度
    const canvas = document.createElement('canvas');
    const size = 50;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(img, 0, 0, size, size);
    const data = ctx.getImageData(0, 0, size, size).data;
    let sum = 0;
    for (let i = 0; i < data.length; i += 4) {
      // 灰度公式
      sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    }
    const avg = sum / (data.length / 4);
    // 亮度 < 128 认为是深色背景
    isDarkBg.value = avg < 128;
  } catch {
    isDarkBg.value = true; // 检测失败默认深色
  }
}

// 监听背景变化，自动检测
watch(() => settingStore.chatroomBackgroundImage, () => {
  detectBackgroundBrightness();
}, { immediate: true });
// DakeMusic: 省市级联数据
const provinceData: Record<string, string[]> = {
  '北京': ['东城区', '西城区', '朝阳区', '海淀区', '丰台区', '石景山区', '通州区', '昌平区', '大兴区', '顺义区'],
  '上海': ['黄浦区', '徐汇区', '长宁区', '静安区', '普陀区', '虹口区', '杨浦区', '浦东新区', '闵行区', '宝山区'],
  '广东': ['广州', '深圳', '东莞', '佛山', '珠海', '中山', '惠州', '汕头', '江门', '湛江', '肇庆', '梅州'],
  '浙江': ['杭州', '宁波', '温州', '嘉兴', '湖州', '绍兴', '金华', '衢州', '舟山', '台州', '丽水'],
  '江苏': ['南京', '苏州', '无锡', '常州', '镇江', '南通', '扬州', '泰州', '盐城', '淮安', '徐州', '连云港'],
  '四川': ['成都', '绵阳', '德阳', '南充', '宜宾', '泸州', '乐山', '自贡', '内江', '遂宁', '眉山', '凉山'],
  '湖北': ['武汉', '宜昌', '襄阳', '荆州', '黄石', '十堰', '孝感', '荆门', '鄂州', '黄冈', '咸宁'],
  '湖南': ['长沙', '株洲', '湘潭', '衡阳', '岳阳', '常德', '张家界', '益阳', '郴州', '永州', '怀化'],
  '山东': ['济南', '青岛', '烟台', '潍坊', '淄博', '威海', '日照', '临沂', '德州', '聊城', '济宁', '泰安'],
  '河南': ['郑州', '洛阳', '开封', '南阳', '安阳', '新乡', '焦作', '许昌', '商丘', '信阳', '周口', '驻马店'],
  '河北': ['石家庄', '唐山', '保定', '邯郸', '廊坊', '沧州', '秦皇岛', '邢台', '张家口', '衡水', '承德'],
  '福建': ['福州', '厦门', '泉州', '漳州', '莆田', '宁德', '三明', '南平', '龙岩'],
  '陕西': ['西安', '咸阳', '宝鸡', '渭南', '汉中', '延安', '榆林', '安康', '商洛'],
  '重庆': ['渝中区', '江北区', '沙坪坝区', '九龙坡区', '南岸区', '渝北区', '巴南区', '万州区', '涪陵区'],
  '辽宁': ['沈阳', '大连', '鞍山', '抚顺', '本溪', '丹东', '锦州', '营口', '盘锦', '葫芦岛'],
  '云南': ['昆明', '曲靖', '玉溪', '保山', '昭通', '丽江', '普洱', '临沧', '大理', '楚雄', '红河'],
  '安徽': ['合肥', '芜湖', '蚌埠', '淮南', '马鞍山', '淮北', '铜陵', '安庆', '黄山', '滁州', '阜阳'],
  '江西': ['南昌', '景德镇', '萍乡', '九江', '新余', '鹰潭', '赣州', '吉安', '宜春', '抚州', '上饶'],
  '广西': ['南宁', '柳州', '桂林', '梧州', '北海', '防城港', '钦州', '贵港', '玉林', '百色', '河池'],
  '山西': ['太原', '大同', '阳泉', '长治', '晋城', '朔州', '晋中', '运城', '忻州', '临汾', '吕梁'],
  '黑龙江': ['哈尔滨', '齐齐哈尔', '鸡西', '鹤岗', '双鸭山', '大庆', '伊春', '佳木斯', '七台河', '牡丹江'],
  '吉林': ['长春', '吉林市', '四平', '辽源', '通化', '白山', '松原', '白城', '延边'],
  '贵州': ['贵阳', '六盘水', '遵义', '安顺', '毕节', '铜仁', '黔西南', '黔东南', '黔南'],
  '海南': ['海口', '三亚', '三沙', '儋州'],
  '甘肃': ['兰州', '嘉峪关', '金昌', '白银', '天水', '武威', '张掖', '平凉', '酒泉', '庆阳'],
  '青海': ['西宁', '海东', '海北', '黄南', '海南州', '果洛', '玉树', '海西'],
  '宁夏': ['银川', '石嘴山', '吴忠', '固原', '中卫'],
  '新疆': ['乌鲁木齐', '克拉玛依', '吐鲁番', '哈密', '昌吉', '伊犁', '阿克苏', '喀什', '和田'],
  '内蒙古': ['呼和浩特', '包头', '乌海', '赤峰', '通辽', '鄂尔多斯', '呼伦贝尔', '巴彦淖尔', '乌兰察布'],
  '西藏': ['拉萨', '日喀则', '昌都', '林芝', '山南', '那曲', '阿里'],
  '天津': ['和平区', '河东区', '河西区', '南开区', '河北区', '红桥区', '滨海新区', '东丽区', '西青区'],
};

const provinceList = Object.keys(provinceData);
const showCityPicker = ref(false);
const selectedProvince = ref('');
const cityList = computed(() => provinceData[selectedProvince.value] || []);

function openCityPicker() {
  showCityPicker.value = true;
  if (editCity.value) {
    for (const [prov, cities] of Object.entries(provinceData)) {
      if (cities.includes(editCity.value)) {
        selectedProvince.value = prov;
        break;
      }
    }
  }
}

function selectProvince(prov: string) {
  selectedProvince.value = prov;
}

function selectCity(city: string) {
  editCity.value = city;
  showCityPicker.value = false;
}

function closeCityPicker() {
  showCityPicker.value = false;
}

// 修改密码
const oldPassword = ref('');
const newPassword = ref('');
const changingPwd = ref(false);
async function changePassword() {
  if (!oldPassword.value || !newPassword.value) return;
  if (newPassword.value.length < 4) { alert('新密码至少4位'); return; }
  changingPwd.value = true;
  try {
    await roomApi.changePassword(oldPassword.value, newPassword.value);
    alert('密码修改成功');
    oldPassword.value = '';
    newPassword.value = '';
  } catch (e: any) {
    alert(e.message || '修改失败');
  } finally {
    changingPwd.value = false;
  }
}

const avatarInput = ref<HTMLInputElement | null>(null);
const photoInput = ref<HTMLInputElement | null>(null);

// 图片预览
const previewIndex = ref(-1);
const previewPhotos = computed(() => profile.value?.photos || []);

function openPreview(index: number) {
  previewIndex.value = index;
}
function closePreview() {
  previewIndex.value = -1;
}
function prevPhoto() {
  if (previewIndex.value > 0) previewIndex.value--;
  else previewIndex.value = previewPhotos.value.length - 1;
}
function nextPhoto() {
  if (previewIndex.value < previewPhotos.value.length - 1) previewIndex.value++;
  else previewIndex.value = 0;
}

onMounted(loadProfile);

async function loadProfile() {
  loading.value = true;
  try {
    profile.value = await roomApi.getMe();
  } catch (e) {
    console.error('加载资料失败', e);
  } finally {
    loading.value = false;
  }
}

function startEdit() {
  if (!profile.value) return;
  editBio.value = profile.value.bio;
  editPhotos.value = [...profile.value.photos];
  editAvatar.value = profile.value.avatar;
  // 编辑的是昵称（显示名），不是登录账号
  editName.value = profile.value.nickname || profile.value.name;
  // DakeMusic: 新增资料编辑
  editAge.value = profile.value.age || 0;
  editCity.value = profile.value.city || '';
  editGender.value = profile.value.gender || 'secret';
  editMode.value = true;
}

function cancelEdit() {
  editMode.value = false;
}

async function saveProfile() {
  saving.value = true;
  try {
    const result: any = await roomApi.updateProfile({
      nickname: editName.value,
      avatar: editAvatar.value,
      photos: editPhotos.value,
      bio: editBio.value,
      // DakeMusic: 新增字段
      age: editAge.value,
      city: editCity.value,
      gender: editGender.value,
    });
    // 改的是昵称：同步本地显示名（登录账号 chat_login_name 不变）
    if (result?.nickname) {
      if (profile.value) profile.value.nickname = result.nickname;
      localStorage.setItem('chat_login_nickname', result.nickname);
    }
    // 同步头像到 localStorage，房间内和列表页即时生效
    if (editAvatar.value) localStorage.setItem('chatroom_avatarImage', editAvatar.value);
    else localStorage.removeItem('chatroom_avatarImage');
    // 更新 store 里的我的头像（即使不在房间里也即时生效）
    chatStore.myAvatar = editAvatar.value || '';
    // 如果在房间内，实时同步头像给房间内所有人
    if (chatStore.isConnected && editAvatar.value) {
      chatStore.updateMyAvatar(editAvatar.value).catch(() => {});
    }
    await loadProfile();
    editMode.value = false;
  } catch (e: any) {
    alert(e.message || '保存失败');
  } finally {
    saving.value = false;
  }
}

function onAvatarSelected(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) { alert('图片不能超过2MB'); return; }
  const reader = new FileReader();
  reader.onload = () => { editAvatar.value = reader.result as string; };
  reader.readAsDataURL(file);
}

function onPhotosSelected(e: Event) {
  const input = e.target as HTMLInputElement;
  const files = Array.from(input.files || []);
  if (editPhotos.value.length + files.length > 9) {
    alert('最多9张图片');
    return;
  }
  files.forEach(file => {
    if (file.size > 2 * 1024 * 1024) { alert(`${file.name} 超过2MB`); return; }
    const reader = new FileReader();
    reader.onload = () => { editPhotos.value.push(reader.result as string); };
    reader.readAsDataURL(file);
  });
}

function removePhoto(index: number) {
  editPhotos.value.splice(index, 1);
}

function removeAvatar() {
  editAvatar.value = '';
}
</script>

<template>
  <div class="relative h-full overflow-y-auto p-6">
    <!-- DakeMusic: 自定义背景层（与房间列表页同步） -->
    <div v-if="settingStore.chatroomBackgroundImage" class="profile-custom-bg" :style="{ backgroundImage: `url(${settingStore.chatroomBackgroundImage})` }">
      <div class="profile-custom-bg-overlay" :style="{ opacity: settingStore.chatroomBackgroundOverlay / 100 }"></div>
    </div>
  <div class="relative max-w-3xl mx-auto pb-20 z-10" :class="isDarkBg ? 'text-white' : 'text-gray-900'">
    <div class="flex items-center gap-3 mb-6">
      <button class="p-1.5 rounded-md hover:bg-black/10 transition-colors" @click="router.push('/main/chatroom')">
        <span class="text-lg">←</span>
      </button>
      <h1 class="text-2xl font-bold">个人中心</h1>
    </div>

    <div v-if="loading" class="text-center py-20 opacity-50">加载中...</div>

    <div v-else-if="profile" class="space-y-6">
      <!-- 查看模式 -->
      <div v-if="!editMode" class="rounded-2xl p-6 backdrop-blur-md" :class="isDarkBg ? 'bg-black/50' : 'bg-white/70'">
        <div class="flex items-start gap-6 mb-6">
          <div class="w-24 h-24 rounded-full shrink-0 p-[2px] bg-transparent border-2 border-[color:var(--border-subtle,rgba(140,140,175,0.35))] transition-colors">
            <div class="w-full h-full rounded-full overflow-hidden bg-transparent flex items-center justify-center">
              <img v-if="profile.avatar" :src="profile.avatar" class="w-full h-full object-cover" />
              <svg v-else class="w-12 h-12 opacity-45" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
              <circle cx="12" cy="8" r="4" />
              <path d="M4 21c0-4.42 3.58-8 8-8s8 3.58 8 8" />
            </svg>
            </div>
          </div>
          <div class="flex-1">
            <h2 class="text-xl font-bold mb-1">{{ profile.nickname || profile.name }}</h2>
            <!-- DakeMusic: 一行展示资料标签，类似社交App -->
            <div class="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-1.5">
              <span class="text-xs opacity-50">ID: {{ 999 + (profile?.userId || 0) }}</span>
              <span v-if="profile.age" :class="['flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded', (profile.gender === 'female' || profile.gender === '女') ? 'bg-gradient-to-r from-pink-500/30 to-pink-400/30 text-pink-300' : 'bg-gradient-to-r from-blue-500/30 to-cyan-500/30 text-blue-300']">
                {{ profile.age }}
                <template v-if="profile.gender === 'male' || profile.gender === '男'">♂</template>
                <template v-else-if="profile.gender === 'female' || profile.gender === '女'">♀</template>
              </span>
              <span v-if="profile.city" class="flex items-center gap-1 text-xs opacity-70">
                <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
                {{ profile.city }}
              </span>
              <span v-if="profile.ip" class="flex items-center gap-1 text-xs opacity-70">
                IP: {{ profile.ip }}
              </span>
            </div>
            <p class="text-xs opacity-40 mt-1">账号：{{ profile.name }}</p>
            <p v-if="profile.bio" class="text-sm opacity-70 mt-2">{{ profile.bio }}</p>
          </div>
          <Button size="sm" @click="startEdit">编辑资料</Button>
        </div>

        <!-- 图片墙 -->
        <div v-if="profile.photos.length > 0">
          <h3 class="text-sm font-bold opacity-60 mb-3">图片墙</h3>
          <div class="grid grid-cols-3 gap-2">
            <div
              v-for="(photo, i) in profile.photos"
              :key="i"
              class="aspect-square rounded-lg overflow-hidden bg-[var(--bg-secondary)] cursor-pointer hover:opacity-80 transition-opacity"
              @click="openPreview(i)"
            >
              <img :src="photo" class="w-full h-full object-cover" />
            </div>
          </div>
        </div>
        <div v-else class="text-center py-8 opacity-40 text-sm">
          还没有图片墙，点击「编辑资料」上传
        </div>
      </div>

      <!-- 编辑模式 -->
      <div v-else class="rounded-2xl p-6 space-y-5 backdrop-blur-md" :class="isDarkBg ? 'bg-black/60' : 'bg-white/80'">
        <!-- 头像 -->
        <div>
          <label class="block text-sm font-bold mb-2 opacity-70">头像</label>
          <div class="flex items-center gap-4">
            <div class="w-20 h-20 rounded-full shrink-0 p-[2px] bg-transparent border-2 border-[color:var(--border-subtle,rgba(140,140,175,0.35))] transition-colors">
              <div class="w-full h-full rounded-full overflow-hidden bg-transparent flex items-center justify-center">
                <img v-if="editAvatar" :src="editAvatar" class="w-full h-full object-cover" />
                <svg v-else class="w-10 h-10 opacity-45" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
                <circle cx="12" cy="8" r="4" />
                <path d="M4 21c0-4.42 3.58-8 8-8s8 3.58 8 8" />
              </svg>
              </div>
            </div>
            <div class="flex gap-2">
              <button
                class="px-4 py-1.5 rounded-lg text-white text-sm bg-gradient-to-r from-blue-500 to-cyan-500 hover:opacity-90 transition-opacity"
                @click="avatarInput?.click()"
              >上传头像</button>
              <button
                v-if="editAvatar"
                class="px-4 py-1.5 rounded-lg text-white text-sm bg-gradient-to-r from-red-500 to-pink-500 hover:opacity-90 transition-opacity"
                @click="removeAvatar"
              >移除</button>
            </div>
            <input ref="avatarInput" type="file" accept="image/*" class="hidden" @change="onAvatarSelected" />
          </div>
        </div>

        <!-- 账号 + 用户ID（同一行） -->
        <div class="flex items-center justify-between py-2 px-3 rounded-lg" :class="isDarkBg ? 'bg-white/10' : 'bg-black/5'">
          <div class="flex items-center gap-2">
            <span class="text-sm opacity-70">账号：</span>
            <span class="text-sm font-mono opacity-80">{{ profile?.name }}（不可修改）</span>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-sm opacity-70">ID：</span>
            <span class="text-sm font-mono opacity-80">{{ 999 + (profile?.userId || 0) }}</span>
          </div>
        </div>

        <!-- 昵称 -->
        <div>
          <label class="block text-sm font-bold mb-2 opacity-70">昵称 <span class="text-xs font-normal opacity-50">（房间里的显示名）</span></label>
          <input
            v-model="editName"
            type="text"
            maxlength="20"
              class="w-full px-3 py-2 rounded-lg border focus:outline-none focus:border-[var(--color-primary)]"
              :class="isDarkBg ? 'bg-white/10 border-white/20' : 'bg-black/5 border-black/10'"
            placeholder="输入昵称"
          />
        </div>

        <!-- DakeMusic: 年龄 + 性别（合一行） -->
        <div class="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label class="block text-sm font-bold mb-2 opacity-70">年龄</label>
            <input
              v-model.number="editAge"
              type="number"
              min="18"
              max="100"
              class="w-full px-3 py-2 rounded-lg border focus:outline-none focus:border-[var(--color-primary)]"
              :class="isDarkBg ? 'bg-white/10 border-white/20' : 'bg-black/5 border-black/10'"
              placeholder="年龄"
            />
          </div>
          <div>
            <label class="block text-sm font-bold mb-2 opacity-70">性别</label>
            <div class="flex gap-3 items-center h-[38px]">
              <label class="flex items-center gap-1.5 cursor-pointer" @click="editGender = 'male'">
                <span
                  class="w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all"
                  :class="editGender === 'male' ? 'border-blue-400' : 'border-gray-500'"
                >
                  <span v-if="editGender === 'male'" class="w-2 h-2 rounded-full bg-blue-400"></span>
                </span>
                <span class="text-blue-400 text-sm">♂ 男</span>
              </label>
              <label class="flex items-center gap-1.5 cursor-pointer" @click="editGender = 'female'">
                <span
                  class="w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all"
                  :class="editGender === 'female' ? 'border-pink-400' : 'border-gray-500'"
                >
                  <span v-if="editGender === 'female'" class="w-2 h-2 rounded-full bg-pink-400"></span>
                </span>
                <span class="text-pink-400 text-sm">♀ 女</span>
              </label>
              <label class="flex items-center gap-1.5 cursor-pointer" @click="editGender = 'secret'">
                <span
                  class="w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all"
                  :class="editGender === 'secret' ? 'border-gray-400' : 'border-gray-500'"
                >
                  <span v-if="editGender === 'secret'" class="w-2 h-2 rounded-full bg-gray-400"></span>
                </span>
                <span class="text-gray-400 text-sm">保密</span>
              </label>
            </div>
          </div>
        </div>

        <!-- DakeMusic: 城市（省市级联选择） -->
        <div>
          <label class="block text-sm font-bold mb-2 opacity-70">城市</label>
          <button
            class="w-full px-3 py-2 rounded-lg border text-left focus:outline-none focus:border-[var(--color-primary)] transition-colors"
            :class="isDarkBg ? 'bg-white/10 border-white/20 hover:bg-white/15' : 'bg-black/5 border-black/10 hover:bg-black/10'"
            @click="openCityPicker"
          >
            <span :class="editCity ? '' : 'opacity-50'">{{ editCity || '请选择城市' }}</span>
          </button>
        </div>

        <!-- 修改密码 -->
        <div>
          <label class="block text-sm font-bold mb-2 opacity-70">修改密码</label>
          <div class="space-y-2">
            <input
              v-model="oldPassword"
              type="password"
                class="w-full px-3 py-2 rounded-lg border focus:outline-none focus:border-[var(--color-primary)]"
              :class="isDarkBg ? 'bg-white/10 border-white/20' : 'bg-black/5 border-black/10'"
              placeholder="旧密码"
            />
            <input
              v-model="newPassword"
              type="password"
                class="w-full px-3 py-2 rounded-lg border focus:outline-none focus:border-[var(--color-primary)]"
              :class="isDarkBg ? 'bg-white/10 border-white/20' : 'bg-black/5 border-black/10'"
              placeholder="新密码（至少4位）"
            />
            <button
              class="px-4 py-1.5 rounded-lg bg-[var(--color-primary)] text-white text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
              :disabled="changingPwd || !oldPassword || !newPassword"
              @click="changePassword"
            >{{ changingPwd ? '修改中...' : '修改密码' }}</button>
          </div>
        </div>

        <!-- 简介 -->
        <div>
          <label class="block text-sm font-bold mb-2 opacity-70">个性签名</label>
          <textarea
            v-model="editBio"
            rows="2"
            maxlength="200"
            class="w-full px-3 py-2 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-subtle)] focus:outline-none focus:border-[var(--color-primary)] resize-none"
            placeholder="写点什么..."
          />
        </div>

        <!-- 图片墙 -->
        <div>
          <label class="block text-sm font-bold mb-2 opacity-70">图片墙（最多9张）</label>
          <div class="grid grid-cols-3 gap-2 mb-2">
            <div
              v-for="(photo, i) in editPhotos"
              :key="i"
              class="aspect-square rounded-lg overflow-hidden bg-[var(--bg-secondary)] relative group"
            >
              <img :src="photo" class="w-full h-full object-cover" />
              <button
                class="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                @click="removePhoto(i)"
              >×</button>
            </div>
            <button
              v-if="editPhotos.length < 9"
              class="aspect-square rounded-lg border-2 border-dashed border-[var(--border-subtle)] flex items-center justify-center text-2xl opacity-40 hover:opacity-70 transition-opacity"
              @click="photoInput?.click()"
            >+</button>
          </div>
          <input ref="photoInput" type="file" accept="image/*" multiple class="hidden" @change="onPhotosSelected" />
        </div>

        <!-- 操作 -->
        <div class="flex gap-2 pt-2">
          <Button variant="outline" class="flex-1" @click="cancelEdit">取消</Button>
          <Button class="flex-1" :disabled="saving" @click="saveProfile">
            {{ saving ? '保存中...' : '保存' }}
          </Button>
        </div>
      </div>
    </div>
  </div>
  </div>

  <!-- DakeMusic: 省市级联选择弹窗 -->
  <Teleport to="body">
    <div v-if="showCityPicker" class="fixed inset-0 bg-black/60 z-[9998] flex items-center justify-center" @click.self="closeCityPicker">
      <div
        class="w-[500px] max-w-[90vw] h-[400px] rounded-xl overflow-hidden flex flex-col"
        :class="isDarkBg ? 'bg-gray-900 text-white' : 'bg-white text-gray-900'"
      >
        <!-- 头部 -->
        <div class="flex items-center justify-between px-4 py-3 border-b" :class="isDarkBg ? 'border-white/10' : 'border-black/10'">
          <span class="font-bold">选择城市</span>
          <button class="text-xl opacity-60 hover:opacity-100" @click="closeCityPicker">×</button>
        </div>
        <!-- 两列：省 + 市 -->
        <div class="flex-1 flex overflow-hidden">
          <!-- 省份列 -->
          <div class="w-1/2 overflow-y-auto border-r" :class="isDarkBg ? 'border-white/10' : 'border-black/10'">
            <button
              v-for="prov in provinceList"
              :key="prov"
              class="w-full px-4 py-2.5 text-left text-sm transition-colors"
              :class="selectedProvince === prov
                ? (isDarkBg ? 'bg-blue-500/30 text-blue-300' : 'bg-blue-500/20 text-blue-700')
                : (isDarkBg ? 'hover:bg-white/5' : 'hover:bg-black/5')"
              @click="selectProvince(prov)"
            >
              {{ prov }}
            </button>
          </div>
          <!-- 城市列 -->
          <div class="w-1/2 overflow-y-auto">
            <div v-if="!selectedProvince" class="h-full flex items-center justify-center text-sm opacity-40">
              请先选择省份
            </div>
            <button
              v-for="city in cityList"
              :key="city"
              class="w-full px-4 py-2.5 text-left text-sm transition-colors"
              :class="editCity === city
                ? (isDarkBg ? 'bg-blue-500/30 text-blue-300' : 'bg-blue-500/20 text-blue-700')
                : (isDarkBg ? 'hover:bg-white/5' : 'hover:bg-black/5')"
              @click="selectCity(city)"
            >
              {{ city }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- 图片预览弹窗 -->
  <Teleport to="body">
    <div
      v-if="previewIndex >= 0 && previewPhotos[previewIndex]"
      class="fixed inset-0 bg-black/90 z-[9999] flex items-center justify-center"
      @click.self="closePreview"
    >
      <!-- 关闭 -->
      <button
        class="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white text-xl flex items-center justify-center transition-colors"
        @click="closePreview"
      >×</button>
      <!-- 上一张 -->
      <button
        v-if="previewPhotos.length > 1"
        class="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white text-xl flex items-center justify-center transition-colors"
        @click="prevPhoto"
      >‹</button>
      <!-- 下一张 -->
      <button
        v-if="previewPhotos.length > 1"
        class="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white text-xl flex items-center justify-center transition-colors"
        @click="nextPhoto"
      >›</button>
      <!-- 图片 -->
      <img
        :src="previewPhotos[previewIndex]"
        class="max-w-[90vw] max-h-[85vh] object-contain rounded-lg"
        @click.stop
      />
      <!-- 计数 -->
      <div class="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/60 text-sm">
        {{ previewIndex + 1 }} / {{ previewPhotos.length }}
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
/* DakeMusic: 自定义背景层（与房间列表页同步） */
.profile-custom-bg {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-size: cover;
  background-position: center;
  z-index: 0;
}
.profile-custom-bg-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: #0b0b16;
}
</style>
