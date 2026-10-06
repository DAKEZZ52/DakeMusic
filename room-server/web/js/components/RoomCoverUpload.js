// DakeMusic 网页版房间封面组件 / 作者：知之Dake / 文件：RoomCoverUpload.js / 描述：房间封面上传和修改
window.RoomCoverUploadComponent = {
  props: ['cover', 'isOwner'],
  emits: ['update:cover'],
  template: `
    <div>
      <!-- 封面预览 -->
      <div class="w-full h-32 rounded-lg bg-black/20 overflow-hidden mb-2 relative">
        <img v-if="cover" :src="cover" class="w-full h-full object-cover" />
        <div v-else class="w-full h-full flex items-center justify-center opacity-50">
          <span class="text-sm">暂无封面</span>
        </div>
        <!-- 房主才能改封面 -->
        <label v-if="isOwner" class="absolute bottom-2 right-2 px-2 py-1 bg-black/60 rounded text-xs cursor-pointer hover:bg-black/80">
          更换封面
          <input type="file" accept="image/*" @change="handleUpload" class="hidden" />
        </label>
      </div>
    </div>
  `,
  methods: {
    handleUpload(e) {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        // 压缩封面
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = 400;
          canvas.height = 225;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, 400, 225);
          this.$emit('update:cover', canvas.toDataURL('image/jpeg', 0.8));
        };
        img.src = ev.target.result;
      };
      reader.readAsDataURL(file);
    }
  }
};
