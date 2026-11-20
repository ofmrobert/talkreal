import type { FeedFace } from './feed'
import type { GoalId, InterestId } from './profile'

/**
 * The community: students find practice partners, follow each other and write private
 * messages. Finding and following is free; private messages are part of the paid plans.
 */

export const MESSAGE_MAX_LENGTH = 500
/** Messages a student may send in a day: far more than a conversation needs, and a brake on flooding. */
export const MESSAGES_PER_DAY = 300
/** New conversations a student may start in a day. */
export const NEW_CHATS_PER_DAY = 10
/** Private messages are for adults. */
export const MESSAGES_MIN_AGE = 18

/** Why a student cannot write private messages. Null = they can. */
export type MessagingBlock = 'pro' | 'rules' | 'age' | 'banned' | null

/** Another student as shown in lists of people. */
export interface Person {
  face: FeedFace
  level: string | null
  bio: string | null
  city: string | null
  goals: GoalId[]
  interests: InterestId[]
  /** What they have in common with the viewer: how many interests and goals. */
  common: number
  streak: number
  following: boolean
  followsYou: boolean
}

/** Someone's profile as another student sees it. */
export interface PublicProfile extends Person {
  /** False if they keep their profile to themselves: then only the code name is shown. */
  open: boolean
  followers: number
  followingCount: number
  posts: number
  blocked: boolean
  /** The conversation with them, if there is one. */
  threadId: string | null
  /** Whether the viewer may write to them, and if not, why. */
  canMessage: boolean
  me: boolean
}

export type ThreadStatus = 'request' | 'open' | 'declined'

/** A conversation in the list. */
export interface ThreadPreview {
  id: string
  other: FeedFace
  status: ThreadStatus
  /** A request from them that the viewer has not answered yet. */
  incoming: boolean
  /** The last message. Its text is empty for a student on the free plan. */
  last: { text: string; mine: boolean; at: string } | null
  unread: number
}

export interface DirectMessage {
  id: string
  text: string
  mine: boolean
  at: string
  /** For the sender only: the same message in better English, if it had a mistake. */
  better: string | null
  /** Removed by a moderator: the text is not sent. */
  hidden: boolean
}

export interface Inbox {
  threads: ThreadPreview[]
  block: MessagingBlock
  unread: number
}

export interface ThreadView {
  id: string
  other: FeedFace
  status: ThreadStatus
  incoming: boolean
  /** The viewer started it and is waiting for an answer: one message only until then. */
  waiting: boolean
  /** The viewer asked to talk and was turned down. */
  turnedDown: boolean
  /** The viewer blocked them, or they blocked the viewer. */
  blocked: boolean
  block: MessagingBlock
  messages: DirectMessage[]
}

export const REPORT_REASONS = ['rude', 'spam', 'contacts', 'unsafe', 'other'] as const
export type ReportReason = (typeof REPORT_REASONS)[number]
