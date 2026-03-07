import type { RenderTheme, SceneState } from './types.js'
import { TILE_SIZE } from '../../types.js'
import { renderTileGrid, renderScene, renderBubbles, renderSeatIndicators } from '../renderer.js'
import { hasWallSprites, getWallInstances } from '../../wallTiles.js'

export const pixelClassicTheme: RenderTheme = {
  id: 'pixel-classic',
  name: 'Pixel Classic',

  init(_canvas: HTMLCanvasElement): void {
    // No special initialization needed for the classic theme
  },

  cleanup(): void {
    // No cleanup needed
  },

  renderFrame(
    ctx: CanvasRenderingContext2D,
    canvasWidth: number,
    canvasHeight: number,
    state: SceneState,
  ): { offsetX: number; offsetY: number } {
    // Clear
    ctx.clearRect(0, 0, canvasWidth, canvasHeight)

    const cols = state.layoutCols ?? (state.tileMap.length > 0 ? state.tileMap[0].length : 0)
    const rows = state.layoutRows ?? state.tileMap.length

    // Center map in viewport + pan offset (integer device pixels)
    const mapW = cols * TILE_SIZE * state.zoom
    const mapH = rows * TILE_SIZE * state.zoom
    const offsetX = Math.floor((canvasWidth - mapW) / 2) + Math.round(state.panX)
    const offsetY = Math.floor((canvasHeight - mapH) / 2) + Math.round(state.panY)

    // Draw tiles (floor + wall base color)
    renderTileGrid(ctx, state.tileMap, offsetX, offsetY, state.zoom, state.tileColors, state.layoutCols)

    // Seat indicators
    renderSeatIndicators(
      ctx,
      state.seats,
      state.characterMap,
      state.selectedAgentId,
      state.hoveredTile,
      offsetX,
      offsetY,
      state.zoom,
    )

    // Build wall instances for z-sorting with furniture and characters
    const wallInstances = hasWallSprites()
      ? getWallInstances(state.tileMap, state.tileColors, state.layoutCols)
      : []
    const allFurniture = wallInstances.length > 0
      ? [...wallInstances, ...state.furniture]
      : state.furniture

    // Draw walls + furniture + characters (z-sorted)
    renderScene(
      ctx,
      allFurniture,
      state.characters,
      offsetX,
      offsetY,
      state.zoom,
      state.selectedAgentId,
      state.hoveredAgentId,
    )

    // Speech bubbles
    renderBubbles(ctx, state.characters, offsetX, offsetY, state.zoom)

    return { offsetX, offsetY }
  },
}
