import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { PLANS, PRICES, yearlyPerMonth, yearlySaving, type PaidPlanId, type Period, type PlanId } from '../../shared/plans'
import { useAuth } from '../auth/AuthContext'
import { CheckIcon } from '../components/icons'
import SellerDetails from '../components/SellerDetails'
import { api } from '../lib/api'

const ORDER: PlanId[] = ['pro', 'max', 'free']
const LOOK: Record<PlanId, { card: string; button: string; tick: string }> = {
  pro: {
    card: 'bg-white ring-4 ring-coral shadow-[0_6px_0_0_var(--color-coral-dark)]',
    button: 'bg-coral text-white shadow-[0_5px_0_0_var(--color-coral-dark)] active:shadow-[0_1px_0_0_var(--color-coral-dark)]',
    tick: 'text-coral',
  },
  max: {
    card: 'bg-ink text-white shadow-[0_6px_0_0_rgba(31,27,58,0.3)]',
    button: 'bg-sun text-ink shadow-[0_5px_0_0_#E0A21A] active:shadow-[0_1px_0_0_#E0A21A]',
    tick: 'text-sun',
  },
  free: { card: 'bg-white/70', button: '', tick: 'text-mint' },
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

  useEffect(() => {
    api<{ canPay: boolean }>('/billing/plans')
      .then((data) => setCanPay(data.canPay))
      .catch(() => setCanPay(false))
  }, [])

  async function buy(plan: PaidPlanId) {
    if (!user) return navigate('/login')
    setBusy(plan)
    setError(false)
    try {
      const { url } = await api<{ url: string }>('/billing/checkout', { plan, period })
      window.location.href = url
    } catch {
      setError(true)
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
          <p className="rounded-2xl bg-mint/20 p-3 text-base font-bold text-[#0E6B55]" role="status">
            {until ? t('plans.current', { plan: t(`plans.name.${user.plan}`), date: until }) : t('plans.currentForever', { plan: t(`plans.name.${user.plan}`) })}
          </p>
        )}

        <div className="flex gap-2 rounded-2xl bg-white p-1.5" role="radiogroup" aria-label={t('plans.period')}>
          {(['year', 'month'] as const).map((p) => (
            <button
              key={p}
              type="button"
              role="radio"
              aria-checked={period === p}
              onClick={() => setPeriod(p)}
              className={`min-h-12 flex-1 rounded-xl text-base font-extrabold transition-colors ${period === p ? 'bg-ink text-white' : 'text-ink/60'}`}
            >
              {t(`plans.${p}`)}
              {p === 'year' && <span className={`ml-1.5 rounded-full px-2 py-0.5 text-xs ${period === p ? 'bg-sun text-ink' : 'bg-sun/40 text-ink'}`}>−{yearlySaving('pro')}%</span>}
            </button>
          ))}
        </div>

        {error && (
          <p role="alert" className="rounded-2xl bg-coral/15 p-3 text-center text-base font-bold text-coral-dark">
            {t('plans.error')}
          </p>
        )}

        {ORDER.map((plan) => {
          const look = LOOK[plan]
          const paid = plan !== 'free'
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
                    {rub(period === 'year' ? yearlyPerMonth(plan) : PRICES[plan].month)}
                    <span className="text-base font-bold opacity-60"> / {t('plans.perMonth')}</span>
                  </p>
                  <p className="text-sm font-semibold opacity-65">
                    {period === 'year' ? t('plans.billedYear', { price: rub(PRICES[plan].year) }) : t('plans.billedMonth')}
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
                    {busy === plan ? t('plans.opening') : t('plans.buy', { price: rub(PRICES[plan][period]) })}
                  </button>
                ) : (
                  <p className="rounded-2xl bg-ink/10 p-3 text-center text-base font-bold opacity-80">{t('plans.soon')}</p>
                ))}
            </section>
          )
        })}

        <section className="rounded-3xl bg-white p-4">
          <h2 className="text-lg font-extrabold">{t('plans.howTitle')}</h2>
          <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-5 text-base leading-relaxed text-ink/75">
            <li>{t('plans.how1')}</li>
            <li>{t('plans.how2')}</li>
            <li>{t('plans.how3')}</li>
          </ul>
          <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-base font-extrabold text-coral-dark">
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
