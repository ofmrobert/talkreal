import { useEffect, useState } from 'react'
import type { FeedSummary } from '../../shared/feed'
import { api } from './api'

/**
 * What is new in the feed since the student last opened it: for the card on the Learn tab
 * and the dot on the Feed tab. "Last opened" is remembered on this device only.
 */

const KEY = 'talkreal.feedSeen'
const FRESH_FOR_MS = 60_000

let cached: { at: number; value: FeedSummary } | null = null
let loading: Promise<FeedSummary | null> | null = null
const listeners = new Set<(value: FeedSummary | null) => void>()

function lastSeen(): string {
  try {
    const saved = localStorage.getItem(KEY)
    if (saved && !Number.isNaN(Date.parse(saved))) return saved
  } catch {
    // Storage can be blocked; then everything of the last days counts as new.
  }
  return new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
}

/** Called when the student opens the feed: nothing in it is new any more. */
export function markFeedSeen(): void {
  try {
    localStorage.setItem(KEY, new Date().toISOString())
  } catch {
    // Not saved: the dot comes back next time, which is harmless.
  }
  if (cached) cached = { at: cached.at, value: { ...cached.value, fresh: 0 } }
  for (const tell of listeners) tell(cached?.value ?? null)
}

function load(): Promise<FeedSummary | null> {
  if (cached && Date.now() - cached.at < FRESH_FOR_MS) return Promise.resolve(cached.value)
  loading ??= api<FeedSummary>(`/feed/summary?since=${encodeURIComponent(lastSeen())}`)
    .then((value) => {
      cached = { at: Date.now(), value }
      for (const tell of listeners) tell(value)
      return value
    })
    .catch(() => null)
    .finally(() => {
      loading = null
    })
  return loading
}

/** The feed's news, or null while it loads or if it could not be loaded. `refreshKey` asks again when it changes. */
export function useFeedNews(refreshKey?: string): FeedSummary | null {
  const [news, setNews] = useState<FeedSummary | null>(cached?.value ?? null)
  useEffect(() => {
    listeners.add(setNews)
    void load().then((value) => value && setNews(value))
    return () => {
      listeners.delete(setNews)
    }
  }, [refreshKey])
  return news
}
