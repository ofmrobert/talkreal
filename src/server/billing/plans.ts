import { limitsFor as limitsOf, type PlanId } from '../../shared/plans'

export { PLANS, type PlanId, type PlanLimits } from '../../shared/plans'
export const limitsFor = limitsOf

/** XP a student should aim for each day (shown as the daily goal ring). */
export const DAILY_XP_GOAL = 30

/**
 * The plan a student has right now. A paid plan runs until `planUntil`; after that the
 * student is back on the free plan without anything having to be switched off.
 */
export function planOf(user: { plan: string; planUntil: Date | null }, at: Date = new Date()): PlanId {
  if (user.plan !== 'pro' && user.plan !== 'max') return 'free'
  // A paid plan with no end date was set by hand (a gift, a tester): it does not run out.
  if (user.planUntil && user.planUntil.getTime() < at.getTime()) return 'free'
  return user.plan
}
