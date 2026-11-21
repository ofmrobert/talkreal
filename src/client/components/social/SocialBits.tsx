import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import type { FeedFace } from '../../../shared/feed'
import { INTERESTS } from '../../../shared/profile'
import { REPORT_REASONS, type Person, type ReportReason } from '../../../shared/social'
import { api } from '../../lib/api'
import Avatar from '../Avatar'
import Verified, { OwnerTag } from '../Verified'

/** A student's name for others: the one they show, or "Student" and their short code. */
export function useFaceName() {
  const { t } = useTranslation()
  return (face: FeedFace) => face.name ?? `${t('league.student')} ${face.tag}`
}

/** The round back arrow at the top of the community screens. */
export function BackButton({ to }: { to?: string }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  return (
    <button
      type="button"
      onClick={() => (to ? navigate(to) : navigate(-1))}
      aria-label={t('social.back')}
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-card text-xl font-extrabold text-ink/60 active:translate-y-0.5"
    >
      ←
    </button>
  )
}

/** Follows or unfollows at once, and puts it right if the server disagrees. */
export function FollowButton({ userId, following, onChange, wide = false }: { userId: string; following: boolean; onChange: (following: boolean) => void; wide?: boolean }) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)
  async function toggle() {
    setBusy(true)
    onChange(!following)
    const result = await api<{ following: boolean }>(`/social/people/${userId}/follow`, { on: !following }).catch(() => null)
    onChange(result ? result.following : following)
    setBusy(false)
  }
  return (
    <button
      type="button"
      disabled={busy}
      onClick={(e) => {
        e.stopPropagation()
        void toggle()
      }}
      aria-pressed={following}
      className={`min-h-11 shrink-0 rounded-2xl px-4 text-sm font-extrabold active:translate-y-0.5 ${wide ? 'flex-1' : ''} ${
        following ? 'bg-card text-ink/60 ring-2 ring-inset ring-ink/10' : 'bg-coral text-white shadow-[0_4px_0_0_var(--color-coral-dark)]'
      }`}
    >
      {following ? `✓ ${t('social.following')}` : t('social.follow')}
    </button>
  )
}

/** One student in a list: who they are, what you share, and a way to follow them. */
export function PersonCard({ person, onChange }: { person: Person; onChange: (person: Person) => void }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const nameOf = useFaceName()
  const { face } = person
  return (
    <article
      onClick={() => navigate(`/u/${face.userId}`)}
      className="flex cursor-pointer flex-col gap-3 rounded-3xl bg-card p-4 shadow-[0_5px_0_0_rgb(var(--shade)/0.07)] active:translate-y-0.5"
    >
      <div className="flex items-center gap-3">
        <Avatar userId={face.userId} name={face.name} photoVersion={face.photoVersion} size={52} />
        <div className="min-w-0 flex-1 leading-tight">
          <p className="flex items-center gap-1 text-base font-extrabold">
            <span className="truncate">{nameOf(face)}</span>
            {face.teacher && <Verified owner={face.owner} />}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs font-extrabold text-ink/55">
            {face.owner ? <OwnerTag small /> : face.teacher && <span className="rounded-full bg-[#3D9BFF] px-2 py-0.5 text-white">{t('feed.teacher')}</span>}
            {person.level && <span className="rounded-full bg-coral px-2 py-0.5 text-white">{person.level}</span>}
            {person.streak > 0 && <span>🔥 {person.streak}</span>}
            {person.city && <span className="truncate">📍 {person.city}</span>}
          </p>
        </div>
        <FollowButton userId={face.userId} following={person.following} onChange={(following) => onChange({ ...person, following })} />
      </div>
      {person.bio && <p className="line-clamp-2 text-sm font-semibold leading-snug text-ink/70">{person.bio}</p>}
      {(person.interests.length > 0 || person.followsYou) && (
        <p className="flex flex-wrap items-center gap-1.5 text-xs font-extrabold">
          {person.followsYou && <span className="rounded-full bg-violet-soft px-2.5 py-1 text-violet-ink">{t('social.followsYou')}</span>}
          {person.common > 0 && <span className="rounded-full bg-good-soft px-2.5 py-1 text-good-ink">{t('social.common', { count: person.common })}</span>}
          {person.interests.slice(0, 5).map((id) => (
            <span key={id} className="rounded-full bg-cream px-2.5 py-1 text-ink/65">
              {INTERESTS.find((i) => i.id === id)?.icon} {t(`interests.${id}`)}
            </span>
          ))}
        </p>
      )}
    </article>
  )
}

/** Blocking and reporting a student, behind a small "more" button. */
export function SafetyMenu({ userId, blocked, onBlocked }: { userId: string; blocked: boolean; onBlocked: (blocked: boolean) => void }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState<'closed' | 'menu' | 'report' | 'sent'>('closed')
  const [note, setNote] = useState('')

  async function block() {
    if (!blocked && !window.confirm(t('social.blockConfirm'))) return
    const result = await api<{ blocked: boolean }>(`/social/people/${userId}/block`, { on: !blocked }).catch(() => null)
    if (result) onBlocked(result.blocked)
    setOpen('closed')
  }
  async function report(reason: ReportReason) {
    await api(`/social/people/${userId}/report`, { reason, note }).catch(() => {})
    setOpen('sent')
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen('menu')}
        aria-label={t('social.more')}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-card text-xl font-extrabold text-ink/60 active:translate-y-0.5"
      >
        ⋯
      </button>
      {open !== 'closed' && (
        <div className="fixed inset-0 z-30 flex items-end justify-center bg-coal/50 p-3" onClick={() => setOpen('closed')}>
          <div className="pop-in flex w-full max-w-md flex-col gap-2 rounded-3xl bg-card p-4" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            {open === 'menu' && (
              <>
                <button type="button" onClick={() => setOpen('report')} className="min-h-12 rounded-2xl bg-cream px-4 text-left text-base font-extrabold active:translate-y-0.5">
                  🚩 {t('social.report')}
                </button>
                <button type="button" onClick={block} className="min-h-12 rounded-2xl bg-cream px-4 text-left text-base font-extrabold text-bad-ink active:translate-y-0.5">
                  🚫 {t(blocked ? 'social.unblock' : 'social.block')}
                </button>
              </>
            )}
            {open === 'report' && (
              <>
                <p className="text-lg font-extrabold">{t('social.reportTitle')}</p>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value.slice(0, 300))}
                  rows={2}
                  placeholder={t('social.reportNote')}
                  className="select-text resize-none rounded-2xl border-2 border-ink/10 bg-cream px-3 py-2.5 text-base font-semibold outline-none placeholder:text-ink/35 focus:border-coral"
                />
                {REPORT_REASONS.map((reason) => (
                  <button key={reason} type="button" onClick={() => report(reason)} className="min-h-11 rounded-2xl bg-cream px-4 text-left text-base font-bold active:translate-y-0.5">
                    {t(`social.reasons.${reason}`)}
                  </button>
                ))}
              </>
            )}
            {open === 'sent' && <p className="p-2 text-base font-bold">{t('social.reportSent')}</p>}
            <button type="button" onClick={() => setOpen('closed')} className="min-h-11 text-sm font-extrabold text-ink/50">
              {t('social.close')}
            </button>
          </div>
        </div>
      )}
    </>
  )
}

/** The rules for private messages. They are accepted once, with the student confirming they are an adult. */
export function MessagingRules({ onAccepted }: { onAccepted: () => void }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [adult, setAdult] = useState(false)
  const [busy, setBusy] = useState(false)
  async function accept() {
    setBusy(true)
    const ok = await api('/social/messages/rules', { adult: true }).then(
      () => true,
      () => false,
    )
    setBusy(false)
    if (ok) onAccepted()
  }
  return (
    <section className="flex flex-col gap-3 rounded-3xl bg-card p-5 shadow-[0_5px_0_0_rgb(var(--shade)/0.07)]">
      <h2 className="text-xl font-extrabold leading-tight">🤝 {t('social.rules.title')}</h2>
      <ul className="flex flex-col gap-2.5">
        {(['english', 'kind', 'contacts', 'checked', 'report'] as const).map((key) => (
          <li key={key} className="flex gap-2.5 text-base font-semibold leading-snug text-ink/80">
            <span aria-hidden="true">{{ english: '💬', kind: '💛', contacts: '🔒', checked: '🛡️', report: '🚩' }[key]}</span>
            <span>{t(`social.rules.${key}`)}</span>
          </li>
        ))}
      </ul>
      <label className="flex items-start gap-3 rounded-2xl bg-cream p-3 text-base font-bold leading-snug">
        <input type="checkbox" checked={adult} onChange={(e) => setAdult(e.target.checked)} className="mt-0.5 h-6 w-6 shrink-0 accent-[var(--color-coral)]" />
        <span>{t('social.rules.adult')}</span>
      </label>
      <button
        type="button"
        disabled={!adult || busy}
        onClick={accept}
        className="min-h-12 rounded-2xl bg-coral px-4 text-base font-extrabold text-white shadow-[0_4px_0_0_var(--color-coral-dark)] active:translate-y-1 disabled:opacity-50"
      >
        {t('social.rules.accept')}
      </button>
      <button type="button" onClick={() => navigate('/privacy')} className="min-h-9 text-sm font-bold text-ink/50 underline">
        {t('social.rules.policy')}
      </button>
    </section>
  )
}
