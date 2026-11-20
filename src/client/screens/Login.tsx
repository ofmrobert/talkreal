import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, Navigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../auth/AuthContext'
import Chai from '../components/Chai'
import TelegramLogin from '../components/TelegramLogin'
import Button from '../components/ui/Button'
import { api, ApiError } from '../lib/api'
import { load, save } from '../lib/storage'

const inputClass =
  'min-h-14 w-full rounded-2xl border-2 border-ink/10 bg-white px-4 text-lg font-bold text-ink outline-none select-text focus:border-coral'

/** A code is valid for ten minutes; a login that was started is remembered a little less long. */
const PENDING_MS = 9 * 60 * 1000

/**
 * The email a code was sent to, if that was a moment ago. On a phone the student leaves the app
 * to read the email, and the phone may reload the page: they must come back to the code screen.
 */
function pendingEmail(): string {
  try {
    const pending = JSON.parse(load('pendingLogin') ?? 'null')
    return pending && Date.now() - pending.at < PENDING_MS ? String(pending.email) : ''
  } catch {
    return ''
  }
}

/** Email → 6-digit code → logged in. New emails get an account automatically. */
export default function Login() {
  const { t, i18n } = useTranslation()
  const { user, refresh } = useAuth()

  const [email, setEmail] = useState(pendingEmail)
  const [step, setStep] = useState<'email' | 'code'>(() => (pendingEmail() ? 'code' : 'email'))
  const [code, setCode] = useState('')
  const [devCode, setDevCode] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [resendIn, setResendIn] = useState(0)
  // Agreement to the privacy policy. Remembered on this phone so returning students tick it once.
  const [consent, setConsent] = useState(() => load('consent') === '1')
  /** True while a code is being checked, so the same code is never sent twice at once. */
  const verifying = useRef(false)

  useEffect(() => {
    if (resendIn <= 0) return
    const timer = setTimeout(() => setResendIn(resendIn - 1), 1000)
    return () => clearTimeout(timer)
  }, [resendIn])

  // Hooks must all run before the early return below.
  const onTelegramError = useCallback(
    (code: string) => setError(t(`login.errors.${code}`)),
    [t],
  )

  if (user) return <Navigate to="/" replace />

  function showError(err: unknown) {
    const apiError = err instanceof ApiError ? err : null
    if (apiError?.retryAfter) setResendIn(apiError.retryAfter)
    const key = `login.errors.${apiError?.code ?? 'server_error'}`
    setError(i18n.exists(key) ? t(key) : t('login.errors.server_error'))
  }

  async function requestCode() {
    setBusy(true)
    setError(null)
    try {
      const res = await api<{ devCode?: string }>('/auth/request-code', { email, lang: i18n.language })
      setDevCode(res.devCode ?? null)
      setCode('')
      setStep('code')
      setResendIn(60)
      save('pendingLogin', JSON.stringify({ email, at: Date.now() }))
    } catch (err) {
      // "wait" means a code was sent less than a minute ago: let the student enter it.
      if (err instanceof ApiError && err.code === 'wait') {
        setStep('code')
        save('pendingLogin', JSON.stringify({ email, at: Date.now() }))
      }
      showError(err)
    } finally {
      setBusy(false)
    }
  }

  async function verify(value: string) {
    if (verifying.current) return
    verifying.current = true
    setBusy(true)
    setError(null)
    try {
      await api('/auth/verify', { email, code: value, lang: i18n.language, consent })
      save('pendingLogin', 'null')
      // The login is kept in a cookie. If the browser refused it, say so instead of showing this screen again.
      const kept = await api('/me').then(
        () => true,
        (err) => !(err instanceof ApiError && err.status === 401),
      )
      if (kept) await refresh()
      else setError(t('login.errors.cookies'))
    } catch (err) {
      setCode('')
      // A new account needs the privacy tick, which is on the first screen.
      if (err instanceof ApiError && err.code === 'consent_required') setStep('email')
      showError(err)
    } finally {
      verifying.current = false
      setBusy(false)
    }
  }

  function onCodeChange(raw: string) {
    const digits = raw.replace(/\D/g, '').slice(0, 6)
    setCode(digits)
    if (digits.length === 6 && !busy) verify(digits)
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    if (step === 'email') requestCode()
    else if (code.length === 6) verify(code)
  }

  return (
    <div className="safe-screen mx-auto flex h-full max-w-md flex-col">
      <form onSubmit={onSubmit} className="slide-in flex flex-1 flex-col gap-5 overflow-y-auto pt-6 pb-2" key={step}>
        <div className="flex justify-center">
          <Chai size={120} />
        </div>

        {step === 'email' ? (
          <>
            <div className="text-center">
              <h1 className="text-3xl font-extrabold leading-tight">{t('login.title')}</h1>
              <p className="mt-2 text-lg text-ink/70">{t('login.subtitle')}</p>
            </div>
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect="off"
              placeholder="you@example.com"
              aria-label={t('login.emailLabel')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
              required
            />
            <label className="flex items-start gap-3 rounded-2xl bg-white/70 p-3">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => {
                  setConsent(e.target.checked)
                  save('consent', e.target.checked ? '1' : '0')
                }}
                className="mt-0.5 h-6 w-6 shrink-0 accent-coral"
              />
              <span className="text-sm font-semibold leading-snug text-ink/70">
                {t('login.consent')}{' '}
                <Link to="/privacy" className="font-extrabold text-coral-dark underline">
                  {t('login.consentLink')}
                </Link>
              </span>
            </label>
            <TelegramLogin onError={onTelegramError} consent={consent} />
          </>
        ) : (
          <>
            <div className="text-center">
              <h1 className="text-3xl font-extrabold leading-tight">{t('login.codeTitle')}</h1>
              <p className="mt-2 text-lg text-ink/70">
                {t('login.codeSubtitle')} <span className="font-bold text-ink">{email}</span>
              </p>
            </div>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6}"
              maxLength={6}
              placeholder="••••••"
              aria-label={t('login.codeLabel')}
              value={code}
              onChange={(e) => onCodeChange(e.target.value)}
              className={`${inputClass} text-center text-3xl tracking-[0.4em]`}
              autoFocus
            />
            {devCode && (
              <p className="rounded-2xl bg-sun/30 p-3 text-center text-base font-bold">
                {t('login.devCode')} <span className="text-xl tracking-widest">{devCode}</span>
              </p>
            )}
          </>
        )}

        {error && (
          <p role="alert" className="rounded-2xl bg-coral/15 p-3 text-center text-base font-bold text-coral-dark">
            {error}
          </p>
        )}

        <div className="mt-auto flex flex-col gap-3">
          {step === 'code' && (
            <>
              <Button type="button" variant="ghost" disabled={busy || resendIn > 0} onClick={requestCode}>
                {resendIn > 0 ? t('login.resendIn', { seconds: resendIn }) : t('login.resend')}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setStep('email')
                  setError(null)
                  save('pendingLogin', 'null')
                }}
              >
                {t('login.changeEmail')}
              </Button>
            </>
          )}
          <Button type="submit" disabled={busy || (step === 'email' && !consent) || (step === 'code' && code.length < 6)}>
            {step === 'email' ? t('login.getCode') : t('login.enter')}
          </Button>
          {step === 'email' && (
            <p className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-sm font-bold text-ink/50">
              <Link to="/plans" className="underline">
                {t('plans.title')}
              </Link>
              <Link to="/offer" className="underline">
                {t('plans.offer')}
              </Link>
              <Link to="/privacy" className="underline">
                {t('privacy.link')}
              </Link>
            </p>
          )}
        </div>
      </form>
    </div>
  )
}
