/**
 * What a student can tell about themselves. Everything except the name is optional.
 * The names shown to students are in the translation files under "goals.<id>" and "interests.<id>".
 */

/** Why someone is learning English. */
export const GOALS = [
  { id: 'travel', icon: '✈️' },
  { id: 'work', icon: '💼' },
  { id: 'study', icon: '🎓' },
  { id: 'move', icon: '🌍' },
  { id: 'people', icon: '💬' },
  { id: 'exam', icon: '📝' },
  { id: 'media', icon: '🎬' },
  { id: 'self', icon: '🧠' },
] as const

/** What someone likes to talk about. Teachers use it to pick topics; later it helps students find each other. */
export const INTERESTS = [
  { id: 'travel', icon: '🧳' },
  { id: 'movies', icon: '🍿' },
  { id: 'music', icon: '🎧' },
  { id: 'sport', icon: '⚽' },
  { id: 'tech', icon: '💻' },
  { id: 'food', icon: '🍜' },
  { id: 'games', icon: '🎮' },
  { id: 'books', icon: '📚' },
  { id: 'business', icon: '📈' },
  { id: 'art', icon: '🎨' },
  { id: 'science', icon: '🔬' },
  { id: 'pets', icon: '🐾' },
] as const

export const GENDERS = ['female', 'male', 'other'] as const

export type GoalId = (typeof GOALS)[number]['id']
export type InterestId = (typeof INTERESTS)[number]['id']
export type Gender = (typeof GENDERS)[number]

export const LIMITS = { name: 40, bio: 160, city: 60, goals: 3, interests: 6, minAge: 6, maxAge: 110 }

export interface Profile {
  name: string | null
  bio: string | null
  city: string | null
  /** Stored as a year of birth, so the age stays right as time passes. */
  age: number | null
  gender: Gender | null
  goals: GoalId[]
  interests: InterestId[]
  /** Whether other students may see this profile once the community opens. Off unless the student turns it on. */
  discoverable: boolean
}

const text = (value: unknown, max: number) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) || null : null)
const pick = <T extends string>(value: unknown, allowed: readonly { id: T }[], max: number): T[] =>
  Array.isArray(value) ? [...new Set(value.filter((v): v is T => allowed.some((a) => a.id === v)))].slice(0, max) : []

/** Tidies whatever the app sent into a profile that is safe to store. */
export function cleanProfile(input: Record<string, unknown>): Profile {
  const age = Number(input.age)
  return {
    name: text(input.name, LIMITS.name),
    bio: typeof input.bio === 'string' ? input.bio.trim().slice(0, LIMITS.bio) || null : null,
    city: text(input.city, LIMITS.city),
    age: Number.isInteger(age) && age >= LIMITS.minAge && age <= LIMITS.maxAge ? age : null,
    gender: (GENDERS as readonly string[]).includes(input.gender as string) ? (input.gender as Gender) : null,
    goals: pick(input.goals, GOALS, LIMITS.goals),
    interests: pick(input.interests, INTERESTS, LIMITS.interests),
    discoverable: input.discoverable === true,
  }
}

/** A steady colour for someone's avatar when they have no photo, picked from their id. */
const AVATAR_COLORS = ['#FF6B4A', '#7C5CFF', '#2EC4A0', '#3D9BFF', '#E0A21A', '#E2518F']
export function avatarColor(seed: string): string {
  let sum = 0
  for (const ch of seed) sum = (sum * 31 + ch.charCodeAt(0)) >>> 0
  return AVATAR_COLORS[sum % AVATAR_COLORS.length]
}
