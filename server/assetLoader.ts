import * as fs from 'fs'
import * as path from 'path'
import { PNG } from 'pngjs'
import type { CharacterDirectionSprites, FurnitureAssetMeta } from './types.js'
import {
  PNG_ALPHA_THRESHOLD,
  WALL_PIECE_WIDTH, WALL_PIECE_HEIGHT, WALL_GRID_COLS, WALL_BITMASK_COUNT,
  FLOOR_PATTERN_COUNT, FLOOR_TILE_SIZE,
  CHARACTER_DIRECTIONS, CHAR_FRAME_W, CHAR_FRAME_H, CHAR_FRAMES_PER_ROW, CHAR_COUNT,
} from './constants.js'

function pngToSpriteData(pngBuffer: Buffer, width: number, height: number): string[][] {
  try {
    const png = PNG.sync.read(pngBuffer)
    const sprite: string[][] = []
    for (let y = 0; y < height; y++) {
      const row: string[] = []
      for (let x = 0; x < width; x++) {
        const idx = (y * png.width + x) * 4
        const r = png.data[idx]
        const g = png.data[idx + 1]
        const b = png.data[idx + 2]
        const a = png.data[idx + 3]
        if (a < PNG_ALPHA_THRESHOLD) {
          row.push('')
        } else {
          row.push(`#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`.toUpperCase())
        }
      }
      sprite.push(row)
    }
    return sprite
  } catch {
    const sprite: string[][] = []
    for (let y = 0; y < height; y++) {
      sprite.push(new Array(width).fill(''))
    }
    return sprite
  }
}

export function loadDefaultLayout(assetsDir: string): Record<string, unknown> | null {
  try {
    const layoutPath = path.join(assetsDir, 'default-layout.json')
    if (!fs.existsSync(layoutPath)) return null
    return JSON.parse(fs.readFileSync(layoutPath, 'utf-8'))
  } catch {
    return null
  }
}

export function loadCharacterSprites(assetsDir: string): CharacterDirectionSprites[] | null {
  try {
    const charDir = path.join(assetsDir, 'characters')
    const characters: CharacterDirectionSprites[] = []

    for (let ci = 0; ci < CHAR_COUNT; ci++) {
      const filePath = path.join(charDir, `char_${ci}.png`)
      if (!fs.existsSync(filePath)) return null

      const png = PNG.sync.read(fs.readFileSync(filePath))
      const charData: CharacterDirectionSprites = { down: [], up: [], right: [] }

      for (let dirIdx = 0; dirIdx < CHARACTER_DIRECTIONS.length; dirIdx++) {
        const dir = CHARACTER_DIRECTIONS[dirIdx]
        const rowOffsetY = dirIdx * CHAR_FRAME_H
        const frames: string[][][] = []

        for (let f = 0; f < CHAR_FRAMES_PER_ROW; f++) {
          const sprite: string[][] = []
          const frameOffsetX = f * CHAR_FRAME_W
          for (let y = 0; y < CHAR_FRAME_H; y++) {
            const row: string[] = []
            for (let x = 0; x < CHAR_FRAME_W; x++) {
              const idx = ((rowOffsetY + y) * png.width + (frameOffsetX + x)) * 4
              const r = png.data[idx]
              const g = png.data[idx + 1]
              const b = png.data[idx + 2]
              const a = png.data[idx + 3]
              if (a < PNG_ALPHA_THRESHOLD) {
                row.push('')
              } else {
                row.push(`#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`.toUpperCase())
              }
            }
            sprite.push(row)
          }
          frames.push(sprite)
        }
        charData[dir] = frames
      }
      characters.push(charData)
    }

    console.log(`[AssetLoader] Loaded ${characters.length} character sprites`)
    return characters
  } catch (err) {
    console.error(`[AssetLoader] Error loading character sprites:`, err)
    return null
  }
}

export function loadFloorTiles(assetsDir: string): string[][][] | null {
  try {
    const floorPath = path.join(assetsDir, 'floors.png')
    if (!fs.existsSync(floorPath)) return null

    const png = PNG.sync.read(fs.readFileSync(floorPath))
    const sprites: string[][][] = []
    for (let t = 0; t < FLOOR_PATTERN_COUNT; t++) {
      const sprite: string[][] = []
      for (let y = 0; y < FLOOR_TILE_SIZE; y++) {
        const row: string[] = []
        for (let x = 0; x < FLOOR_TILE_SIZE; x++) {
          const px = t * FLOOR_TILE_SIZE + x
          const idx = (y * png.width + px) * 4
          const r = png.data[idx]
          const g = png.data[idx + 1]
          const b = png.data[idx + 2]
          const a = png.data[idx + 3]
          if (a < PNG_ALPHA_THRESHOLD) {
            row.push('')
          } else {
            row.push(`#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`.toUpperCase())
          }
        }
        sprite.push(row)
      }
      sprites.push(sprite)
    }
    console.log(`[AssetLoader] Loaded ${sprites.length} floor tiles`)
    return sprites
  } catch (err) {
    console.error(`[AssetLoader] Error loading floor tiles:`, err)
    return null
  }
}

export function loadWallTiles(assetsDir: string): string[][][] | null {
  try {
    const wallPath = path.join(assetsDir, 'walls.png')
    if (!fs.existsSync(wallPath)) return null

    const png = PNG.sync.read(fs.readFileSync(wallPath))
    const sprites: string[][][] = []
    for (let mask = 0; mask < WALL_BITMASK_COUNT; mask++) {
      const ox = (mask % WALL_GRID_COLS) * WALL_PIECE_WIDTH
      const oy = Math.floor(mask / WALL_GRID_COLS) * WALL_PIECE_HEIGHT
      const sprite: string[][] = []
      for (let r = 0; r < WALL_PIECE_HEIGHT; r++) {
        const row: string[] = []
        for (let c = 0; c < WALL_PIECE_WIDTH; c++) {
          const idx = ((oy + r) * png.width + (ox + c)) * 4
          const rv = png.data[idx]
          const gv = png.data[idx + 1]
          const bv = png.data[idx + 2]
          const av = png.data[idx + 3]
          if (av < PNG_ALPHA_THRESHOLD) {
            row.push('')
          } else {
            row.push(`#${rv.toString(16).padStart(2, '0')}${gv.toString(16).padStart(2, '0')}${bv.toString(16).padStart(2, '0')}`.toUpperCase())
          }
        }
        sprite.push(row)
      }
      sprites.push(sprite)
    }
    console.log(`[AssetLoader] Loaded ${sprites.length} wall tiles`)
    return sprites
  } catch (err) {
    console.error(`[AssetLoader] Error loading wall tiles:`, err)
    return null
  }
}

export function loadFurnitureAssets(assetsDir: string): { catalog: FurnitureAssetMeta[]; sprites: Record<string, string[][]> } | null {
  try {
    const catalogPath = path.join(assetsDir, 'furniture', 'furniture-catalog.json')
    if (!fs.existsSync(catalogPath)) return null

    const catalogData = JSON.parse(fs.readFileSync(catalogPath, 'utf-8'))
    const catalog: FurnitureAssetMeta[] = catalogData.assets || []
    const sprites: Record<string, string[][]> = {}

    for (const asset of catalog) {
      try {
        let filePath = asset.file
        if (!filePath.startsWith('assets/')) {
          filePath = `assets/${filePath}`
        }
        // Assets are relative to the parent of assetsDir
        const assetPath = path.join(path.dirname(assetsDir), filePath)
        if (!fs.existsSync(assetPath)) {
          // Try relative to assetsDir parent differently
          const altPath = path.join(assetsDir, '..', filePath)
          if (fs.existsSync(altPath)) {
            sprites[asset.id] = pngToSpriteData(fs.readFileSync(altPath), asset.width, asset.height)
          }
          continue
        }
        sprites[asset.id] = pngToSpriteData(fs.readFileSync(assetPath), asset.width, asset.height)
      } catch {
        // Skip individual asset errors
      }
    }

    console.log(`[AssetLoader] Loaded ${Object.keys(sprites).length}/${catalog.length} furniture assets`)
    return { catalog, sprites }
  } catch (err) {
    console.error(`[AssetLoader] Error loading furniture:`, err)
    return null
  }
}
