import { extname } from 'node:path'

/** Files watch mode will scan or statically fix. */
export const HTML_EXTENSIONS = ['.html', '.htm'] as const

export const COMPONENT_EXTENSIONS = ['.jsx', '.tsx', '.vue', '.svelte'] as const

export const WATCH_EXTENSIONS = [...HTML_EXTENSIONS, ...COMPONENT_EXTENSIONS] as const

export function isHtmlFile(filename: string): boolean {
  const ext = extname(filename).toLowerCase()
  return (HTML_EXTENSIONS as readonly string[]).includes(ext)
}

export function isComponentFile(filename: string): boolean {
  const ext = extname(filename).toLowerCase()
  return (COMPONENT_EXTENSIONS as readonly string[]).includes(ext)
}

export function isWatchableFile(filename: string): boolean {
  const ext = extname(filename).toLowerCase()
  return (WATCH_EXTENSIONS as readonly string[]).includes(ext)
}
