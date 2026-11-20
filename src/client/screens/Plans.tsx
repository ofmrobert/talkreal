import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { PLANS, PRICES, yearlyPerMonth, yearlySaving, type PaidPlanId, type Period, type PlanId } from '../../shared/plans'
import { useAuth } from '../auth/AuthContext'
import { CheckIcon } from '../components/icons'
import SellerDetails from '../components/SellerDetails'
import { api, ApiError } from '../lib/api'

const ORDER: PlanId[] = ['pro', 'max', 'free']
const LOOK: Record<PlanId, { card: string; button: string; tick: string }> = {
  pro: {
    card: 'bg-card ring-4 ring-coral shadow-[0_6px_0_0_var(--color-coral-dark)]',
    button: 'bg-coral text-white shadow-[0_5px_0_0_var(--color-coral-dark)] active:shadow-[0_1px_0_0_var(--color-coral-dark)]',
    tick: 'text-coral',
  },
  max: {
    card: 'bg-night text-white shadow-[0_6px_0_0_rgb(var(--shade)/0.3)]',
    button: 'bg-sun text-coal shadow-[0_5px_0_0_var(--color-sun-dark)] active:shadow-[0_1px_0_0_var(--color-sun-dark)]',
    tick: 'text-sun',
  },
  free: { card: 'bg-card/70', button: '', tick: 'text-mint' },
}

const rub = (amount: number) => `${amount.toLocaleString('ru-RU')} ₽`

/** The price list and the place to buy a plan. Open to everyone, so prices can be read before logging in. */
export default function Plans() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [period, setPeriod] = useState<Period>('year')
  const [canPay, setCanPay] = useState(false)
  const [busy, setBusy] = useState<PaidPlanId | null>(null)
  const [error, setError] = useState(false)
  /** The promo code the student typed, and the price it gives for each plan it works with. */
  const [promoOpen, setPromoOpen] = useState(false)
  const [promoInput, setPromoInput] = useState('')
  const [promo, setPromo] = useState<{ code: string; percentOff: number; prices: Partial<Record<PaidPlanId, number>> } | null>(null)
  const [promoError, setPromoError] = useState<string | null>(null)

  useEffect(() => {
    api<{ canPay: boolean }>('/billing/plans')
      .then((data) => setCanPay(data.canPay))
      .catch(() => setCanPay(false))
  }, [])

  /** Asks the server what the code does for each plan at the chosen term. */
  async function applyPromo(code: string, term: Period) {
    if (!user) return navigate('/login')
    setPromoError(null)
    type Answer = { ok: boolean; code?: string; percentOff?: number; priceRub?: number; problem?: string }
    try {
      const [pro, max] = await Promise.all((['pro', 'max'] as const).map((plan) => api<Answer>('/billing/promo', { code, plan, period: term })))
      const good = [pro, max].find((answer) => answer.ok)
      if (!good) {
        setPromo(null)
        setPromoError(t(`plans.promo.${pro.problem ?? 'unknown'}`))
        return
      }
      setPromo({
        code: good.code!,
        percentOff: good.percentOff!,
        prices: { ...(pro.ok ? { pro: pro.priceRub } : {}), ...(max.ok ? { max: max.priceRub } : {}) },
      })
    } catch {
      setPromoError(t('plans.error'))
    }
  }

  function changePeriod(term: Period) {
    setPeriod(term)
    // The code may be for one term only, and the prices differ: ask again.
    if (promo) void applyPromo(promo.code, term)
  }

  async function buy(plan: PaidPlanId) {
    if (!user) return navigate('/login')
    setBusy(plan)
    setError(false)
    try {
      const { url } = await api<{ url: string }>('/billing/checkout', { plan, period, ...(promo?.prices[plan] !== undefined ? { promo: promo.code } : {}) })
      window.location.href = url
    } catch (err) {
      if (err instanceof ApiError && err.code === 'promo') {
        setPromo(null)
        setPromoError(t('plans.promo.unknown'))
      } else setError(true)
      setBusy(null)
    }
  }

  const until = user?.planUntil ? new Intl.DateTimeFormat(i18n.language === 'en' ? 'en-GB' : 'ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(user.planUntil)).replace(/\s*г\.$/, '') : null

  /** What a plan includes, as short lines. */
  function features(plan: PlanId): string[] {
    const limits = PLANS[plan]
    const minutes = Math.round(limits.voiceSecondsPerMonth / 60)
    return [
      Number.isFinite(limits.lessonsPerDay) ? t('plans.f.lessons', { count: limits.lessonsPerDay }) : t('plans.f.lessonsAll'),
      t('plans.f.voice', { count: minutes }),
      Number.isFinite(limits.textMessagesPerDay) ? t('plans.f.chat', { count: limits.textMessagesPerDay }) : t('plans.f.chatAll'),
      t('plans.f.reviews'),
      ...(plan === 'free' ? [t('plans.f.course')] : [t('plans.f.everything')]),
    ]
  }

  return (
    <div className="safe-screen mx-auto flex h-full max-w-md flex-col gap-4">
      <header className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))}
          aria-label={t('privacy.back')}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-2xl font-bold text-ink/55 active:bg-ink/10"
        >
          ←
        </button>
        <h1 className="text-2xl font-extrabold leading-tight">{t('plans.title')}</h1>
      </header>

      <main className="flex flex-1 flex-col gap-4 overflow-y-auto pb-4">
        <p className="text-base leading-relaxed text-ink/70">{t('plans.subtitle')}</p>

        {user && user.plan !== 'free' && (
          <p className="rounded-2xl bg-mint/20 p-3 text-base font-bold text-good-ink" role="status">
            {until ? t('plans.current', { plan: t(`plans.name.${user.plan}`), date: until }) : t('plans.currentForever', { plan: t(`plans.name.${user.plan}`) })}
          </p>
        )}

        <div className="flex gap-2 rounded-2xl bg-card p-1.5" role="radiogroup" aria-label={t('plans.period')}>
          {(['year', 'month'] as const).map((p) => (
            <button
              key={p}
              type="button"
              role="radio"
              aria-checked={period === p}
              onClick={() => changePeriod(p)}
              className={`min-h-12 flex-1 rounded-xl text-base font-extrabold transition-colors ${period === p ? 'bg-night text-white' : 'text-ink/60'}`}
            >
              {t(`plans.${p}`)}
              {p === 'year' && <span className={`ml-1.5 rounded-full px-2 py-0.5 text-xs ${period === p ? 'bg-sun text-coal' : 'bg-sun/40 text-ink'}`}>−{yearlySaving('pro')}%</span>}
            </button>
          ))}
        </div>

        {error && (
          <p role="alert" className="rounded-2xl bg-bad/15 p-3 text-center text-base font-bold text-bad-ink">
            {t('plans.error')}
          </p>
        )}

        {ORDER.map((plan) => {
          const look = LOOK[plan]
          const paid = plan !== 'free'
          const list = paid ? PRICES[plan][period] : 0
          const price = paid ? (promo?.prices[plan] ?? list) : 0
          const discountedPlan = paid && price !== list
          return (
            <section key={plan} className={`flex flex-col gap-3 rounded-3xl p-5 ${look.card}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-extrabold leading-tight">{t(`plans.name.${plan}`)}</h2>
                  <p className="text-sm font-bold opacity-65">{t(`plans.for.${plan}`)}</p>
                </div>
                {plan === 'pro' && <span className="shrink-0 rounded-full bg-coral px-3 py-1 text-xs font-extrabold uppercase tracking-wide text-white">{t('plans.popular')}</span>}
              </div>

              {paid ? (
                <div>
                  <p className="text-3xl font-extrabold">
                    {discountedPlan && <span className="mr-2 text-xl font-bold line-through opacity-50">{rub(period === 'year' ? yearlyPerMonth(plan) : list)}</span>}
                    {rub(period === 'year' ? (discountedPlan ? Math.round(price / 12) : yearlyPerMonth(plan)) : price)}
                    <span className="text-base font-bold opacity-60"> / {t('plans.perMonth')}</span>
                  </p>
                  <p className="text-sm font-semibold opacity-65">
                    {period === 'year' ? t('plans.billedYear', { price: rub(price) }) : t('plans.billedMonth')}
                    {discountedPlan && ` · ${t('plans.promo.applied', { code: promo!.code, percent: promo!.percentOff })}`}
                  </p>
                </div>
              ) : (
                <p className="text-3xl font-extrabold">{rub(0)}</p>
              )}

              <ul className="flex flex-col gap-1.5">
                {features(plan).map((line) => (
                  <li key={line} className="flex items-start gap-2 text-base font-semibold leading-snug">
                    <CheckIcon width={18} height={18} className={`mt-0.5 shrink-0 ${look.tick}`} />
                    {line}
                  </li>
                ))}
              </ul>

              {paid &&
                (canPay ? (
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => buy(plan)}
                    className={`min-h-14 w-full rounded-2xl text-lg font-extrabold active:translate-y-1 disabled:opacity-60 ${look.button}`}
                  >
                    {busy === plan ? t('plans.opening') : price === 0 ? t('plans.promo.free') : t('plans.buy', { price: rub(price) })}
                  </button>
                ) : (
                  <p className="rounded-2xl bg-ink/10 p-3 text-center text-base font-bold opacity-80">{t('plans.soon')}</p>
                ))}
            </section>
          )
        })}

        {canPay && (
          <section className="rounded-3xl bg-card p-4">
            {promoOpen ? (
              <form
                className="flex flex-col gap-2"
                onSubmit={(e) => {
                  e.preventDefault()
                  if (promoInput.trim()) void applyPromo(promoInput.trim(), period)
                }}
              >
                <label htmlFor="promo" className="text-base font-extrabold">
                  {t('plans.promo.title')}
                </label>
                <div className="flex gap-2">
                  <input
                    id="promo"
                    value={promoInput}
                    onChange={(e) => setPromoInput(e.target.value.toUpperCase())}
                    autoCapitalize="characters"
                    autoComplete="off"
                    maxLength={24}
                    className="min-h-12 min-w-0 flex-1 select-text rounded-2xl border-2 border-ink/10 bg-card px-4 text-lg font-bold uppercase outline-none focus:border-coral"
                  />
                  <button type="submit" className="min-h-12 shrink-0 rounded-2xl bg-night px-4 text-base font-extrabold text-white active:translate-y-0.5">
                    {t('plans.promo.apply')}
                  </button>
                </div>
                {promoError && (
                  <p role="alert" className="text-sm font-bold text-bad-ink">
                    {promoError}
                  </p>
                )}
                {promo && (
                  <p role="status" className="text-sm font-bold text-good-ink">
                    {t('plans.promo.applied', { code: promo.code, percent: promo.percentOff })}
                  </p>
                )}
              </form>
            ) : (
              <button type="button" onClick={() => setPromoOpen(true)} className="min-h-11 text-base font-extrabold text-coral-ink underline">
                {t('plans.promo.have')}
              </button>
            )}
          </section>
        )}

        <section className="rounded-3xl bg-card p-4">
          <h2 className="text-lg font-extrabold">{t('plans.howTitle')}</h2>
          <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-5 text-base leading-relaxed text-ink/75">
            <li>{t('plans.how1')}</li>
            <li>{t('plans.how2')}</li>
            <li>{t('plans.how3')}</li>
          </ul>
          <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-base font-extrabold text-coral-ink">
            <Link to="/offer" className="underline">
              {t('plans.offer')}
            </Link>
            <Link to="/privacy" className="underline">
              {t('privacy.link')}
            </Link>
          </p>
        </section>

        <SellerDetails />
      </main>
    </div>
  )
}
