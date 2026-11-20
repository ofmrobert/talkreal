/**
 * The paid plans: what they cost and what they include. This is the one place to change a
 * price or a limit; the pricing page, the payment and the limits all read from here.
 */
export type PlanId = 'free' | 'pro' | 'max'
export type PaidPlanId = Exclude<PlanId, 'free'>
export type Period = 'month' | 'year'

export interface PlanLimits {
  /** Lessons a student may complete per day. Infinity = no limit. */
  lessonsPerDay: number
  /** AI voice conversation, seconds per day and per month. */
  voiceSecondsPerDay: number
  voiceSecondsPerMonth: number
  /** AI text chat messages per day. Infinity = no limit. */
  textMessagesPerDay: number
}

const MINUTE = 60

export const PLANS: Record<PlanId, PlanLimits> = {
  free: {
    lessonsPerDay: 5,
    voiceSecondsPerDay: 3 * MINUTE,
    voiceSecondsPerMonth: 10 * MINUTE,
    textMessagesPerDay: 10,
  },
  pro: {
    lessonsPerDay: Infinity,
    voiceSecondsPerDay: 15 * MINUTE,
    voiceSecondsPerMonth: 150 * MINUTE,
    textMessagesPerDay: Infinity,
  },
  max: {
    lessonsPerDay: Infinity,
    voiceSecondsPerDay: 30 * MINUTE,
    voiceSecondsPerMonth: 300 * MINUTE,
    textMessagesPerDay: Infinity,
  },
}

/** Prices in whole rubles for one month and for one year paid at once. */
export const PRICES: Record<PaidPlanId, Record<Period, number>> = {
  pro: { month: 990, year: 6990 },
  max: { month: 1990, year: 13990 },
}

/** How many days of access one payment buys. */
export const PERIOD_DAYS: Record<Period, number> = { month: 30, year: 365 }

export const isPaidPlan = (value: unknown): value is PaidPlanId => value === 'pro' || value === 'max'
export const isPeriod = (value: unknown): value is Period => value === 'month' || value === 'year'

export function limitsFor(plan: string): PlanLimits {
  return PLANS[plan as PlanId] ?? PLANS.free
}

/** What a year costs per month, rounded: shown next to the monthly price. */
export const yearlyPerMonth = (plan: PaidPlanId) => Math.round(PRICES[plan].year / 12)

/** How much cheaper the year is than twelve single months, in percent. */
export const yearlySaving = (plan: PaidPlanId) => Math.round((1 - PRICES[plan].year / (PRICES[plan].month * 12)) * 100)
