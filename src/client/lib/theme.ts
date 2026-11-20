import { load, save } from './storage'

/**
 * The app's colour themes. The colours themselves live in index.css (one block per theme);
 * the few listed here are only for drawing the little previews in Settings.
 * The choice is kept on the phone, so it applies before the student has even logged in.
 */
export interface Theme {
  id: string
  dark: boolean
  /** page, card, accent, text */
  preview: [string, string, string, string]
}

export const THEMES: Theme[] = [
  { id: 'cream', dark: false, preview: ['#fff8f0', '#ffffff', '#ff6b4a', '#1f1b3a'] },
  { id: 'rose', dark: false, preview: ['#fff4f7', '#ffffff', '#e5487e', '#3b1a33'] },
  { id: 'ocean', dark: false, preview: ['#f2f6fb', '#ffffff', '#2f6fed', '#13233d'] },
  { id: 'lavender', dark: false, preview: ['#f6f4ff', '#ffffff', '#7c5cff', '#241a4d'] },
  { id: 'forest', dark: false, preview: ['#f3f7f2', '#ffffff', '#1f8f6f', '#15302a'] },
  { id: 'midnight', dark: true, preview: ['#100e1f', '#1c1933', '#ff7658', '#f2efff'] },
  { id: 'plum', dark: true, preview: ['#1a0f18', '#291927', '#ff6f9f', '#ffeef5'] },
]

/** "auto" follows the phone: Classic by day, Midnight when the phone is in dark mode. */
export const AUTO = 'auto'
const DEFAULT = 'cream'

const darkPhone = () => typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches

/** What the student chose: a theme id or "auto". */
export function chosenTheme(): string {
  const stored = load('theme')
  return stored === AUTO || THEMES.some((theme) => theme.id === stored) ? (stored as string) : DEFAULT
}

/** Puts a choice on screen (without remembering it). */
export function applyTheme(choice: string): void {
  const id = choice === AUTO ? (darkPhone() ? 'midnight' : DEFAULT) : choice
  const root = document.documentElement
  if (id === DEFAULT) delete root.dataset.theme
  else root.dataset.theme = id
  // The phone's status bar takes the colour of the page.
  const page = THEMES.find((theme) => theme.id === id)?.preview[0]
  if (page) document.querySelector('meta[name="theme-color"]')?.setAttribute('content', page)
}

export function chooseTheme(choice: string): void {
  save('theme', choice)
  applyTheme(choice)
}

// If the student follows the phone, change with it straight away.
if (typeof matchMedia === 'function') {
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => {
    if (chosenTheme() === AUTO) applyTheme(AUTO)
  })
}
