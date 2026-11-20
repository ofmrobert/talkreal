import { and, desc, eq, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { isPaidPlan, isPeriod, PERIOD_DAYS, PLANS, PRICES, type PaidPlanId, type Period } from '../../shared/plans'
import { requireUser, type AuthEnv } from '../auth/sessions'
import { planOf } from '../billing/plans'
import { checkPromo } from '../billing/promo'
import { billingMode, createPayment, fetchPayment, type PaymentStatus } from '../billing/yookassa'
import { db } from '../db/client'
import { payments, promoCodes, users } from '../db/schema'
import { env } from '../env'
import { getPii } from '../pii'

const DAY_MS = 24 * 60 * 60 * 1000
const PLAN_NAMES: Record<PaidPlanId, string> = { pro: 'Pro', max: 'Max' }

export const billingRoutes = new Hono<AuthEnv>()

/** Infinity cannot travel as JSON: "no limit" is sent as null. */
const finite = (value: number) => (Number.isFinite(value) ? value : null)

/** The price list. Open to everyone, so it can be read before logging in. */
billingRoutes.get('/plans', (c) =>
  c.json({
    /** False until a payment service is connected: the app then shows the prices without a buy button. */
    canPay: billingMode() !== 'off',
    prices: PRICES,
    plans: Object.fromEntries(
      Object.entries(PLANS).map(([id, limits]) => [
        id,
        {
          lessonsPerDay: finite(limits.lessonsPerDay),
          voiceMinutesPerDay: Math.round(limits.voiceSecondsPerDay / 60),
          voiceMinutesPerMonth: Math.round(limits.voiceSecondsPerMonth / 60),
          textMessagesPerDay: finite(limits.textMessagesPerDay),
        },
      ]),
    ),
  }),
)

/**
 * Switches the plan on for a payment that has been paid. Safe to call any number of times and
 * from two places at once (the notification and the student's return): the payment is marked
 * as paid only once, and only that one call extends the plan.
 */
async function applyPaid(paymentId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [payment] = await tx
      .update(payments)
      .set({ status: 'paid', paidAt: new Date() })
      .where(and(eq(payments.id, paymentId), eq(payments.status, 'pending')))
      .returning()
    if (!payment || !isPaidPlan(payment.plan) || !isPeriod(payment.period)) return
    if (payment.promoCode) {
      await tx.update(promoCodes).set({ usedCount: sql`${promoCodes.usedCount} + 1` }).where(eq(promoCodes.code, payment.promoCode))
    }

    const [user] = await tx.select().from(users).where(eq(users.id, payment.userId)).limit(1)
    if (!user) return
    // Paying again for the plan you already have adds time to the end; a different plan starts today.
    const samePlan = planOf(user) === payment.plan && user.planUntil !== null
    const from = samePlan ? Math.max(user.planUntil!.getTime(), Date.now()) : Date.now()
    await tx
      .update(users)
      .set({ plan: payment.plan, planUntil: new Date(from + PERIOD_DAYS[payment.period] * DAY_MS) })
      .where(eq(users.id, user.id))
  })
}

/** Finds out from the payment service what happened to a payment, and acts on it. */
async function settle(payment: typeof payments.$inferSelect): Promise<PaymentStatus> {
  if (payment.status !== 'pending') return payment.status as PaymentStatus
  if (payment.provider !== 'yookassa' || !payment.providerPaymentId) return 'pending'

  const remote = await fetchPayment(payment.providerPaymentId)
  if (remote.status === 'paid') {
    // Never trust a payment whose amount is not the one we asked for.
    if (Math.round(remote.amountRub) !== payment.amountRub) {
      console.error(`Payment ${payment.id}: paid ${remote.amountRub} ₽ but ${payment.amountRub} ₽ was expected`)
      return 'pending'
    }
    await applyPaid(payment.id)
  } else if (remote.status === 'canceled') {
    await db.update(payments).set({ status: 'canceled' }).where(and(eq(payments.id, payment.id), eq(payments.status, 'pending')))
  }
  return remote.status
}

/** Starts a purchase and returns the page where the student pays. */
billingRoutes.post('/checkout', requireUser, async (c) => {
  const body = await c.req.json().catch(() => ({}))
  if (!isPaidPlan(body.plan) || !isPeriod(body.period)) return c.json({ error: 'invalid' }, 400)
  const mode = billingMode()
  if (mode === 'off') return c.json({ error: 'unavailable' }, 503)

  const userId = c.get('userId')
  const plan: PaidPlanId = body.plan
  const period: Period = body.period
  const listRub = PRICES[plan][period]
  let amountRub = listRub
  let promoCode: string | null = null
  if (body.promo) {
    const promo = await checkPromo(body.promo, plan, period, userId)
    if (!promo.ok) return c.json({ error: 'promo', problem: promo.problem }, 400)
    amountRub = promo.priceRub
    promoCode = promo.code
  }

  // A code that makes the plan free needs no payment page: the plan is simply switched on.
  if (amountRub === 0) {
    const [gift] = await db.insert(payments).values({ userId, provider: 'promo', plan, period, amountRub, promoCode, listRub }).returning()
    await applyPaid(gift.id)
    return c.json({ url: `/billing/return?payment=${gift.id}`, paymentId: gift.id })
  }

  const [payment] = await db.insert(payments).values({ userId, provider: mode, plan, period, amountRub, promoCode, listRub }).returning()

  // In production the address is fixed; elsewhere it is wherever the app was opened from.
  const origin = env.isProduction ? env.appUrl : new URL(c.req.url).origin
  try {
    const created = await createPayment({
      paymentId: payment.id,
      amountRub,
      description: `Talkreal ${PLAN_NAMES[plan]}: ${period === 'year' ? '1 год' : '1 месяц'}`,
      returnUrl: `${origin}/billing/return?payment=${payment.id}`,
      customerEmail: (await getPii(userId)).email,
    })
    if (!created.confirmationUrl) throw new Error('No payment page was returned')
    await db.update(payments).set({ providerPaymentId: created.id }).where(eq(payments.id, payment.id))
    return c.json({ url: created.confirmationUrl, paymentId: payment.id })
  } catch (err) {
    console.error('Could not start a payment:', err instanceof Error ? err.message : err)
    await db.update(payments).set({ status: 'canceled' }).where(eq(payments.id, payment.id))
    return c.json({ error: 'provider_error' }, 502)
  }
})

/** Tells the student what a promo code does before they pay. */
billingRoutes.post('/promo', requireUser, async (c) => {
  const body = await c.req.json().catch(() => ({}))
  if (!isPaidPlan(body.plan) || !isPeriod(body.period)) return c.json({ error: 'invalid' }, 400)
  const promo = await checkPromo(body.code, body.plan, body.period, c.get('userId'))
  return promo.ok ? c.json(promo) : c.json({ ok: false, problem: promo.problem })
})

/** The state of one payment. The app asks this when the student comes back from the payment page. */
billingRoutes.get('/payments/:id', requireUser, async (c) => {
  const id = c.req.param('id')
  if (!/^[0-9a-f-]{36}$/i.test(id)) return c.json({ error: 'not_found' }, 404)
  const [payment] = await db
    .select()
    .from(payments)
    .where(and(eq(payments.id, id), eq(payments.userId, c.get('userId'))))
    .limit(1)
  if (!payment) return c.json({ error: 'not_found' }, 404)

  const status = await settle(payment).catch((err) => {
    console.error('Could not check a payment:', err instanceof Error ? err.message : err)
    return 'pending' as const
  })
  const [user] = await db.select().from(users).where(eq(users.id, payment.userId)).limit(1)
  return c.json({ status, plan: payment.plan, period: payment.period, activePlan: user ? planOf(user) : 'free', planUntil: user?.planUntil ?? null })
})

/** The student's own payments, newest first. */
billingRoutes.get('/payments', requireUser, async (c) => {
  const rows = await db
    .select({ id: payments.id, plan: payments.plan, period: payments.period, amountRub: payments.amountRub, status: payments.status, paidAt: payments.paidAt })
    .from(payments)
    .where(and(eq(payments.userId, c.get('userId')), eq(payments.status, 'paid')))
    .orderBy(desc(payments.createdAt))
    .limit(12)
  return c.json({ payments: rows })
})

/**
 * ЮKassa calls this address when a payment changes. The message itself is not trusted: it only
 * tells us which payment to ask ЮKassa about.
 */
billingRoutes.post('/yookassa/webhook', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const providerId = typeof body?.object?.id === 'string' ? body.object.id : null
  if (providerId) {
    const [payment] = await db.select().from(payments).where(eq(payments.providerPaymentId, providerId)).limit(1)
    if (payment) {
      try {
        await settle(payment)
      } catch (err) {
        console.error('Could not process a payment notification:', err instanceof Error ? err.message : err)
        // A failure answer makes ЮKassa send the notification again later.
        return c.json({ error: 'retry' }, 500)
      }
    }
  }
  return c.json({ ok: true })
})

/** Test mode only: the stand-in payment page, which "pays" at once and sends the student back. */
billingRoutes.get('/mock-pay/:id', async (c) => {
  if (billingMode() !== 'mock') return c.json({ error: 'not_found' }, 404)
  const id = c.req.param('id')
  if (/^[0-9a-f-]{36}$/i.test(id)) await applyPaid(id)
  return c.redirect(`/billing/return?payment=${id}`)
})
