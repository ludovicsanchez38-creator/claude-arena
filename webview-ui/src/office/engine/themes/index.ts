import type { RenderTheme } from './types.js'
import { pixelClassicTheme } from './pixelClassic.js'

export type { RenderTheme, SceneState } from './types.js'

/** Registry of available render themes */
const themeRegistry: Record<string, RenderTheme> = {
  [pixelClassicTheme.id]: pixelClassicTheme,
}

export function getTheme(id: string): RenderTheme {
  return themeRegistry[id] ?? pixelClassicTheme
}

export function getAvailableThemes(): Array<{ id: string; name: string }> {
  return Object.values(themeRegistry).map((t) => ({ id: t.id, name: t.name }))
}

export function registerTheme(theme: RenderTheme): void {
  themeRegistry[theme.id] = theme
}

export const DEFAULT_THEME_ID = pixelClassicTheme.id
