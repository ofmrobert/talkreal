/**
 * What each plan includes and costs. This is the single place to change limits and prices.
 * Payments are not connected yet: everyone is on "free" until a payment provider is plugged in.
 *
 * How the voice limits were chosen (AI price list, November 2026):
 *   a minute of conversation costs us at most about $0.023 (roughly 2.3 ₽).
 *   free:  15 min/month  → at most about 35 ₽ per user per month
 *   pro:   150 min/month → at most about 345 ₽, against a price of 990 ₽
 *   max:   400 min/month → at most about 920 ₽, against a price of 1 990 ₽
 * Most students use far less than their cap, so real margins are higher than these worst cases.
 */
export type PlanId = 'free' | 'pro' | 'max'

export interface PlanLimits {
  /** Monthly price in rubles (0 = free). Used when payments are connected. */
  priceRub: number
  /** Lessons a student may complete per day. */
  lessonsPerDay: number
  /** AI voice conversation, seconds per day and per month. */
  voiceSecondsPerDay: number
  voiceSecondsPerMonth: number
  /** AI text chat messages per day. */
  textMessagesPerDay: number
}

const MINUTE = 60

export const PLANS: Record<PlanId, PlanLimits> = {
  free: {
    priceRub: 0,
    lessonsPerDay: 5,
    voiceSecondsPerDay: 3 * MINUTE,
    voiceSecondsPerMonth: 15 * MINUTE,
    textMessagesPerDay: 20,
  },
  pro: {
    priceRub: 990,
    lessonsPerDay: Infinity,
    voiceSecondsPerDay: 15 * MINUTE,
    voiceSecondsPerMonth: 150 * MINUTE,
    textMessagesPerDay: Infinity,
  },
  max: {
    priceRub: 1990,
    lessonsPerDay: Infinity,
    voiceSecondsPerDay: 30 * MINUTE,
    voiceSecondsPerMonth: 400 * MINUTE,
    textMessagesPerDay: Infinity,
  },
}

export function limitsFor(plan: string): PlanLimits {
  return PLANS[plan as PlanId] ?? PLANS.free
}

/** XP a student should aim for each day (shown as the daily goal ring). */
export const DAILY_XP_GOAL = 30
