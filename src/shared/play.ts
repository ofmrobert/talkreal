/**
 * The game layer on top of the lessons: daily quests and the weekly league.
 * Names shown to students are in the translation files under "quests.<id>" and "league.tiers.<n>".
 */

/** What a quest counts. Each is one number the app already keeps for the day. */
export type QuestId = 'xp' | 'lessons' | 'good' | 'review' | 'chat' | 'talk'

export interface QuestRule {
  id: QuestId
  icon: string
  /** How much is needed in one day. */
  target: number
  /** XP given when the quest is claimed. */
  xp: number
}

/** Every quest there is. Three are picked for each student every day; "xp" is always one of them. */
export const QUESTS: Record<QuestId, QuestRule> = {
  xp: { id: 'xp', icon: '⚡', target: 30, xp: 10 },
  lessons: { id: 'lessons', icon: '📘', target: 2, xp: 10 },
  good: { id: 'good', icon: '🎯', target: 1, xp: 10 },
  review: { id: 'review', icon: '🔁', target: 1, xp: 10 },
  chat: { id: 'chat', icon: '✉️', target: 5, xp: 10 },
  talk: { id: 'talk', icon: '🎙️', target: 2, xp: 15 },
}

export const QUESTS_PER_DAY = 3
/** Extra XP for claiming all of the day's quests. */
export const QUEST_CHEST_XP = 20
/** A lesson finished with at least this result counts for the "good" quest. */
export const GOOD_LESSON_ACCURACY = 90

export interface Quest extends QuestRule {
  progress: number
  done: boolean
  claimed: boolean
}

/** The leagues, lowest first. Students start in the first and move up or down each week. */
export const LEAGUE_TIERS = [
  { icon: '🥉', color: '#C98A4B' },
  { icon: '🥈', color: '#9AA5B1' },
  { icon: '🥇', color: '#E0A21A' },
  { icon: '💎', color: '#3D9BFF' },
  { icon: '👑', color: '#7C5CFF' },
] as const

/** Students compete in groups of this many. */
export const LEAGUE_GROUP_SIZE = 30

/**
 * How many places at the top move up and how many at the bottom move down, for a group of a
 * given size. Small groups are gentle: nobody is sent down from a group of fewer than eight.
 */
export function leagueZones(size: number): { up: number; down: number } {
  const share = Math.max(1, Math.round(size * 0.2))
  return { up: Math.min(share, Math.max(1, size - 1)), down: size >= 8 ? share : 0 }
}

export interface LeagueRow {
  rank: number
  /** Null for students who have not agreed to show their profile: they appear as "Student" with a number. */
  name: string | null
  /** A short code that tells anonymous students apart. */
  tag: string
  userId: string
  photoVersion: number | null
  xp: number
  me: boolean
}
