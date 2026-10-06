// DakeMusic 网页版主逻辑 / 作者：知之Dake / 文件：app.js / 描述：登录、1v1 PK房间、语音、聊天、成员/PK位置同步
const { createApp, ref, computed, onMounted } = Vue;

const API_BASE = '';

createApp({
  components: {
    // DakeMusic: 通用组件
    'profile-card': window.ProfileCardComponent,
    'room-cover-upload': window.RoomCoverUploadComponent,
    // DakeMusic: 1v1 PK 组件
    'pk-top-bar': window.PkTopBar,
    'audience-strip': window.AudienceStrip,
    'pk-stage': window.PkStage,
    'chat-overlay': window.ChatOverlay,
    'pk-timer': window.PkTimer,
    'pk-bottom-bar': window.PkBottomBar,
  },
  setup() {
    const token = ref(localStorage.getItem('chat_session') || '');
    const loginName = ref('');
    const loginPassword = ref('');
    const showRegister = ref(false);
    const registerName = ref('');
    const registerNickname = ref('');
    const registerPassword = ref('');

    const rooms = ref([]);
    const inRoom = ref(false);
    const currentRoomName = ref('');
    const currentRoomId = ref('');
    const roomParticipants = ref([]);
    const micOn = ref(false);
    const micDevices = ref([]);
    const selectedMic = ref('');
    const speakerDevices = ref([]);
    const selectedSpeaker = ref('');
    const micVolume = ref(75);
    const speakerVolume = ref(75);
    // DakeMusic: PK 位置：'blue' | 'red' | 'audience'
    const myPkSide = ref('audience');
    const messages = ref([]);
    const chatInput = ref('');
    const showProfileCard = ref(false);
    const viewingUser = ref({ isMe: false, name: '', avatar: '' });
    const isRoomOwner = ref(false);
    let lkRoom = null;
    const openCreateDialog = ref(false);
    const newRoomName = ref('');
    const newRoomPassword = ref('');
    const newRoomCover = ref('');
    let currentMicTrack = null;

    // DakeMusic: PK 票数与倒计时
    const blueScore = ref(0);
    const redScore = ref(0);
    const pkTotal = ref(300);
    const pkRemain = ref(300);
    let pkTimerId = null;

    const participantCount = computed(() => roomParticipants.value.length);

    // DakeMusic: PK 房主（顶部展示，取蓝方/第一个成员）
    const pkHost = computed(() => {
      return roomParticipants.value.find(m => m.isOwner) || pkBlue.value || {};
    });
    // DakeMusic: 蓝方 / 红方
    const pkBlue = computed(() => roomParticipants.value.find(m => m.side === 'blue') || null);
    const pkRed = computed(() => roomParticipants.value.find(m => m.side === 'red') || null);
    // DakeMusic: 观众列表
    const audienceList = computed(() => roomParticipants.value.filter(m => m.side === 'audience'));

    // 登录
    async function handleLogin() {
      try {
        const res = await fetch(`${API_BASE}/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: loginName.value, password: loginPassword.value })
        });
        const data = await res.json();
        if (data.token) {
          token.value = data.token;
          localStorage.setItem('chat_session', data.token);
          fetchRooms();
        } else {
          showToast(data.error || '登录失败');
        }
      } catch (e) {
        showToast('网络错误');
      }
    }

    // 注册
    async function handleRegister() {
      try {
        const res = await fetch(`${API_BASE}/api/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: registerName.value, password: registerPassword.value, nickname: registerNickname.value })
        });
        const data = await res.json();
        if (data.token) {
          token.value = data.token;
          localStorage.setItem('chat_session', data.token);
          showRegister.value = false;
          fetchRooms();
        } else {
          showToast(data.error || '注册失败');
        }
      } catch (e) {
        showToast('网络错误');
      }
    }

    // 退出
    function handleLogout() {
      token.value = '';
      localStorage.removeItem('chat_session');
    }

    // 获取房间列表
    async function fetchRooms() {
      try {
        const res = await fetch(`${API_BASE}/api/rooms`, {
          headers: { 'Authorization': `Bearer ${token.value}` }
        });
        const data = await res.json();
        rooms.value = data.list || [];
      } catch (e) {
        console.error('获取房间列表失败', e);
      }
    }

    // 创建房间
    async function handleCreateRoom() {
      try {
        const res = await fetch(`${API_BASE}/api/rooms`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token.value}`
          },
          body: JSON.stringify({ name: newRoomName.value, password: newRoomPassword.value, coverImage: newRoomCover.value })
        });
        const data = await res.json();
        if (data.id) {
          openCreateDialog.value = false;
          newRoomName.value = '';
          newRoomPassword.value = '';
          newRoomCover.value = '';
          fetchRooms();
        } else {
          showToast(data.error || '创建失败');
        }
      } catch (e) {
        showToast('网络错误');
      }
    }

    // 加入房间
    async function joinRoom(room) {
      try {
        const res = await fetch(`/api/rooms/${room.id}/join`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token.value}`
          },
          body: JSON.stringify({ password: '' })
        });
        const data = await res.json();
        if (data.identity) {
          inRoom.value = true;
          currentRoomName.value = room.name;
          currentRoomId.value = room.id;
          isRoomOwner.value = data.isOwner || false;

          const LK = window.LivekitClient;
          lkRoom = new LK.Room({
            // DakeMusic: 自动订阅所有轨道
            autoSubscribe: true,
            dynacast: false,
            adaptiveStream: false,
          });

          // DakeMusic: 移动端解锁音频自动播放（在用户点击手势内恢复 AudioContext）
          try {
            const tempCtx = new (window.AudioContext || window.webkitAudioContext)();
            if (tempCtx.state === 'suspended') await tempCtx.resume();
          } catch {}

          // 连接 LiveKit：自动适配当前域名 ws/wss，走 /livekit 反代
          const wsProto = location.protocol === 'https:' ? 'wss:' : 'ws:';
          const livekitUrl = `${wsProto}//${location.host}/livekit`;
          await lkRoom.connect(livekitUrl, data.token);

          await updateDeviceList();
          navigator.mediaDevices.addEventListener('devicechange', updateDeviceList);

          // DakeMusic: 房主默认蓝方，其他人默认观众
          const mySide = data.isOwner ? 'blue' : 'audience';
          myPkSide.value = mySide;

          // 初始化自己
          const myInfo = {
            identity: data.identity,
            name: data.name || '我',
            isSpeaking: false,
            isMe: true,
            isOwner: data.isOwner || false,
            avatar: data.avatar || '',
            side: mySide,
          };

          // 加已经在房间里的人，同时从后端拉取头像资料
          const others = [];
          lkRoom.remoteParticipants.forEach((p) => {
            const member = {
              identity: p.identity,
              name: p.name || p.identity,
              isSpeaking: false,
              isMe: false,
              isOwner: false,
              avatar: '',
              side: 'audience',
            };
            others.push(member);
            fetchUserAvatar(p.identity, member);
          });

          roomParticipants.value = [...others, myInfo];

          // DakeMusic: 主动处理连接前已存在的音频轨道，避免漏订阅
          lkRoom.remoteParticipants.forEach((p) => {
            p.trackPublications.forEach((pub) => {
              if (pub.kind === 'audio' && pub.track) mountAudio(pub.track);
            });
          });

          // 房主进房广播自己的位置
          broadcastPresence();
          startPkTimer();

          // 新人加入
          lkRoom.on(LK.RoomEvent.ParticipantConnected, (p) => {
            const member = {
              identity: p.identity,
              name: p.name || p.identity,
              isSpeaking: false,
              isMe: false,
              isOwner: false,
              avatar: '',
              side: 'audience',
            };
            roomParticipants.value.push(member);
            fetchUserAvatar(p.identity, member);
          });

          // 人离开
          lkRoom.on(LK.RoomEvent.ParticipantDisconnected, (p) => {
            roomParticipants.value = roomParticipants.value.filter(m => m.identity !== p.identity);
          });

          // 说话人检测
          lkRoom.on(LK.RoomEvent.ActiveSpeakersChanged, (speakers) => {
            const speakingIds = new Set(speakers.map(s => s.identity));
            roomParticipants.value = roomParticipants.value.map(m => ({
              ...m,
              isSpeaking: speakingIds.has(m.identity)
            }));
          });

          // 聊天 / PK位置 presence 消息
          lkRoom.on(LK.RoomEvent.DataReceived, (payload, participant) => {
            try {
              const msg = JSON.parse(new TextDecoder().decode(payload));
              // DakeMusic: PK 位置同步
              if (msg.presence && participant) {
                roomParticipants.value = roomParticipants.value.map(m => {
                  if (m.identity === participant.identity) {
                    return { ...m, side: msg.presence.side };
                  }
                  return m;
                });
                return;
              }
              if (msg.content) {
                messages.value.push({
                  name: participant?.name || '对方',
                  content: msg.content,
                });
              }
            } catch {}
          });

          // 订阅到对方音频轨道
          lkRoom.on(LK.RoomEvent.TrackSubscribed, (track) => {
            if (track.kind === 'audio') mountAudio(track);
          });

        } else {
          showToast(data.error || '加入失败');
        }
      } catch (e) {
        console.error('加入失败', e);
        showToast('语音连接失败：' + e.message);
      }
    }

    // DakeMusic: 挂载音频元素并主动播放（统一入口，处理移动端自动播放）
    async function mountAudio(track) {
      track.detach().forEach(el => el.remove());
      const el = track.attach();
      el.volume = speakerVolume.value / 100;
      el.autoplay = true;
      el.muted = false;
      el.setAttribute('playsinline', '');
      if (selectedSpeaker.value && el.setSinkId) {
        el.setSinkId(selectedSpeaker.value).catch(() => {});
      }
      document.body.appendChild(el);
      try {
        await el.play();
      } catch {
        const resumePlay = () => { el.play().catch(() => {}); };
        document.addEventListener('touchstart', resumePlay, { once: true });
        document.addEventListener('click', resumePlay, { once: true });
      }
    }

    // DakeMusic: 根据 LiveKit identity（user_xxx）从后端拉取用户头像昵称
    async function fetchUserAvatar(identity, memberRef) {
      try {
        const userId = identity.replace('user_', '');
        if (!/^\d+$/.test(userId)) return;
        const res = await fetch(`/api/users/${userId}`);
        if (!res.ok) return;
        const profile = await res.json();
        memberRef.avatar = profile.avatar || '';
        memberRef.name = profile.nickname || memberRef.name;
        roomParticipants.value = [...roomParticipants.value];
      } catch {}
    }

    // 更新音频设备列表
    async function updateDeviceList() {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        micDevices.value = devices.filter(d => d.kind === 'audioinput');
        speakerDevices.value = devices.filter(d => d.kind === 'audiooutput');
        if (!selectedMic.value && micDevices.value[0]) selectedMic.value = micDevices.value[0].deviceId;
        if (!selectedSpeaker.value && speakerDevices.value[0]) selectedSpeaker.value = speakerDevices.value[0].deviceId;
      } catch (e) { console.warn('获取设备列表失败', e); }
    }

    // 选择麦克风设备
    async function selectMicDevice(deviceId) {
      selectedMic.value = deviceId;
      if (!lkRoom || !micOn.value) return;
      try {
        if (currentMicTrack) {
          currentMicTrack.stop();
          lkRoom.localParticipant.unpublishTrack(currentMicTrack);
        }
        const LK = window.LivekitClient;
        const newTrack = await LK.createLocalAudioTrack({ deviceId: { exact: deviceId } });
        currentMicTrack = newTrack;
        await lkRoom.localParticipant.publishTrack(newTrack, { source: LK.TrackSource.Microphone });
      } catch (e) { showToast('切换麦克风失败：' + e.message); }
    }

    // 选择扬声器设备
    async function selectSpeakerDevice(deviceId) {
      selectedSpeaker.value = deviceId;
      document.querySelectorAll('audio').forEach(el => {
        if (el.setSinkId) el.setSinkId(deviceId);
      });
    }

    // DakeMusic: 开关麦克风（仅 PK 位上的人需要，观众也可以开但不强制）
    async function toggleMic() {
      if (!lkRoom) return;
      const LK = window.LivekitClient;
      micOn.value = !micOn.value;
      if (micOn.value) {
        try {
          const track = await LK.createLocalAudioTrack({
            deviceId: selectedMic.value ? { exact: selectedMic.value } : undefined
          });
          currentMicTrack = track;
          await lkRoom.localParticipant.publishTrack(track, { source: LK.TrackSource.Microphone });
          broadcastPresence();
        } catch (e) {
          micOn.value = false;
          showToast('打开麦克风失败：' + e.message);
        }
      } else {
        if (currentMicTrack) {
          currentMicTrack.stop();
          lkRoom.localParticipant.unpublishTrack(currentMicTrack);
          currentMicTrack = null;
        }
        broadcastPresence();
      }
    }

    // 发送聊天
    async function sendChat() {
      if (!chatInput.value.trim() || !lkRoom) return;
      const content = chatInput.value.trim();
      const data = new TextEncoder().encode(JSON.stringify({ content }));
      await lkRoom.localParticipant.publishData(data, { reliable: true });
      messages.value.push({ name: '我', content });
      chatInput.value = '';
    }

    // DakeMusic: 点击 PK 空位上麦（blue/red），不自动开麦；再次点击自己位置回到观众
    async function clickPkSide(side) {
      // 目标空位：移动过去（房主固定 blue，不允许离开）
      if (isRoomOwner.value && myPkSide.value === 'blue') return;
      myPkSide.value = side;
      broadcastPresence();
    }

    // DakeMusic: 广播自己的 PK 位置、麦克风状态
    async function broadcastPresence() {
      if (!lkRoom) return;
      const data = new TextEncoder().encode(JSON.stringify({
        presence: { side: myPkSide.value, micOn: micOn.value }
      }));
      await lkRoom.localParticipant.publishData(data, { reliable: true });
    }

    // DakeMusic: PK 倒计时
    function startPkTimer() {
      if (pkTimerId) clearInterval(pkTimerId);
      pkRemain.value = pkTotal.value;
      pkTimerId = setInterval(() => {
        if (pkRemain.value > 0) pkRemain.value -= 1;
      }, 1000);
    }

    // 查看资料
    function viewMemberProfile(member) {
      viewingUser.value = member;
      showProfileCard.value = true;
    }

    // 举报房间
    function reportRoom() {
      showToast('举报已提交，平台会尽快核实');
    }

    // 礼物入口（占位，后续扩展礼物面板）
    function openGift() {
      showToast('礼物功能即将上线');
    }

    // 踢人
    async function kickMember(member) {
      if (!confirm(`确定要把 ${member.name} 移出房间吗？`)) return;
      try {
        await fetch(`/api/rooms/${currentRoomId.value}/kick`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token.value}`
          },
          body: JSON.stringify({ targetIdentity: member.identity })
        });
        showProfileCard.value = false;
      } catch {
        showToast('操作失败');
      }
    }

    // 禁言
    async function banMember(member) {
      try {
        await fetch(`/api/rooms/${currentRoomId.value}/ban`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token.value}`
          },
          body: JSON.stringify({ targetIdentity: member.identity, banned: true })
        });
        showProfileCard.value = false;
      } catch {
        showToast('操作失败');
      }
    }

    // DakeMusic: 轻量 Toast，替代原生 alert
    let toastTimer = null;
    const toastText = ref('');
    const toastVisible = ref(false);
    function showToast(text) {
      toastText.value = text;
      toastVisible.value = true;
      if (toastTimer) clearTimeout(toastTimer);
      toastTimer = setTimeout(() => { toastVisible.value = false; }, 2200);
    }

    // 离开房间
    async function leaveRoom() {
      if (pkTimerId) { clearInterval(pkTimerId); pkTimerId = null; }
      if (currentMicTrack) {
        currentMicTrack.stop();
        currentMicTrack = null;
      }
      if (lkRoom) {
        lkRoom.disconnect();
        lkRoom = null;
      }
      if (currentRoomId.value) {
        try {
          await fetch(`/api/rooms/${currentRoomId.value}/leave`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token.value}` }
          });
        } catch {}
      }
      inRoom.value = false;
      currentRoomId.value = '';
      roomParticipants.value = [];
      messages.value = [];
      myPkSide.value = 'audience';
      micOn.value = false;
      fetchRooms();
    }

    onMounted(() => {
      if (token.value) fetchRooms();
    });

    return {
      token, loginName, loginPassword, showRegister,
      registerName, registerNickname, registerPassword,
      rooms, inRoom, currentRoomName, currentRoomId, roomParticipants, participantCount,
      micOn, micDevices, selectedMic, speakerDevices, selectedSpeaker, micVolume, speakerVolume,
      myPkSide, messages, chatInput,
      showProfileCard, viewingUser, isRoomOwner,
      openCreateDialog, newRoomName, newRoomPassword, newRoomCover,
      blueScore, redScore, pkTotal, pkRemain,
      pkHost, pkBlue, pkRed, audienceList,
      toastText, toastVisible,
      handleLogin, handleRegister, handleLogout,
      fetchRooms, handleCreateRoom, joinRoom, leaveRoom, toggleMic, sendChat,
      clickPkSide, viewMemberProfile, kickMember, banMember, reportRoom, openGift,
      selectMicDevice, selectSpeakerDevice,
    };
  }
}).mount('#app');
