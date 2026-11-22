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
  last: { text: string; kind: MessageKind; mine: boolean; at: string } | null
  unread: number
}

export type MessageKind = 'text' | 'voice' | 'video'
/** The longest voice message and video note, in seconds. */
export const VOICE_MAX_SECONDS = 60
export const VIDEO_MAX_SECONDS = 30
/** The biggest recording the server takes. The app records small files; this only stops abuse. */
export const VOICE_MAX_BYTES = 1_500_000
export const VIDEO_MAX_BYTES = 5_000_000
/** Voice and video messages a student may send in a day. */
export const MEDIA_PER_DAY = 40
/** How many bars the picture of a voice message has. */
export const WAVEFORM_BARS = 40

export interface DirectMessage {
  id: string
  /** Empty for a voice or video message. */
  text: string
  kind: MessageKind
  /** Voice and video: the length of the recording. */
  seconds: number | null
  /** Voice: WAVEFORM_BARS digits 0-9, the loudness over time. */
  waveform: string | null
  /** Voice and video: what the AI heard, if it heard words. */
  transcript: string | null
  mine: boolean
  at: string
  /** For the sender only: the same message in better English, if it had a mistake. */
  better: string | null
  /** Removed by a moderator: the text is not sent. */
  hidden: boolean
  /** The earlier message this one answers. Its text is empty if that message is no longer shown. */
  replyTo: MessageQuote | null
  /** At most two: the viewer's and the other person's. */
  reactions: { emoji: string; mine: boolean }[]
}

export interface MessageQuote {
  id: string
  text: string
  kind: MessageKind
  mine: boolean
}

/** The emoji a message can be answered with. The first is the "like" a double tap gives. */
export const REACTIONS = ['❤️', '👍', '😂', '😮', '😢', '🔥'] as const
/** How much of a message is shown when another message answers it. */
export const QUOTE_MAX_LENGTH = 140

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
  /** The viewer may send voice and video messages here. */
  media: boolean
  messages: DirectMessage[]
}

export const REPORT_REASONS = ['rude', 'spam', 'contacts', 'unsafe', 'other'] as const
export type ReportReason = (typeof REPORT_REASONS)[number]
