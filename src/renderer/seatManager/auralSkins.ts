/*!
 * DakeMusic 语聊房模块
 * 作者：知之Dake
 * 文件：auralSkins.ts
 * 描述：麦位说话声波皮肤配置 - 用户可切换的说话时头像周围装饰
 */

export interface AuralSkin {
  id: string;
  name: string;
  url: string;
}

// 麦位说话声波皮肤库（图床：daidaiyuyin.com，110x98 webp）
export const AURAL_SKINS: AuralSkin[] = [
  { id: 'default',   name: '默认光环',   url: '' },
  { id: 'xieliu',    name: '斜刘海',     url: 'https://img-play.daidaiyuyin.com/img/2c30a42b0512a23b3b8573868be8af37.webp/110x98' },
  { id: 'huanmao',   name: '幻梦猫耳',   url: 'https://img-play.daidaiyuyin.com/img/d4f7c579b13daa6bf6bf57b3e26ab706.webp/110x98' },
  { id: 'miaowu',    name: '喵呜心愿',   url: 'https://img-play.daidaiyuyin.com/img/76cd316052bfd9c43a9fdb1936e63c4e.webp/110x98' },
  { id: 'shigu',     name: '诗骨为卷',   url: 'https://img-play.daidaiyuyin.com/img/a43001c454688f72e0a6860ae6eabb7a.webp/110x98' },
  { id: 'fanzhou',   name: '泛舟听雨',   url: 'https://img-play.daidaiyuyin.com/img/004bd92fab2d5b35db7bc943d7c8e736.webp/110x98' },
  { id: 'yingfen',   name: '樱粉星翼',   url: 'https://img-play.daidaiyuyin.com/img/71b934858b0923e0d5531506172947cb.webp/110x98' },
  { id: 'huanmie',   name: '梦幻蝶舞',   url: 'https://img-play.daidaiyuyin.com/img/7c39abd9b705a90fb3019fa9a57c99f5.webp/110x98' },
  { id: 'taozhi',    name: '桃枝绮梦',   url: 'https://img-play.daidaiyuyin.com/img/3040895092228d3022e1b48f0f3ed68c.webp/110x98' },
  { id: 'rouman',    name: '柔蔓晴枝',   url: 'https://img-play.daidaiyuyin.com/img/3a356d38b5e5444d5019aa805a2f0f3c.webp/110x98' },
  { id: 'anhei',     name: '暗黑骑士',   url: 'https://img-play.daidaiyuyin.com/img/9839d2b3b5a7dcf2051c2eae8855263c.webp/110x98' },
  { id: 'qingleng',  name: '清冷女神',   url: 'https://img-play.daidaiyuyin.com/img/c6b9f171f24aa979022ca830e36512da.webp/110x98' },
  { id: 'huanmian',  name: '幻梦星冕',   url: 'https://img-play.daidaiyuyin.com/img/161de19cd01f4fe9529d25326a08aec9.webp/110x98' },
  { id: 'yinhe',     name: '银河华冕',   url: 'https://img-play.daidaiyuyin.com/img/b97a8117c02cd62022de089066d0449f.webp/110x98' },
  { id: 'qihuan',    name: '奇幻动物',   url: 'https://img-play.daidaiyuyin.com/img/607ab64f97ab8ecb93ca5d007189753c.webp/110x98' },
  { id: 'chaoliu',   name: '潮流先锋',   url: 'https://img-play.daidaiyuyin.com/img/f2ebf50aaca880b0a84897c844d93a7f.webp/110x98' },
  { id: 'wangbao',   name: '萌萌汪宝',   url: 'https://img-play.daidaiyuyin.com/img/80f2683fcbbdb65909aba6ee926473e0.webp/110x98' },
  { id: 'mengmao',   name: '绒绒萌猫',   url: 'https://img-play.daidaiyuyin.com/img/f7f75d2f37a77e2bbb0c1d97be8ecd06.webp/110x98' },
  { id: 'tianshi',   name: '天使守护',   url: 'https://img-play.daidaiyuyin.com/img/0ae847a79079593b03d0959a8ed77434.webp/110x98' },
  { id: 'xinghuan',  name: '星环守护',   url: 'https://img-play.daidaiyuyin.com/img/2c0e76c9a5b615290f90410e8c00557e.webp/110x98' },
  { id: 'muma',      name: '木马音乐盒', url: 'https://img-play.daidaiyuyin.com/img/49154c5df2934f0d5895849fb6508b86.webp/110x98' },
  { id: 'gangqin',   name: '奇妙钢琴',   url: 'https://img-play.daidaiyuyin.com/img/01610958142d108e7c480f9924b1d2a5.webp/110x98' },
  { id: 'shijian',   name: '时间信徒',   url: 'https://img-play.daidaiyuyin.com/img/f9e9f6c231e75ecd80d7951a9177ebbe.webp/110x98' },
  { id: 'landiao',   name: '蓝调谜情',   url: 'https://img-play.daidaiyuyin.com/img/133cad4e23b87de6a3e89bd8180cd903.webp/110x98' },
  { id: 'fenwu',     name: '粉雾情愫',   url: 'https://img-play.daidaiyuyin.com/img/6d281bdf84d4b02c296141ed10bdb2ce.webp/110x98' },
  { id: 'manyou',    name: '漫游仙境',   url: 'https://img-play.daidaiyuyin.com/img/daf81980c2797e53f9c123b434ba81d2.webp/110x98' },
  { id: 'qiyu',      name: '奇遇画廊',   url: 'https://img-play.daidaiyuyin.com/img/6f2f4bec10f14a666fe70821d6c5ab4f.webp/110x98' },
  { id: 'xingyue',   name: '星月童话',   url: 'https://img-play.daidaiyuyin.com/img/b8138d618b20cf4a0eb6965628ed919f.webp/110x98' },
  { id: 'xianhua',   name: '鲜花飞船',   url: 'https://img-play.daidaiyuyin.com/img/2fe49edeca330c4595c01bdef0799620.webp/110x98' },
  { id: 'fenmo',     name: '粉墨之恋',   url: 'https://img-play.daidaiyuyin.com/img/ce9266f729be3fd10315f663acda0825.webp/110x98' },
  { id: 'yese',      name: '夜色蔷薇',   url: 'https://img-play.daidaiyuyin.com/img/f06d21f035e6df0f0a58ae0b1b900f7f.webp/110x98' },
  { id: 'fuxing',    name: '浮星月坠',   url: 'https://img-play.daidaiyuyin.com/img/7288a7a6d7ddd67de1114cf0a3db60fd.webp/110x98' },
  { id: 'yinghuo',   name: '夜城萤火',   url: 'https://img-play.daidaiyuyin.com/img/3c36f2032123498517e0fdedc6539e8a.webp/110x98' },
  { id: 'yuehua',    name: '月华流照',   url: 'https://img-play.daidaiyuyin.com/img/2a7934ddd739aa905152eedd94ea8180.webp/110x98' },
  // DakeMusic: 新增声波（150x150 webp）
  { id: 'zx_maomao', name: '仲夏幻猫声波', url: 'https://img-play.daidaiyuyin.com/img/253b36def9982e5e69113cb370bbdbcc.webp/150x150' },
  { id: 'zx_yueyue', name: '仲夏之约声波', url: 'https://img-play.daidaiyuyin.com/img/a4aaea9a2eacf84b05764bb381524690.webp/150x150' },
  { id: 'js_jinlian', name: '静水金莲声波', url: 'https://img-play.daidaiyuyin.com/img/f7d2093372bf20286c8b52ab52a2b41a.webp/150x150' },
  { id: 'qm_qiyu',   name: '清梅栖羽声波', url: 'https://img-play.daidaiyuyin.com/img/46cdc2ad5c111228245d1217bc66adbf.webp/150x150' },
  { id: 'lainai',    name: '恋爱脑声波',   url: 'https://img-play.daidaiyuyin.com/img/07750de1e1c878275a65e9d2c19dde75.webp/150x150' },
  { id: 'ouxiang',   name: '偶像派声波',   url: 'https://img-play.daidaiyuyin.com/img/77a3e2f92f3e97d6bd27ae894c152037.webp/150x150' },
  { id: 'bx_qingyuan',name: '冰雪情缘声波', url: 'https://img-play.daidaiyuyin.com/img/5b37250e22e361f7e61e826852e7a830.webp/150x150' },
  { id: 'hy_jinli',  name: '好运锦鲤声波', url: 'https://img-play.daidaiyuyin.com/img/0abda081457edfefd0330ca5640f54c2.webp/150x150' },
  { id: 'xj_hualing',name: '绚金华翎声波', url: 'https://img-play.daidaiyuyin.com/img/65c2748da58405dd51d1957273f50d7a.webp/150x150' },
  { id: 'hy_dangkong',name: '皓月当空声波', url: 'https://img-play.daidaiyuyin.com/img/06facc14e41ce55d2b95661083038a83.webp/150x150' },
  { id: 'cr_fanxing',name: '灿若繁星声波', url: 'https://img-play.daidaiyuyin.com/img/5a871e0a5202559d7474222a947a395f.webp/150x150' },
  { id: 'xiannv',    name: '仙女声波',     url: 'https://img-play.daidaiyuyin.com/img/801a2ad9b0932869762a9193dc0e6bdd.webp/150x150' },
  { id: 'tiancheng', name: '天秤声波',     url: 'https://img-play.daidaiyuyin.com/img/c9723653831cf0be90439c1a304061bd.webp/150x150' },
  { id: 'tianxie',   name: '天蝎座声波',   url: 'https://img-play.daidaiyuyin.com/img/b89af3048314b08948f77a99dcb2b3a9.webp/150x150' },
  { id: 'sheshou',   name: '射手座声波',   url: 'https://img-play.daidaiyuyin.com/img/6c6e84082f576c1c8b8d6797f3f62fc4.webp/150x150' },
  { id: 'mojie',     name: '摩羯座声波',   url: 'https://img-play.daidaiyuyin.com/img/c71f844ca9ec5bc4f9e1e8ca73b67e32.webp/150x150' },
  { id: 'jy_mantang',name: '金玉满堂声波', url: 'https://img-play.daidaiyuyin.com/img/8614e26a45e4b0216c03d9d5ed630000.webp/150x150' },
  { id: 'js_xianfu', name: '金蛇献福声波', url: 'https://img-play.daidaiyuyin.com/img/14489c1dc75f655fbd2dbf86cd3dd3b9.webp/150x150' },
  { id: 'shuiping',  name: '水瓶座声波',   url: 'https://img-play.daidaiyuyin.com/img/478915badfe3c5841fb9381c2d0060c5.webp/150x150' },
  { id: 'shuangyu',  name: '双鱼座声波',   url: 'https://img-play.daidaiyuyin.com/img/33816e9554ffcbf90a40c77f9af2a29f.webp/150x150' },
  { id: 'baiyang',   name: '白羊声波',     url: 'https://img-play.daidaiyuyin.com/img/24bf14260302f6f0817193cc2838bb45.webp/150x150' },
  { id: 'jinniu',    name: '金牛声波',     url: 'https://img-play.daidaiyuyin.com/img/4016716b9854502b09774c1fd52c0779.webp/150x150' },
  { id: 'll_tonghua',name: '恋恋童话声波', url: 'https://img-play.daidaiyuyin.com/img/066173f9f649e982feffd5de42499829.webp/150x150' },
  { id: 'mt_zhiwu',  name: '萌兔之舞声波', url: 'https://img-play.daidaiyuyin.com/img/ac0fbe894b3395d232e4d384f9bed3b0.webp/150x150' },
  { id: 'tc_xiaohuli',name: '贪吃小狐狸声波', url: 'https://img-play.daidaiyuyin.com/img/24e137a4a389554538a0655700b56f0d.webp/150x150' },
  { id: 'hl_xiaoyang',name: '欢乐小羊声波', url: 'https://img-play.daidaiyuyin.com/img/92d6f11974e45accb508be70947fce58.webp/150x150' },
  { id: 'my_qiufeng',name: '明月秋枫声波', url: 'https://img-play.daidaiyuyin.com/img/302641b7c0623eafbe26fe78e89e78df.webp/150x150' },
  { id: 'xd_xiehou',  name: '星都邂逅声波', url: 'https://img-play.daidaiyuyin.com/img/ef9d9c67b8b844f7dff6332ddbf72efe.webp/150x150' },
  { id: 'yg_muxing',  name: '月光牧星星波', url: 'https://img-play.daidaiyuyin.com/img/a8c2df436e1d6e575c7215d37b2a1ebc.webp/150x150' },
  { id: 'xs_boy',    name: '像素boy声波',  url: 'https://img-play.daidaiyuyin.com/img/5b1b796438306edf0d1c0977ae8b55c0.webp/150x150' },
  { id: 'xs_girl',   name: '像素girl声波', url: 'https://img-play.daidaiyuyin.com/img/540af8ece4371d64f00a9762e04506a1.webp/150x150' },
  { id: 'hl_xingchen',name: '皇蓝星宸声波', url: 'https://img-play.daidaiyuyin.com/img/a3a0413190115b74eab93d644e6ddd91.webp/150x150' },
  { id: 'xy_hongmian',name: '星耀红冕声波', url: 'https://img-play.daidaiyuyin.com/img/f3a6605d8f3f529631a9ee4a5579bd64.webp/150x150' },
  { id: 'lb_jinghong',name: '落笔惊鸿声波', url: 'https://img-play.daidaiyuyin.com/img/e10c43849f5c3fe12012c9302d84f1b0.webp/150x150' },
  { id: 'sy_heming', name: '水韵合鸣声波', url: 'https://img-play.daidaiyuyin.com/img/5ca605c6dc29d2de74e0bb2d90c442e8.webp/150x150' },
  { id: 'dj_changjian',name: '对决长剑声波', url: 'https://img-play.daidaiyuyin.com/img/e51375678e4cdf47458fc962f9161043.webp/150x150' },
  { id: 'dj_shendun',name: '对决神盾声波', url: 'https://img-play.daidaiyuyin.com/img/64a4562992eeb0514c860321a658a9d6.webp/150x150' },
  { id: 'tm_meimei', name: '甜蜜莓莓声波', url: 'https://img-play.daidaiyuyin.com/img/40c8762e249023283e360e755a54f421.webp/150x150' },
  { id: 'cz_jingling',name: '春之精灵声波', url: 'https://img-play.daidaiyuyin.com/img/26e35827d1a3c533b81413c15084df9a.webp/150x150' },
  { id: 'xx_xiangyin',name: '心心相印声波', url: 'https://img-play.daidaiyuyin.com/img/ae1785d128aa7d10dc30febc0a7980fa.webp/150x150' },
  { id: 'xiaoemo_y', name: '小恶魔声波',   url: 'https://img-play.daidaiyuyin.com/img/9def2e91fd30bdcc1d0425f18898ea3b.webp/150x150' },
  { id: 'fs_maozhua',name: '粉色猫爪声波', url: 'https://img-play.daidaiyuyin.com/img/e4e7b34c255791cfc663c3302599ee5a.webp/150x150' },
  { id: 'xg_caihong',name: '星光彩虹声波', url: 'https://img-play.daidaiyuyin.com/img/dd13e9d2953e1eab0dd044c0c792f6e5.webp/150x150' },
  { id: 'qk_mofa',   name: '晴空魔法声波', url: 'https://img-play.daidaiyuyin.com/img/fa9c1932116853f3ce3b1f8cacef9e4b.webp/150x150' },
  { id: 'cn_huakai', name: '春暖花开声波', url: 'https://img-play.daidaiyuyin.com/img/33c15994ae8297ce03504c26d2f80411.webp/150x150' },
  { id: 'mm_momo',   name: '喵喵墨墨声波', url: 'https://img-play.daidaiyuyin.com/img/265413d2dac7736404c92852d0aa93b5.webp/150x150' },
  { id: 'mm_tianbai',name: '喵喵甜白声波', url: 'https://img-play.daidaiyuyin.com/img/15e832226d33b2dd4e3c00cde3f18d8b.webp/150x150' },
  { id: 'shuangzi',  name: '双子声波',     url: 'https://img-play.daidaiyuyin.com/img/e44440aeac1bb455d59e943c299d3092.webp/150x150' },
  { id: 'jiexz',     name: '巨蟹声波',     url: 'https://img-play.daidaiyuyin.com/img/bfe4a7d1079d999ae1d918eb2dacce46.webp/150x150' },
  { id: 'zz_liuying',name: '珍珠流萤声波', url: 'https://img-play.daidaiyuyin.com/img/2277592ec8842fdaeb009d6acf66bd66.webp/150x150' },
  { id: 'xl_huifu',  name: '血量恢复声波', url: 'https://img-play.daidaiyuyin.com/img/42168a737e3dfeb9dfc6b146bc9f33c1.webp/150x150' },
  { id: 'shizi',     name: '狮子声波',     url: 'https://img-play.daidaiyuyin.com/img/a2ebb4f24074116a3fc8e14a3422d6cd.webp/150x150' },
];

export function getMyAuralId(): string {
  try { return localStorage.getItem('dakemusic_aural_id') || 'default'; } catch { return 'default'; }
}

export function setMyAuralId(id: string) {
  try { localStorage.setItem('dakemusic_aural_id', id); } catch {}
}

export function getAuralUrl(id: string): string {
  const a = AURAL_SKINS.find(x => x.id === id);
  return a ? a.url : AURAL_SKINS[0].url;
}
