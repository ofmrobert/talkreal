import type { Text } from './lesson'

/**
 * The feed: one post a day from the Talkreal account, which students can like, answer and
 * discuss. Reading the posts is free; reading and writing comments is for Pro and Max.
 */

/** What a post is. Each weekday has its kind (see src/server/feed/generate.ts). */
export const POST_KINDS = ['word', 'mistake', 'poll', 'fact', 'question', 'picture'] as const
export type PostKind = (typeof POST_KINDS)[number]

export interface PostBody {
  emoji: string
  title: Text
  /** The post itself. Russian for the explanation, with the English being taught inside it. */
  text: Text
  /** The English word, phrase or sentence the post is about, shown large. */
  english?: string
  /** For a poll: the choices, which one is right, and why. */
  options?: string[]
  answer?: number
  explanation?: Text
}

export interface FeedFace {
  userId: string
  name: string | null
  tag: string
  photoVersion: number | null
}

export interface FeedPost {
  id: string
  /** One of the Talkreal account's kinds, 'challenge' for the weekly challenge, or 'student' for a post a student wrote. */
  kind: PostKind | 'challenge' | 'student'
  /** For the weekly challenge post. */
  challenge?: ChallengeState
  /** For a student's post that answers a challenge: the challenge, and the XP it won, if any. */
  answerTo: string | null
  prize: number | null
  /** Who wrote it. Null for the Talkreal account. */
  author: FeedFace | null
  /** The student's own post. */
  mine: boolean
  /** A student's post shown to someone on the free plan: who wrote it, but not the words. */
  locked: boolean
  body: PostBody
  publishedAt: string
  hasImage: boolean
  likes: number
  liked: boolean
  /** The student's own answer to a poll, if they have answered. */
  vote: number | null
  /** How many chose each option. Sent only after the student has answered. */
  votes: number[] | null
  comments: number
  /** A few of the people who commented, for the row of faces. */
  commenters: FeedFace[]
}

/** The weekly challenge: Talkreal sets a task on Monday, students answer with a post, the most liked answers win. */
export interface ChallengeState {
  endsAt: string
  open: boolean
  answers: number
  /** The viewer has answered. */
  answered: boolean
  /** Once it is over: the winners, best first. */
  winners: { face: FeedFace; prize: number }[]
}

/** The feed in brief, for the card on the Learn tab and the dot on the Feed tab. */
export interface FeedSummary {
  /** The Talkreal account's newest post. */
  latest: { kind: PostKind; emoji: string; title: Text } | null
  /** The weekly challenge, while it is running. */
  challenge: { title: Text; endsAt: string; answers: number; answered: boolean } | null
  /** Posts by others since the student last opened the feed. */
  fresh: number
  /** People who wrote a post or a comment in the last week, and a few of their faces. */
  activeThisWeek: number
  faces: FeedFace[]
}

export interface FeedComment {
  id: string
  text: string
  createdAt: string
  face: FeedFace
  mine: boolean
}

/** How many comments a free student may write per week: a taste of the community. */
export const FREE_COMMENTS_PER_WEEK = 1
export const COMMENT_MAX_LENGTH = 300
/** A student's own post: its length, and how many a day. Writing posts is part of the paid plans. */
export const POST_MAX_LENGTH = 500
export const POSTS_PER_DAY = 3
/** XP for the three most liked answers to a weekly challenge. */
export const CHALLENGE_PRIZES = [50, 30, 20]
/** XP for answering a poll. */
export const POLL_XP = 2
/** A comment reported by this many students is hidden until the owner looks at it. */
export const REPORTS_TO_HIDE = 3
