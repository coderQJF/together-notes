export type GameId = 'pokemon-dark-phantom-45' | 'sudoku'
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
}

/**
 * Open-source runtimes stay behind catalog metadata so they remain replaceable.
 * The GBA runtime is packaged locally, while copyrighted ROM data is never
 * bundled or downloaded by Together Notes.
 */
export const GAME_CATALOG: readonly GameDefinition[] = Object.freeze([
  {
    id: 'pokemon-dark-phantom-45',
    title: '口袋妖怪漆黑的魅影 4.5',
    description: '模拟器和操作界面已内置；首次选择一次合法持有的 .gba，之后可离线直开。',
    tag: 'GBA · 本地运行',
    runtime: 'local-gba',
    sourceName: 'EmulatorJS 4.2.3 · mGBA',
    sourceUrl: 'https://github.com/EmulatorJS/EmulatorJS/tree/v4.2.3',
    license: 'GPL-3.0 / MPL-2.0',
    requiresOwnedRom: true,
    mark: 'controller',
  },
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

export function findGame(id: string): GameDefinition | undefined {
  return GAME_CATALOG.find(game => game.id === id)
}
