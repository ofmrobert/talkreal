import { and, eq } from 'drizzle-orm'
import { PRICES, type PaidPlanId, type Period } from '../../shared/plans'
import { db } from '../db/client'
import { payments, promoCodes } from '../db/schema'

/** Why a code cannot be used. The app has a sentence for each. */
export type PromoProblem = 'unknown' | 'expired' | 'used_up' | 'other_plan' | 'already_used'

export type PromoCheck =
  | { ok: true; code: string; percentOff: number; listRub: number; priceRub: number }
  | { ok: false; problem: PromoProblem }

/** Codes are written in capitals without spaces; students may type them any way. */
export const normalizeCode = (value: unknown) => (typeof value === 'string' ? value.trim().toUpperCase().replace(/\s+/g, '') : '')

export const isValidCode = (code: string) => /^[A-Z0-9_-]{3,24}$/.test(code)

/** The price after a discount, in whole rubles. */
export const discounted = (listRub: number, percentOff: number) => Math.max(0, Math.round((listRub * (100 - percentOff)) / 100))

/** Checks whether this student may use this code for this plan, and what the price becomes. */
export async function checkPromo(rawCode: unknown, plan: PaidPlanId, period: Period, userId: string): Promise<PromoCheck> {
  const code = normalizeCode(rawCode)
  if (!isValidCode(code)) return { ok: false, problem: 'unknown' }
  const [promo] = await db.select().from(promoCodes).where(eq(promoCodes.code, code)).limit(1)
  if (!promo || !promo.active) return { ok: false, problem: 'unknown' }
  if (promo.validUntil && promo.validUntil.getTime() < Date.now()) return { ok: false, problem: 'expired' }
  if (promo.maxUses !== null && promo.usedCount >= promo.maxUses) return { ok: false, problem: 'used_up' }
  if ((promo.plan && promo.plan !== plan) || (promo.period && promo.period !== period)) return { ok: false, problem: 'other_plan' }

  // One student, one use of a code.
  const [earlier] = await db
    .select({ id: payments.id })
    .from(payments)
    .where(and(eq(payments.userId, userId), eq(payments.promoCode, code), eq(payments.status, 'paid')))
    .limit(1)
  if (earlier) return { ok: false, problem: 'already_used' }

  const listRub = PRICES[plan][period]
  return { ok: true, code, percentOff: promo.percentOff, listRub, priceRub: discounted(listRub, promo.percentOff) }
}
