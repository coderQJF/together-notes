export type GameId = 'pokemon-dark-phantom-45' | 'sudoku'

export type GameDefinition = {
  id: GameId
  title: string
  description: string
  tag: string
  launchUrl: string
  sourceName: string
  sourceUrl: string
  license: string
  requiresOwnedRom: boolean
  mark: 'controller' | 'grid'
}

/**
 * This catalog deliberately contains launch metadata only. Game code and UI are
 * provided by the linked upstream projects, keeping this feature replaceable.
 * Copyrighted ROM data is never bundled or downloaded by Together Notes.
 */
export const GAME_CATALOG: readonly GameDefinition[] = Object.freeze([
  {
    id: 'pokemon-dark-phantom-45',
    title: '口袋妖怪漆黑的魅影 4.5',
    description: '使用开源 GBA 模拟器运行。请从本机导入你合法持有的 .gba 文件。',
    tag: 'GBA · 本机 ROM',
    launchUrl: 'https://demo.emulatorjs.org/',
    sourceName: 'EmulatorJS 官方 Demo',
    sourceUrl: 'https://github.com/EmulatorJS/demo',
    license: 'Apache-2.0 / GPL-3.0',
    requiresOwnedRom: true,
    mark: 'controller',
  },
  {
    id: 'sudoku',
    title: '数独',
    description: '现成的开源移动端数独，支持难度选择、计时和触控填写。',
    tag: '益智 · 9 × 9',
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
