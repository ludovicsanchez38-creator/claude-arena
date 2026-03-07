import type { TileType, FurnitureInstance, Character, FloorColor, Seat } from '../../types.js'

/** State passed to theme renderFrame for scene rendering */
export interface SceneState {
  tileMap: TileType[][]
  furniture: FurnitureInstance[]
  characters: Character[]
  zoom: number
  panX: number
  panY: number
  tileColors?: Array<FloorColor | null>
  layoutCols?: number
  layoutRows?: number
  selectedAgentId: number | null
  hoveredAgentId: number | null
  hoveredTile: { col: number; row: number } | null
  seats: Map<string, Seat>
  characterMap: Map<number, Character>
}

/** A render theme controls the visual appearance of the office scene.
 *  The logical layout (tiles, pathfinding, seats) remains identical across themes.
 *  TILE_SIZE (16) is the logical tile size. Each theme scales for visual rendering. */
export interface RenderTheme {
  id: string
  name: string
  /** Called once when the theme is activated */
  init(canvas: HTMLCanvasElement): void
  /** Called when the theme is deactivated (cleanup resources) */
  cleanup(): void
  /** Render one frame of the scene (tiles, furniture, characters, bubbles).
   *  Returns the pixel offset used to position the map in the viewport.
   *  Editor overlays (grid, ghost, selection) are rendered separately after this. */
  renderFrame(
    ctx: CanvasRenderingContext2D,
    canvasWidth: number,
    canvasHeight: number,
    state: SceneState,
  ): { offsetX: number; offsetY: number }
}
