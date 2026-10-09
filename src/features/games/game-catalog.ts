import type { CloudGame } from '../../services/api'

export type GameId = string
export type GameRuntime = 'local-gba' | 'remote-web'

export type GameDefinition = {
  id: GameId
  title: string
  description: string
  tag: string
  runtime: GameRuntime
  launchUrl?: string
  sourceName: string
  sourceUrl: string
  license: string
  requiresOwnedRom: boolean
  mark: 'controller' | 'grid'
  romFilename?: string
  romBytes?: number
  romSha256?: string
}

const CLOUD_GAME_CACHE_KEY = 'together-notes.cloud-games.v1'

/**
 * Open-source runtimes stay behind catalog metadata so they remain replaceable.
 * The GBA runtime is packaged locally. Server-published game files are kept
 * outside the install bundle and cached on the device after the first download.
 */
export const GAME_CATALOG: readonly GameDefinition[] = Object.freeze([
  {
    id: 'sudoku',
    title: '数独',
    description: '现成的开源移动端数独，支持难度选择、计时和触控填写。',
    tag: '益智 · 9 × 9',
    runtime: 'remote-web',
    launchUrl: 'https://puzzles.twistymaze.com/solo',
    sourceName: 'Puzzles Web · Solo',
    sourceUrl: 'https://github.com/medmunds/puzzles-web',
    license: 'MIT',
    requiresOwnedRom: false,
    mark: 'grid',
  },
])

export function mapCloudGames(items: CloudGame[]): GameDefinition[] {
  return items.map(game => ({
    id: game.id,
    title: game.title,
    description: game.description || '下载一次后可离线运行',
    tag: 'GBA · 下载后离线',
    runtime: 'local-gba',
    sourceName: 'Together 游戏库 · EmulatorJS / mGBA',
    sourceUrl: 'https://github.com/EmulatorJS/EmulatorJS',
    license: '运营上传内容',
    requiresOwnedRom: false,
    mark: 'controller',
    romFilename: game.filename,
    romBytes: game.bytes,
    romSha256: game.sha256,
  }))
}

export function cacheCloudGames(games: GameDefinition[]) {
  try { uni.setStorageSync(CLOUD_GAME_CACHE_KEY, games) } catch {}
}

export function getCachedCloudGames(): GameDefinition[] {
  try {
    const value = uni.getStorageSync(CLOUD_GAME_CACHE_KEY)
    return Array.isArray(value) ? value.filter(game => game?.id && game?.runtime === 'local-gba') : []
  } catch { return [] }
}

export function findGame(id: string): GameDefinition | undefined {
  return GAME_CATALOG.find(game => game.id === id) || getCachedCloudGames().find(game => game.id === id)
}
