import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../auth/AuthContext'
import Chai from '../components/Chai'
import Button from '../components/ui/Button'
import { api } from '../lib/api'
import { playComplete } from '../lib/sounds'

interface PaymentState {
  status: 'pending' | 'paid' | 'canceled'
  plan: string
  activePlan: string
  planUntil: string | null
}

/** The bank can take a few seconds to confirm: the app asks this often, this many times. */
const POLL_MS = 2500
const POLLS = 16

const CONFETTI = ['#FF6B4A', '#FFC53D', '#2EC4A0', '#7C5CFF', '#FF6B4A', '#FFC53D', '#2EC4A0', '#7C5CFF', '#FF6B4A', '#FFC53D', '#2EC4A0', '#7C5CFF']

/** Where the student lands after the payment page: paid, still being confirmed, or not paid. */
export default function BillingReturn() {
  const [query] = useSearchParams()
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { refresh } = useAuth()
  const id = query.get('payment')
  const [state, setState] = useState<PaymentState | null>(null)
  const [waiting, setWaiting] = useState(true)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function check(attempt = 0) {
    setWaiting(true)
    api<PaymentState>(`/billing/payments/${id}`)
      .then((payment) => {
        setState(payment)
        if (payment.status === 'pending' && attempt < POLLS) {
          timer.current = setTimeout(() => check(attempt + 1), POLL_MS)
          return
        }
        setWaiting(false)
        if (payment.status === 'paid') {
          playComplete()
          void refresh()
        }
      })
      .catch(() => {
        setState(null)
        setWaiting(false)
      })
  }

  useEffect(() => {
    if (id) check()
    else setWaiting(false)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const paid = state?.status === 'paid'
  const until = state?.planUntil
    ? new Intl.DateTimeFormat(i18n.language === 'en' ? 'en-GB' : 'ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(state.planUntil)).replace(/\s*г\.$/, '')
    : ''
  const title = waiting ? t('billing.checkingTitle') : paid ? t('billing.paidTitle', { plan: t(`plans.name.${state.plan}`) }) : state?.status === 'pending' ? t('billing.pendingTitle') : t('billing.failedTitle')
  const text = waiting ? t('billing.checkingText') : paid ? t('billing.paidText', { date: until }) : state?.status === 'pending' ? t('billing.pendingText') : t('billing.failedText')

  return (
    <div className="safe-screen relative mx-auto flex h-full max-w-md flex-col overflow-hidden">
      {paid && !waiting && (
        <div className="pointer-events-none absolute inset-x-0 top-0 h-0" aria-hidden="true">
          {CONFETTI.map((color, i) => (
            <span key={i} className="confetti" style={{ left: `${4 + i * 8}%`, backgroundColor: color, animationDelay: `${(i % 6) * 0.12}s` }} />
          ))}
        </div>
      )}
      <div className="slide-in flex flex-1 flex-col items-center justify-center gap-5 text-center" role="status">
        <span className={waiting ? 'pulse-soft rounded-full' : ''}>
          <Chai size={150} mood={paid ? 'excited' : 'happy'} />
        </span>
        <div>
          <h1 className="text-3xl font-extrabold leading-tight">{title}</h1>
          <p className="mt-2 text-lg text-ink/65">{text}</p>
        </div>
      </div>
      {!waiting && (
        <div className="flex flex-col gap-2">
          {paid ? (
            <Button onClick={() => navigate('/', { replace: true })}>{t('billing.start')}</Button>
          ) : (
            <>
              {state?.status === 'pending' ? <Button onClick={() => check()}>{t('billing.checkAgain')}</Button> : <Button onClick={() => navigate('/plans', { replace: true })}>{t('billing.tryAgain')}</Button>}
              <Button variant="ghost" onClick={() => navigate('/', { replace: true })}>
                {t('lesson.backToCourse')}
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
