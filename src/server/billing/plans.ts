/**
 * What each plan includes. This is the single place to change limits.
 * Payments are not connected yet: everyone is on "free" until a payment provider is plugged in.
 */
export type PlanId = 'free' | 'pro'

export interface PlanLimits {
  /** Lessons a student may complete per day. */
  lessonsPerDay: number
  /** AI voice conversation, seconds per day and per month. */
  voiceSecondsPerDay: number
  voiceSecondsPerMonth: number
  /** AI text chat messages per day. */
  textMessagesPerDay: number
}

export const PLANS: Record<PlanId, PlanLimits> = {
  free: {
    lessonsPerDay: 5,
    voiceSecondsPerDay: 3 * 60,
    voiceSecondsPerMonth: 90 * 60,
    textMessagesPerDay: 20,
  },
  pro: {
    lessonsPerDay: Infinity,
    voiceSecondsPerDay: 30 * 60,
    voiceSecondsPerMonth: 600 * 60,
    textMessagesPerDay: Infinity,
  },
}

export function limitsFor(plan: string): PlanLimits {
  return PLANS[plan as PlanId] ?? PLANS.free
}

/** XP a student should aim for each day (shown as the daily goal ring). */
export const DAILY_XP_GOAL = 30
