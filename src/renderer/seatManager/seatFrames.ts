/*!
 * DakeMusic 语聊房模块
 * 作者：知之Dake
 * 文件：seatFrames.ts
 * 描述：麦位框皮肤配置 - 挂在麦位头像周围的静态/动态边框装饰（非说话声波）
 */

export interface SeatFrame {
  id: string;
  name: string;
  url: string;
}

// 麦位框皮肤库（图床：daidaiyuyin.com，GIF/WebP 动图）
export const SEAT_FRAMES: SeatFrame[] = [
  { id: 'none',           name: '无框',         url: '' },
  { id: 'haizun',         name: '海尊麦位框',   url: 'https://img-play.daidaiyuyin.com/img/d9c64dd9c33d8692e16f8a3f8d131a89.gif' },
  { id: 'haiwang',        name: '海王麦位框',   url: 'https://img-play.daidaiyuyin.com/img/2da4cec1aab998e8f8da0d9530a80faf.gif' },
  { id: 'haihuang',       name: '海皇麦位框',   url: 'https://img-play.daidaiyuyin.com/img/b5487b7bda900d81bf068701895c81f3.gif' },
  { id: 'haidi',          name: '海帝麦位框',   url: 'https://img-play.daidaiyuyin.com/img/be99bd7ef6c0d97f9589121cea57ed9f.gif' },
  { id: 'zhongxia_maomao',name: '仲夏幻猫麦位框', url: 'https://img-play.daidaiyuyin.com/img/591ccc7896af6c4cd9d216a067c2f4ea.webp/150x150' },
  { id: 'zhongxia_yueyue',name: '仲夏之约麦位框', url: 'https://img-play.daidaiyuyin.com/img/f052dbdce4f250306d523cfe0e110e06.webp/150x150' },
  { id: 'jingshui_jinlian',name: '静水金莲麦位框', url: 'https://img-play.daidaiyuyin.com/img/f1de0dc1f400ab77e583b30d01a807ac.webp/150x150' },
  { id: 'qingmei_qiyu',   name: '清梅栖羽麦位框', url: 'https://img-play.daidaiyuyin.com/img/3d92a952538470acc83201ff34522f76.webp/150x150' },
  { id: 'lianaino',       name: '恋爱脑麦位框',   url: 'https://img-play.daidaiyuyin.com/img/59824c45ab3b407153700bbbfaa9dbda.webp/150x150' },
  { id: 'ouxiangpai',     name: '偶像派麦位框',   url: 'https://img-play.daidaiyuyin.com/img/2eb53d7a0b247536a3514a367c5ad104.webp/150x150' },
  { id: 'mengxiang_hangkong',name: '梦想宇航麦位框', url: 'https://img-play.daidaiyuyin.com/img/8500d75503c21c2fc005634847d67f60.gif' },
  { id: 'haoyue_dangkong',name: '皓月当空麦位框', url: 'https://img-play.daidaiyuyin.com/img/3a2a57756260fb66e01ca2a2f7e4b49a.gif' },
  { id: 'mengjing_tonghua',name: '梦境童话麦位框', url: 'https://img-play.daidaiyuyin.com/img/f7795cd0f8edb60782790b1f48cfda1d.gif' },
  { id: 'caizi',          name: '才子麦位框',     url: 'https://img-play.daidaiyuyin.com/img/fa16dfc900bcf6a668f9c404d7917416.gif' },
  { id: 'jiaren',         name: '佳人麦位框',     url: 'https://img-play.daidaiyuyin.com/img/d56055187f5d3f42e1fd94a989a4ca59.gif' },
  { id: 'jinyu_mantang',  name: '金玉满堂麦位框', url: 'https://img-play.daidaiyuyin.com/img/1c69c1c038e16c4e45a88686e1d2044f.gif' },
  { id: 'jinshe_xianfu',  name: '金蛇献福麦位框', url: 'https://img-play.daidaiyuyin.com/img/19398d1baf0d11ed6738fd27d4b9405a.gif' },
  { id: 'bingxue_zhilv',  name: '冰靴之旅麦位框', url: 'https://img-play.daidaiyuyin.com/img/d9218562a7ece335d7ef18245729b6c4.gif' },
  { id: 'liuxing_ailian', name: '流星爱恋麦位框', url: 'https://img-play.daidaiyuyin.com/img/3e84c48163a38769e725011b2ea28d14.gif' },
  { id: 'bingjiling_zhixia',name: '冰激凌之夏麦位框', url: 'https://img-play.daidaiyuyin.com/img/8f3ec4871b029e01fc06cc689819d24f.gif' },
  { id: 'yinlang_shanyao',name: '音浪闪耀麦位框', url: 'https://img-play.daidaiyuyin.com/img/f69fec01258823431e9612cf7153b17a.gif' },
  { id: 'shunu_tousha',   name: '淑女头纱',       url: 'https://img-play.daidaiyuyin.com/img/5cc09366afc6a1a415cb8c9d1dc36da0.gif' },
  { id: 'caihong_yunduo', name: '彩虹云朵',       url: 'https://img-play.daidaiyuyin.com/img/494b6a962e179575ed7881b9a91b8c78.gif' },
  { id: 'hailang',        name: '海浪',           url: 'https://img-play.daidaiyuyin.com/img/0e8b38c2a69fd9cee5e044f9fa62d8ae.gif' },
  { id: 'nihong_tianxin', name: '霓虹甜心麦位框', url: 'https://img-play.daidaiyuyin.com/img/c70704587820ce1816ec6d315e3595d8.gif' },
  { id: 'lianlian_tonghua',name: '恋恋童话麦位框', url: 'https://img-play.daidaiyuyin.com/img/ac52844273b252d1c060168310ea30b4.gif' },
  { id: 'mengtu_zhiwu',   name: '萌兔之舞麦位框', url: 'https://img-play.daidaiyuyin.com/img/2db96ceeb076db9b010e032c14f6ec2b.gif' },
  { id: 'menghuan_xingyi',name: '梦幻星仪麦位框', url: 'https://img-play.daidaiyuyin.com/img/8ee533f31535942af5f1e70b5d2e0fef.gif' },
  { id: 'tanchi_xiaohuli',name: '贪吃小狐狸麦位框', url: 'https://img-play.daidaiyuyin.com/img/22edaef5df097e076898592b7b402c69.webp/150x150' },
  { id: 'huanle_xiaoyang',name: '欢乐小羊麦位框', url: 'https://img-play.daidaiyuyin.com/img/c3d68e1af8fbc0389fd597089701c78c.webp/150x150' },
  { id: 'jinbi_yu',       name: '金币雨麦位框',   url: 'https://img-play.daidaiyuyin.com/img/a0b98e19ddc37a95c19d7ae81edd4b74.gif' },
  { id: 'zhangu_xiaoxiong',name: '榛果小熊麦位框', url: 'https://img-play.daidaiyuyin.com/img/56176beb482d5d01427f38d4947c6c19.gif' },
  { id: 'yunduo_xiaoxiong',name: '云朵小熊麦位框', url: 'https://img-play.daidaiyuyin.com/img/3195951e280a1573ad57271dc552511d.gif' },
  { id: 'xingdu_xiehou',  name: '星都邂逅麦位框', url: 'https://img-play.daidaiyuyin.com/img/fcd2b577c6fa48e595960755561a03b5.webp/150x150' },
  { id: 'yueguang_muxing',name: '月光牧星麦位框', url: 'https://img-play.daidaiyuyin.com/img/b9b461054afdb164750c2bf049b0ee7e.webp/150x150' },
  { id: 'naiyou_xigua',   name: '奶油西瓜',       url: 'https://img-play.daidaiyuyin.com/img/0573d097fe6a25a81456a57b736a43a2.gif' },
  { id: 'xiari_bingye',   name: '夏日冰椰',       url: 'https://img-play.daidaiyuyin.com/img/fdce2b89fa376fdd645af4d953a72de5.gif' },
  { id: 'bozaixiong',     name: '啵仔熊麦位框',   url: 'https://img-play.daidaiyuyin.com/img/b466ecb97c5c058af443025d6bcfdbfa.gif' },
  { id: 'xiari_haitan',   name: '夏日海滩',       url: 'https://img-play.daidaiyuyin.com/img/01853ada677c827b7e57345a9f0237a9.gif' },
  { id: 'bozaitu',        name: '啵仔兔麦位框',   url: 'https://img-play.daidaiyuyin.com/img/bb69ba6e144efad0882b574a55cefa2a.gif' },
  { id: 'xiangsu_boy',    name: '像素boy麦位框',  url: 'https://img-play.daidaiyuyin.com/img/50d2bf602eb3930fa00a3a264d50007f.webp/150x150' },
  { id: 'xiangsu_girl',   name: '像素girl麦位框', url: 'https://img-play.daidaiyuyin.com/img/0f981783e952effff642c4d9b8c3ba72.webp/150x150' },
  { id: 'huanglan_xingchen',name: '皇蓝星宸麦位框', url: 'https://img-play.daidaiyuyin.com/img/7742fa4791f42b82b902372628b28fa4.webp/150x150' },
  { id: 'xingyao_hongmian',name: '星耀红冕麦位框', url: 'https://img-play.daidaiyuyin.com/img/b1993e3954e03c801eb0903722ee3360.webp/150x150' },
  { id: 'luobi_jinghong', name: '落笔惊鸿麦位框', url: 'https://img-play.daidaiyuyin.com/img/181b2091cee24daa9fefc85fab189cba.webp/150x150' },
  { id: 'shuiyun_heming', name: '水韵合鸣麦位框', url: 'https://img-play.daidaiyuyin.com/img/1d9ca9a38ce3fc40c7029c29154960e4.webp/150x150' },
  { id: 'duijie_changjian',name: '对决长剑麦位框', url: 'https://img-play.daidaiyuyin.com/img/0958f2f0fc465b6c166d31b19c906050.webp/150x150' },
  { id: 'duijie_shendun', name: '对决神盾麦位框', url: 'https://img-play.daidaiyuyin.com/img/d844b4c16a3510a330bf804a76afe023.webp/150x150' },
  { id: 'baofu_ya',       name: '暴富鸭麦位框',   url: 'https://img-play.daidaiyuyin.com/img/0dc3266d4cd617a29e32e95f44eb3be7.gif' },
  { id: 'xingguang_caihong',name: '星光彩虹麦位框', url: 'https://img-play.daidaiyuyin.com/img/453ca30b3f837c37f4e5ff40920b5532.gif' },
  { id: 'tianmi_meimei',  name: '甜蜜莓莓麦位框', url: 'https://img-play.daidaiyuyin.com/img/291c5c7264267770a39f270b86b58ee0.gif' },
  { id: 'chunzhijingling',name: '春之精灵麦位框', url: 'https://img-play.daidaiyuyin.com/img/66678179515cd882a750e15eae879465.gif' },
  { id: 'paopaoji',       name: '泡泡机',         url: 'https://img-play.daidaiyuyin.com/img/3e0d4c24622c7af15ae547573e7009fd.gif' },
  { id: 'ganbeiba',       name: '干杯吧',         url: 'https://img-play.daidaiyuyin.com/img/4d99337ab1e31b73910314f98ab7f12f.gif' },
  { id: 'wanshi_xinglong',name: '万事兴龙麦位框', url: 'https://img-play.daidaiyuyin.com/img/30c570b916c830cad3c617405d231bc0.gif' },
  { id: 'chunbai_huajia', name: '纯白花嫁麦位框', url: 'https://img-play.daidaiyuyin.com/img/43e24bdac78f1aa2b6330c75e4bbb546.gif' },
  { id: 'chunbai_huaxu',  name: '纯白花婿麦位框', url: 'https://img-play.daidaiyuyin.com/img/51583f6e63a1a664289d0ccf443697b6.gif' },
  { id: 'zhenyouqian',    name: '真有钱麦位框',   url: 'https://img-play.daidaiyuyin.com/img/a7da84049194f204c976e95c0dd26408.gif' },
  { id: 'wanan_yueliang', name: '晚安月亮麦位框', url: 'https://img-play.daidaiyuyin.com/img/a9e9768239836f673516605118c26fdc.gif' },
  { id: 'liu6',           name: '6麦位框',        url: 'https://img-play.daidaiyuyin.com/img/e289c0bee8f244af5318ac95672803a2.gif' },
  { id: 'qingkong_mofa',  name: '晴空魔法',       url: 'https://img-play.daidaiyuyin.com/img/99d83cb58b2fd78a23faa82ea92b5ee7.gif' },
  { id: 'xingyun_buff',   name: '幸运buff麦位框', url: 'https://img-play.daidaiyuyin.com/img/93f57c1796a28cba3cec65d3e021708f.gif' },
  { id: 'zhenzhu_liuying',name: '珍珠流萤',       url: 'https://img-play.daidaiyuyin.com/img/a80611a97b856cf57e203d1c52f6e9a5.gif' },
  { id: 'tingjun_yihu',   name: '听君一席话麦位框', url: 'https://img-play.daidaiyuyin.com/img/9d9377bf74352190c52e1dde883b5643.gif' },
  { id: 'yunhai_jingluo', name: '云海鲸落麦位框', url: 'https://img-play.daidaiyuyin.com/img/cef9477e9cf71c432bea6ad50d349a3f.gif' },
  { id: 'maomao_pa',      name: '猫猫趴麦位框',   url: 'https://img-play.daidaiyuyin.com/img/c61bcc7d2e7de57ce5e969b2c7d92777.gif' },
  { id: 'chunuan_huakai', name: '春暖花开麦位框', url: 'https://img-play.daidaiyuyin.com/img/43e99dd873c0f53a0d3e2930172025e4.gif' },
  { id: 'miaomiao_tianbai',name: '喵喵甜白',       url: 'https://img-play.daidaiyuyin.com/img/0e1c23b801ecf5fd36617915445453f1.gif' },
  { id: 'miaomiao_momo',  name: '喵喵墨墨',       url: 'https://img-play.daidaiyuyin.com/img/f7c0166eabe38b86b62873152e638cc3.gif' },
  { id: 'bingxue_qingyuan',name: '冰雪情缘麦位框', url: 'https://img-play.daidaiyuyin.com/img/d09d07a48695b97071561850290e5567.gif' },
  { id: 'haoyun_jinli',   name: '好运锦鲤麦位框', url: 'https://img-play.daidaiyuyin.com/img/072cfb6cd87776026f9908537426c2b2.gif' },
  { id: 'canruo_fanxing', name: '灿若繁星麦位框', url: 'https://img-play.daidaiyuyin.com/img/2c39a33c187f6aeb3a93e62f8aa59e89.gif' },
  { id: 'xinxin_xiangyin',name: '心心相印',       url: 'https://img-play.daidaiyuyin.com/img/9e3bcbca751bdd8837ef5a080b6b334b.gif' },
  { id: 'mingyue_qiufeng',name: '明月秋枫麦位框', url: 'https://img-play.daidaiyuyin.com/img/7f5baf596771e8ff7b35bb43bcb1e1eb.gif' },
  { id: 'fense_maozhua',  name: '粉色猫爪',       url: 'https://img-play.daidaiyuyin.com/img/09dd78d9af2c67ca171b21dfed91b0a6.gif' },
  { id: 'xueliang_huifu',name: '血量恢复麦位框', url: 'https://img-play.daidaiyuyin.com/img/255077cbe4617181d2f75c1069711c4e.gif' },
  { id: 'qiangwei',       name: '蔷薇',           url: 'https://img-play.daidaiyuyin.com/img/0f4c421c5544a201476ee185a7821f52.gif' },
  { id: 'huajian_lu',     name: '花间鹿',         url: 'https://img-play.daidaiyuyin.com/img/f1db6c99d0ea15f7f38d2b3e5c1bb81d.gif' },
  { id: 'bingjiling_xiatian',name: '冰激凌的夏天', url: 'https://img-play.daidaiyuyin.com/img/4a2c8e0b8f98f288dd1bb2ce71df6522.png/150x150' },
  { id: 'xiaoemo',        name: '小恶魔',         url: 'https://img-play.daidaiyuyin.com/img/bf9f268f0dd4fbc93a412e83a07b6ffa.gif' },
  { id: 'haiichuan',      name: '海盗船',         url: 'https://img-play.daidaiyuyin.com/img/e7490d34d92db6ed8baac7c579545e7b.gif' },
  { id: 'zhuyue',         name: '逐月',           url: 'https://img-play.daidaiyuyin.com/img/4d35054b61671d94930e90d5d7047d30.gif' },
  { id: 'xuanjin_hualing',name: '绚金华翎麦位框', url: 'https://img-play.daidaiyuyin.com/img/2322cd198f5b0910aaf7e4d1f0b2af0c.gif' },
  { id: 'shenshi_lifu',   name: '绅士礼服',       url: 'https://img-play.daidaiyuyin.com/img/b32bdf960d5274e440cdfa0baa68bc3f.gif' },
  { id: 'miaomiao_naicha',name: '喵喵奶茶',       url: 'https://img-play.daidaiyuyin.com/img/cf6f9762e44b5c93c7993dae620c2370.gif' },
  { id: 'dujiao_shou',    name: '独角兽',         url: 'https://img-play.daidaiyuyin.com/img/83a8d956b8930b0fb0919f3037d28b9d.gif' },
  { id: 'tutu_qianqiu',   name: '兔兔秋千',       url: 'https://img-play.daidaiyuyin.com/img/e0a17e8174d96e88a6c18ac5351fc065.gif' },
  { id: 'leidian',        name: '雷电',           url: 'https://img-play.daidaiyuyin.com/img/3b21e96067ea2a900dd3afe6c2a2c437.gif' },
  { id: 'xiaohuihui',     name: '小灰灰麦位框',   url: 'https://img-play.daidaiyuyin.com/img/bd679c57507c2b8b6de799e7c5396083.gif' },
  { id: 'xiaohonghong',   name: '小红红麦位框',   url: 'https://img-play.daidaiyuyin.com/img/fc65ccf26307648172681b61cb39daba.gif' },
  { id: 'xiaobeizhi',     name: '小被纸麦位框',   url: 'https://img-play.daidaiyuyin.com/img/d1578a69bf568c39edfc8059fa2573eb.gif' },
  { id: 'xiaobeiji',       name: '小被叽麦位框',   url: 'https://img-play.daidaiyuyin.com/img/4443795d85a48fb589ecb0db5d3e306d.gif' },
  { id: 'maorongrong',    name: '毛茸茸麦位框',   url: 'https://img-play.daidaiyuyin.com/img/7407a33e412529f5429a331706f61966.gif' },
  { id: 'maorongrong2',   name: '毛绒绒麦位框',   url: 'https://img-play.daidaiyuyin.com/img/6e2620f135ba85a1da8c7951cf76ac16.gif' },
];

export function getMySeatFrameId(): string {
  try { return localStorage.getItem('dakemusic_seatframe_id') || 'none'; } catch { return 'none'; }
}

export function setMySeatFrameId(id: string) {
  try { localStorage.setItem('dakemusic_seatframe_id', id); } catch {}
}

export function getSeatFrameUrl(id: string): string {
  const f = SEAT_FRAMES.find(x => x.id === id);
  return f ? f.url : '';
}
