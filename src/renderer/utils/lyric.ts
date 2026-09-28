/**
 * 歌词工具函数
 * 包含：歌词搜索（网易云音乐）、LRC解析、歌曲名清洗
 */

/**
 * 清洗歌曲名称，移除伴奏/变调/人声等关键词，用于歌词搜索
 */
function cleanSongNameForSearch(rawName: string): string {
  return rawName
    // 去掉括号及括号内的伴奏/变调等关键词
    .replace(/[（(]\s*(伴奏|纯伴奏|变调[AB]m|升调|降调|纯音乐|伴奏版|人声版|和声)\s*[）)]/gi, '')
    // 去掉独立的伴奏/变调等关键词
    .replace(/[\s_-]*(伴奏|纯伴奏|变调[AB]m|升调|降调|纯音乐|伴奏版|人声版|和声)[\s_-]*/gi, '')
    // 去掉开头的数字+下划线
    .replace(/^\d+[\s_-]+/, '')
    // 去掉多余的下划线、空格、括号
    .replace(/[_\s]+/g, ' ')
    .replace(/[（()）]/g, '')
    .trim()
}

/**
 * 从网易云音乐获取歌词
 * 两步：1.搜索歌曲  2.用歌曲ID拿歌词
 * @param songName 歌曲原名
 * @param artist 歌手名（可选）
 * @returns 标准LRC字符串，失败返回null
 */
export async function getKugouLyric(songName: string, artist = ''): Promise<string | null> {
  try {
    const keyword = cleanSongNameForSearch(`${songName} ${artist}`)
    if (!keyword) return null

    // 第1步：搜索歌曲
    const searchUrl = `https://music.163.com/api/search/get?s=${encodeURIComponent(keyword)}&type=1&limit=3`
    const searchRes = await fetch(searchUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        Referer: 'https://music.163.com/',
      },
      signal: AbortSignal.timeout(8000),
    })

    if (!searchRes.ok) {
      console.warn('网易云搜索接口响应异常', searchRes.status)
      return null
    }

    const searchData = await searchRes.json()
    const songs = searchData?.result?.songs
    if (!Array.isArray(songs) || songs.length === 0) {
      console.warn('网易云搜索无结果', keyword)
      return null
    }

    // 优先匹配歌手名
    let targetSong = songs[0]
    if (artist) {
      const matched = songs.find((s: any) =>
        s.artists?.some((a: any) => a.name?.includes(artist) || artist.includes(a.name)),
      )
      if (matched) targetSong = matched
    }

    const songId = targetSong.id
    if (!songId) return null

    // 第2步：获取歌词
    const lyricUrl = `https://music.163.com/api/song/lyric?id=${songId}&lv=1&kv=1&tv=-1`
    const lyricRes = await fetch(lyricUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        Referer: 'https://music.163.com/',
      },
      signal: AbortSignal.timeout(8000),
    })

    if (!lyricRes.ok) {
      console.warn('网易云歌词接口响应异常', lyricRes.status)
      return null
    }

    const lyricData = await lyricRes.json()
    const lrc = lyricData?.lrc?.lyric
    if (!lrc || typeof lrc !== 'string') {
      console.warn('网易云歌词为空', songId)
      return null
    }

    console.log('✅ 网易云歌词获取成功', targetSong.name, '-', targetSong.artists?.[0]?.name)
    return lrc
  } catch (err) {
    console.error('获取歌词失败：', err)
    return null
  }
}

/**
 * LRC歌词行类型
 */
export interface LyricLine {
  time: number
  text: string
}

/**
 * 解析标准LRC字符串
 */
export function parseLRC(lrcText: string): LyricLine[] {
  if (!lrcText || typeof lrcText !== 'string') return []

  const lines: LyricLine[] = []
  let globalOffset = 0

  const offsetMatch = lrcText.match(/\[offset:([+-]?\d+)\]/i)
  if (offsetMatch) {
    globalOffset = parseInt(offsetMatch[1], 10) || 0
  }

  const rawLines = lrcText.split(/\r?\n/)

  for (const line of rawLines) {
    const timeMatches = line.match(/\[(\d{1,2}):(\d{1,2})(?:\.(\d{1,3}))?\]/g)
    if (!timeMatches) continue

    const text = line.replace(/\[[^\]]*\]/g, '').trim()
    if (!text) continue
    if (/^\[(ti|ar|al|by|offset|length|re|ve):/i.test(line)) continue

    for (const timeTag of timeMatches) {
      const match = timeTag.match(/\[(\d{1,2}):(\d{1,2})(?:\.(\d{1,3}))?\]/)
      if (!match) continue

      const minutes = parseInt(match[1], 10)
      const seconds = parseInt(match[2], 10)
      const milliseconds = match[3]
        ? parseInt(match[3].padEnd(3, '0'), 10)
        : 0

      const time = minutes * 60 + seconds + milliseconds / 1000 + globalOffset / 1000
      if (time >= 0) {
        lines.push({ time, text })
      }
    }
  }

  lines.sort((a, b) => a.time - b.time)
  return lines
}

/**
 * 根据当前播放时间获取当前歌词索引
 */
export function getCurrentLyricIndex(lyrics: LyricLine[], currentTime: number): number {
  if (!lyrics || lyrics.length === 0) return -1
  let left = 0
  let right = lyrics.length - 1
  let result = -1
  while (left <= right) {
    const mid = Math.floor((left + right) / 2)
    if (lyrics[mid].time <= currentTime) {
      result = mid
      left = mid + 1
    } else {
      right = mid - 1
    }
  }
  return result
}

/**
 * 给LRC添加全局偏移
 */
export function addLyricOffset(lrcText: string, offsetMs: number): string {
  if (!lrcText) return lrcText
  if (/\[offset:[+-]?\d+\]/i.test(lrcText)) {
    return lrcText.replace(/\[offset:([+-]?\d+)\]/i, (_, oldOffset) => {
      const newOffset = (parseInt(oldOffset, 10) || 0) + offsetMs
      return `[offset:${newOffset >= 0 ? '+' : ''}${newOffset}]`
    })
  }
  return `[offset:${offsetMs >= 0 ? '+' : ''}${offsetMs}]\n${lrcText}`
}
