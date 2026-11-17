// Small wrapper around localStorage that never throws (private mode, blocked storage).
const PREFIX = 'talkreal.'

export function load(key: string): string | null {
  try {
    return localStorage.getItem(PREFIX + key)
  } catch {
    return null
  }
}

export function save(key: string, value: string): void {
  try {
    localStorage.setItem(PREFIX + key, value)
  } catch {
    // The value just won't be remembered.
  }
}
