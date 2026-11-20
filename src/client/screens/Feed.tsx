import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { COMMENT_MAX_LENGTH, POST_MAX_LENGTH, type FeedComment, type FeedFace, type FeedPost } from '../../shared/feed'
import { useAuth } from '../auth/AuthContext'
import Avatar from '../components/Avatar'
import Chai from '../components/Chai'
import SpeakButton from '../components/lesson/SpeakButton'
import { api, ApiError } from '../lib/api'
import { playCorrect, playWrong } from '../lib/sounds'

interface FeedData {
  posts: FeedPost[]
  more: string | null
  canDiscuss: boolean
  freeCommentsLeft: number | null
  activeThisWeek: number
  postsLeft: number
}

type Lang = 'ru' | 'en'
type From = 'all' | 'official' | 'students'
const FILTERS: From[] = ['all', 'official', 'students']

function Faces({ faces, size = 28 }: { faces: FeedFace[]; size?: number }) {
  return (
    <span className="flex -space-x-2">
      {faces.map((face) => (
        <Avatar key={face.userId} userId={face.userId} name={face.name} photoVersion={face.photoVersion} size={size} className="ring-2 ring-card" />
      ))}
    </span>
  )
}

/**
 * What a free student sees where the comments are: that people are talking, who, how many,
 * and a clear way in. The words of the comments never reach their phone; the grey bars are only bars.
 */
function LockedComments({ post, freeLeft, onWrite }: { post: FeedPost; freeLeft: number; onWrite: () => void }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const rows = Math.min(3, Math.max(2, post.comments))
  return (
    <div className="relative overflow-hidden rounded-2xl bg-cream">
      <div className="flex select-none flex-col gap-3 p-4 blur-[5px]" aria-hidden="true">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-start gap-2">
            <span className="h-8 w-8 shrink-0 rounded-full bg-ink/30" />
            <span className="flex flex-1 flex-col gap-1.5 pt-1">
              <span className="h-3 rounded-full bg-ink/40" style={{ width: `${[78, 55, 66][i]}%` }} />
              <span className="h-3 rounded-full bg-ink/25" style={{ width: `${[42, 70, 30][i]}%` }} />
            </span>
          </div>
        ))}
      </div>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-cream/30 p-3 text-center">
        <div className="flex items-center gap-2">
          {post.commenters.length > 0 && <Faces faces={post.commenters} />}
          <p className="text-sm font-extrabold leading-tight">{post.comments > 0 ? t('feed.locked.count', { count: post.comments }) : t('feed.locked.first')}</p>
        </div>
        <button
          type="button"
          onClick={() => navigate('/plans')}
          className="min-h-11 rounded-2xl bg-night px-4 text-sm font-extrabold text-white shadow-[0_4px_0_0_rgb(var(--shade)/0.3)] active:translate-y-1"
        >
          👑 {t(post.comments > 0 ? 'feed.locked.see' : 'feed.locked.join')}
        </button>
        {freeLeft > 0 && (
          <button type="button" onClick={onWrite} className="min-h-9 text-sm font-extrabold text-coral-ink underline">
            {t('feed.locked.tryOne')}
          </button>
        )}
      </div>
    </div>
  )
}

interface ThreadProps {
  post: FeedPost
  canDiscuss: boolean
  freeLeft: number | null
  onCount: (count: number) => void
  onFreeLeft: (left: number | null) => void
}

/** The comments under a post, and the box to write one. */
function Thread({ post, canDiscuss, freeLeft, onCount, onFreeLeft }: ThreadProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [comments, setComments] = useState<FeedComment[] | null>(null)
  const [draft, setDraft] = useState('')
  /** What the AI suggests instead of what the student wrote. */
  const [suggestion, setSuggestion] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reported, setReported] = useState<string[]>([])

  useEffect(() => {
    api<{ comments: FeedComment[] }>(`/feed/${post.id}/comments`)
      .then((data) => setComments(data.comments))
      .catch(() => setComments([]))
  }, [post.id])

  async function send(text: string, confirm: boolean) {
    setBusy(true)
    setError(null)
    try {
      const result = await api<{ suggestion?: string; comment?: FeedComment; freeCommentsLeft?: number | null }>(`/feed/${post.id}/comments`, { text, confirm })
      if (result.suggestion) setSuggestion(result.suggestion)
      else if (result.comment) {
        setComments([...(comments ?? []), result.comment])
        onCount(post.comments + 1)
        onFreeLeft(result.freeCommentsLeft ?? null)
        setDraft('')
        setSuggestion(null)
      }
    } catch (err) {
      const code = err instanceof ApiError ? err.code : 'network'
      if (code === 'pro') navigate('/plans')
      else setError(t(code === 'rejected' ? 'feed.rejected' : code === 'slow_down' ? 'feed.slowDown' : 'feed.failed'))
    } finally {
      setBusy(false)
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    if (draft.trim().length >= 2 && !busy) void send(draft.trim(), false)
  }

  async function remove(id: string) {
    await api(`/feed/comments/${id}/delete`, {}).catch(() => {})
    setComments((comments ?? []).filter((m) => m.id !== id))
    onCount(Math.max(0, post.comments - 1))
  }

  async function report(id: string) {
    setReported([...reported, id])
    await api(`/feed/comments/${id}/report`, {}).catch(() => {})
  }

  const canWrite = canDiscuss || (freeLeft ?? 0) > 0

  return (
    <div className="flex flex-col gap-3">
      {comments?.map((comment) => (
        <div key={comment.id} className="bubble-in flex items-start gap-2">
          <Avatar userId={comment.face.userId} name={comment.face.name} photoVersion={comment.face.photoVersion} size={34} />
          <div className="min-w-0 flex-1 rounded-2xl rounded-tl-md bg-cream px-3 py-2">
            <p className="flex items-baseline justify-between gap-2 text-xs font-extrabold text-ink/55">
              <span className="truncate">{comment.face.name ?? `${t('league.student')} ${comment.face.tag}`}</span>
              {comment.mine ? (
                <button type="button" onClick={() => remove(comment.id)} className="shrink-0 font-bold text-ink/40 underline">
                  {t('feed.delete')}
                </button>
              ) : (
                <button type="button" disabled={reported.includes(comment.id)} onClick={() => report(comment.id)} className="shrink-0 font-bold text-ink/40 underline disabled:no-underline">
                  {reported.includes(comment.id) ? t('feed.reported') : t('feed.report')}
                </button>
              )}
            </p>
            <p className="select-text text-base leading-snug">{comment.text}</p>
          </div>
        </div>
      ))}
      {comments?.length === 0 && canDiscuss && <p className="text-sm font-semibold text-ink/50">{t('feed.beFirst')}</p>}

      {suggestion ? (
        <div className="bubble-in flex flex-col gap-2 rounded-2xl bg-good-soft p-3">
          <p className="text-sm font-extrabold text-good-ink">{t('feed.suggestTitle')}</p>
          <p className="select-text text-base font-bold text-good-ink">{suggestion}</p>
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={() => send(suggestion, true)} className="min-h-11 flex-1 rounded-2xl bg-mint px-3 text-sm font-extrabold text-white shadow-[0_4px_0_0_var(--color-mint-dark)] active:translate-y-1">
              {t('feed.suggestUse')}
            </button>
            <button type="button" disabled={busy} onClick={() => send(draft.trim(), true)} className="min-h-11 flex-1 rounded-2xl bg-card px-3 text-sm font-extrabold text-ink ring-2 ring-inset ring-ink/10 active:translate-y-0.5">
              {t('feed.suggestKeep')}
            </button>
          </div>
        </div>
      ) : (
        canWrite && (
          <form onSubmit={submit} className="flex items-end gap-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value.slice(0, COMMENT_MAX_LENGTH))}
              rows={1}
              lang="en"
              placeholder={t(canDiscuss ? 'feed.write' : 'feed.writeFree')}
              aria-label={t('feed.write')}
              className="min-h-12 flex-1 select-text resize-none rounded-2xl border-2 border-ink/10 bg-card px-3 py-2.5 text-base font-semibold outline-none placeholder:text-ink/35 focus:border-coral"
            />
            <button
              type="submit"
              disabled={busy || draft.trim().length < 2}
              aria-label={t('chat.send')}
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-coral text-xl font-extrabold text-white shadow-[0_4px_0_0_var(--color-coral-dark)] active:translate-y-1 disabled:opacity-50"
            >
              ↑
            </button>
          </form>
        )
      )}
      {error && (
        <p role="alert" className="text-sm font-bold text-bad-ink">
          {error}
        </p>
      )}
    </div>
  )
}

/** Where a paying student writes a post of their own. The AI reads it first, as with comments. */
function Composer({ left, onPosted }: { left: number; onPosted: (post: FeedPost, left: number) => void }) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [draft, setDraft] = useState('')
  const [suggestion, setSuggestion] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function send(text: string, confirm: boolean) {
    setBusy(true)
    setError(null)
    try {
      const result = await api<{ suggestion?: string; post?: FeedPost; postsLeft?: number }>('/feed/posts', { text, confirm })
      if (result.suggestion) setSuggestion(result.suggestion)
      else if (result.post) {
        onPosted(result.post, result.postsLeft ?? 0)
        setDraft('')
        setSuggestion(null)
      }
    } catch (err) {
      const code = err instanceof ApiError ? err.code : 'network'
      setError(t(code === 'rejected' ? 'feed.rejected' : code === 'slow_down' ? 'feed.compose.limit' : 'feed.failed'))
    } finally {
      setBusy(false)
    }
  }

  if (left === 0 && !draft) return <p className="rounded-2xl bg-card p-4 text-sm font-semibold text-ink/55">{t('feed.compose.limit')}</p>

  return (
    <section className="flex flex-col gap-3 rounded-3xl bg-card p-4 shadow-[0_5px_0_0_rgb(var(--shade)/0.07)]">
      <div className="flex items-start gap-2.5">
        {user && <Avatar userId={user.id} name={user.displayName} photoVersion={user.photoVersion} size={40} />}
        <textarea
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value.slice(0, POST_MAX_LENGTH))
            setSuggestion(null)
          }}
          rows={draft.length > 60 || draft.includes('\n') ? 4 : 2}
          lang="en"
          placeholder={t('feed.compose.placeholder')}
          aria-label={t('feed.compose.placeholder')}
          className="min-h-12 flex-1 select-text resize-none rounded-2xl border-2 border-ink/10 bg-cream px-3 py-2.5 text-base font-semibold outline-none placeholder:text-ink/35 focus:border-coral"
        />
      </div>
      {suggestion ? (
        <div className="bubble-in flex flex-col gap-2 rounded-2xl bg-good-soft p-3">
          <p className="text-sm font-extrabold text-good-ink">{t('feed.suggestTitle')}</p>
          <p className="select-text whitespace-pre-line text-base font-bold text-good-ink">{suggestion}</p>
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={() => send(suggestion, true)} className="min-h-11 flex-1 rounded-2xl bg-mint px-3 text-sm font-extrabold text-white shadow-[0_4px_0_0_var(--color-mint-dark)] active:translate-y-1">
              {t('feed.suggestUse')}
            </button>
            <button type="button" disabled={busy} onClick={() => send(draft.trim(), true)} className="min-h-11 flex-1 rounded-2xl bg-card px-3 text-sm font-extrabold text-ink ring-2 ring-inset ring-ink/10 active:translate-y-0.5">
              {t('feed.suggestKeep')}
            </button>
          </div>
        </div>
      ) : (
        draft.trim().length > 0 && (
          <div className="flex items-center gap-3">
            <p className="min-w-0 flex-1 text-xs font-semibold leading-snug text-ink/45">{t('feed.compose.hint')}</p>
            <span className="text-xs font-bold tabular-nums text-ink/35">
              {draft.length}/{POST_MAX_LENGTH}
            </span>
            <button
              type="button"
              disabled={busy || draft.trim().length < 5}
              onClick={() => send(draft.trim(), false)}
              className="min-h-11 shrink-0 rounded-2xl bg-coral px-4 text-sm font-extrabold text-white shadow-[0_4px_0_0_var(--color-coral-dark)] active:translate-y-1 disabled:opacity-50"
            >
              {t('feed.compose.post')}
            </button>
          </div>
        )
      )}
      {error && (
        <p role="alert" className="text-sm font-bold text-bad-ink">
          {error}
        </p>
      )}
    </section>
  )
}

/** A student's post as a free student sees it: who wrote it, never the words. The grey bars are only bars. */
function LockedPost({ post }: { post: FeedPost }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const name = post.author?.name ?? `${t('feed.lockedPost.someone')} ${post.author?.tag ?? ''}`
  return (
    <article className="flex flex-col gap-3 rounded-3xl bg-card p-4 shadow-[0_5px_0_0_rgb(var(--shade)/0.07)]">
      <header className="flex items-center gap-2.5">
        {post.author && <Avatar userId={post.author.userId} name={post.author.name} photoVersion={post.author.photoVersion} size={44} />}
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-base font-extrabold">{name}</p>
          <p className="text-xs font-bold text-ink/45">{t('feed.kinds.student')}</p>
        </div>
        <span className="flex items-center gap-2 text-xs font-extrabold text-ink/45">
          <span>♥ {post.likes}</span>
          <span>💬 {post.comments}</span>
        </span>
      </header>
      <div className="relative overflow-hidden rounded-2xl bg-cream">
        <div className="flex select-none flex-col gap-2 p-4 blur-[5px]" aria-hidden="true">
          {[92, 78, 85, 40].map((width, i) => (
            <span key={i} className="h-3 rounded-full bg-ink/35" style={{ width: `${width}%` }} />
          ))}
        </div>
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-cream/30 p-3 text-center">
          <p className="text-sm font-extrabold leading-tight">{t('feed.lockedPost.text')}</p>
          <button
            type="button"
            onClick={() => navigate('/plans')}
            className="min-h-11 rounded-2xl bg-night px-4 text-sm font-extrabold text-white shadow-[0_4px_0_0_rgb(var(--shade)/0.3)] active:translate-y-1"
          >
            👑 {t('feed.lockedPost.see')}
          </button>
        </div>
      </div>
    </article>
  )
}

interface CardProps {
  post: FeedPost
  onRemoved: (id: string) => void
  lang: Lang
  canDiscuss: boolean
  freeLeft: number | null
  onChange: (post: FeedPost) => void
  onFreeLeft: (left: number | null) => void
}

function PostCard({ post, lang, canDiscuss, freeLeft, onChange, onFreeLeft, onRemoved }: CardProps) {
  const { t, i18n } = useTranslation()
  const { refresh } = useAuth()
  const [open, setOpen] = useState(false)
  const [gained, setGained] = useState(0)
  const [reported, setReported] = useState(false)
  const { body } = post

  async function remove() {
    if (!window.confirm(t('feed.deletePost'))) return
    await api(`/feed/posts/${post.id}/delete`, {}).catch(() => {})
    onRemoved(post.id)
  }

  async function report() {
    setReported(true)
    await api(`/feed/posts/${post.id}/report`, {}).catch(() => {})
  }
  const when = new Intl.DateTimeFormat(i18n.language === 'en' ? 'en-GB' : 'ru-RU', { day: 'numeric', month: 'long' }).format(new Date(post.publishedAt))

  async function like() {
    // Shown at once; put right if the server disagrees.
    onChange({ ...post, liked: !post.liked, likes: post.likes + (post.liked ? -1 : 1) })
    const result = await api<{ liked: boolean; likes: number }>(`/feed/${post.id}/like`, {}).catch(() => null)
    if (result) onChange({ ...post, ...result })
  }

  async function vote(choice: number) {
    const result = await api<{ vote: number; answer: number | null; explanation: FeedPost['body']['explanation'] | null; votes: number[]; xp: number }>(`/feed/${post.id}/vote`, {
      choice,
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }).catch(() => null)
    if (!result) return
    if (result.vote === result.answer) playCorrect()
    else playWrong()
    setGained(result.xp)
    onChange({ ...post, vote: result.vote, votes: result.votes, body: { ...body, answer: result.answer ?? undefined, explanation: result.explanation ?? undefined } })
    if (result.xp > 0) void refresh()
  }

  const answered = post.vote !== null
  const totalVotes = (post.votes ?? []).reduce((sum, n) => sum + n, 0)

  return (
    <article className="flex flex-col gap-3 rounded-3xl bg-card p-4 shadow-[0_5px_0_0_rgb(var(--shade)/0.07)]">
      {post.author ? (
        <header className="flex items-center gap-2.5">
          <Avatar userId={post.author.userId} name={post.author.name} photoVersion={post.author.photoVersion} size={44} />
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-base font-extrabold">{post.author.name ?? `${t('league.student')} ${post.author.tag}`}</p>
            <p className="text-xs font-bold text-ink/45">{when}</p>
          </div>
          {post.mine ? (
            <button type="button" onClick={remove} className="min-h-9 shrink-0 text-xs font-bold text-ink/40 underline">
              {t('feed.delete')}
            </button>
          ) : (
            <button type="button" disabled={reported} onClick={report} className="min-h-9 shrink-0 text-xs font-bold text-ink/40 underline disabled:no-underline">
              {reported ? t('feed.reported') : t('feed.report')}
            </button>
          )}
        </header>
      ) : (
        <header className="flex items-center gap-2.5">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-cream">
            <Chai size={44} />
          </span>
          <div className="min-w-0 flex-1 leading-tight">
            <p className="flex items-center gap-1 text-base font-extrabold">
              Talkreal
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#3D9BFF] text-[10px] text-white" aria-label={t('feed.official')}>
                ✓
              </span>
            </p>
            <p className="text-xs font-bold text-ink/45">
              {when} · {t(`feed.kinds.${post.kind}`)}
            </p>
          </div>
          <span className="text-2xl" aria-hidden="true">
            {body.emoji}
          </span>
        </header>
      )}

      {body.title[lang] && <h2 className="text-xl font-extrabold leading-tight">{body.title[lang]}</h2>}

      {body.english && (
        <p className="flex items-center gap-2 rounded-2xl bg-coral/10 px-4 py-3 text-lg font-extrabold leading-snug text-coral-ink">
          <span className="min-w-0 flex-1 select-text">{body.english}</span>
          <SpeakButton text={body.english.replace(/_+/g, ' ')} />
        </p>
      )}

      <p className={`select-text whitespace-pre-line leading-snug ${post.author ? 'text-lg text-ink' : 'text-base text-ink/80'}`}>{body.text[lang]}</p>

      {post.hasImage && <img src={`/api/feed/${post.id}/image`} alt="" loading="lazy" className="aspect-square w-full rounded-2xl bg-cream object-cover" />}

      {post.kind === 'poll' && body.options && (
        <div className="flex flex-col gap-2">
          {body.options.map((option, i) => {
            const right = answered && i === body.answer
            const mine = post.vote === i
            const share = answered && totalVotes > 0 ? Math.round(((post.votes?.[i] ?? 0) / totalVotes) * 100) : 0
            return (
              <button
                key={option}
                type="button"
                disabled={answered}
                onClick={() => vote(i)}
                className={`relative min-h-12 overflow-hidden rounded-2xl border-2 px-4 py-2.5 text-left text-base font-bold active:translate-y-0.5 ${
                  right ? 'border-mint bg-mint/10' : mine ? 'border-bad bg-bad/10 text-bad-ink' : 'border-ink/10 bg-card'
                }`}
              >
                {answered && <span className={`absolute inset-y-0 left-0 ${right ? 'bg-mint/25' : 'bg-ink/5'}`} style={{ width: `${share}%` }} aria-hidden="true" />}
                <span className="relative flex items-center justify-between gap-3">
                  <span>
                    {right && '✓ '}
                    {mine && !right && '✕ '}
                    {option}
                  </span>
                  {answered && <span className="text-sm font-extrabold tabular-nums text-ink/55">{share}%</span>}
                </span>
              </button>
            )
          })}
          {answered && body.explanation && <p className="bubble-in select-text rounded-2xl bg-good-soft px-4 py-3 text-base leading-snug text-good-ink">{body.explanation[lang]}</p>}
          {gained > 0 && <p className="pop-in text-sm font-extrabold text-good-ink">+{gained} XP</p>}
        </div>
      )}

      <footer className="flex items-center gap-2 border-t border-ink/5 pt-3">
        <button
          type="button"
          onClick={like}
          aria-pressed={post.liked}
          aria-label={t('feed.like')}
          className={`flex min-h-10 items-center gap-1.5 rounded-full px-3 text-sm font-extrabold active:scale-95 ${post.liked ? 'bg-bad/15 text-bad-ink' : 'bg-ink/5 text-ink/60'}`}
        >
          <span aria-hidden="true">{post.liked ? '♥' : '♡'}</span>
          {post.likes}
        </button>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          className={`flex min-h-10 items-center gap-1.5 rounded-full px-3 text-sm font-extrabold active:scale-95 ${open ? 'bg-night text-white' : 'bg-ink/5 text-ink/60'}`}
        >
          <span aria-hidden="true">💬</span>
          {post.comments}
        </button>
        {!open && post.commenters.length > 0 && (
          <button type="button" onClick={() => setOpen(true)} className="ml-auto flex items-center gap-2 text-xs font-bold text-ink/50">
            <Faces faces={post.commenters} size={24} />
            {t('feed.talking', { count: post.comments })}
          </button>
        )}
      </footer>

      {/* A free student always sees the locked conversation: it is the reason to upgrade. */}
      {!canDiscuss && !open && <LockedComments post={post} freeLeft={freeLeft ?? 0} onWrite={() => setOpen(true)} />}
      {open && (
        <Thread
          post={post}
          canDiscuss={canDiscuss}
          freeLeft={freeLeft}
          onCount={(comments) => onChange({ ...post, comments })}
          onFreeLeft={onFreeLeft}
        />
      )}
      {open && !canDiscuss && <LockedComments post={post} freeLeft={0} onWrite={() => {}} />}
    </article>
  )
}

/** Feed tab: the Talkreal account's daily posts, and the conversation under them. */
export default function Feed() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const lang: Lang = i18n.language === 'en' ? 'en' : 'ru'
  const [data, setData] = useState<FeedData | null>(null)
  const [failed, setFailed] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [from, setFrom] = useState<From>('all')

  useEffect(() => {
    api<FeedData>(`/feed?from=${from}`)
      .then(setData)
      .catch(() => setFailed(true))
  }, [from])

  if (!data) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <Chai size={110} />
        {failed && <p className="text-base font-bold text-ink/60">{t('login.errors.network')}</p>}
      </div>
    )
  }

  async function more() {
    if (!data?.more) return
    setLoadingMore(true)
    const next = await api<FeedData>(`/feed?from=${from}&before=${encodeURIComponent(data.more)}`).catch(() => null)
    if (next) setData({ ...data, posts: [...data.posts, ...next.posts], more: next.more })
    setLoadingMore(false)
  }

  const update = (post: FeedPost) => setData({ ...data, posts: data.posts.map((p) => (p.id === post.id ? post : p)) })

  return (
    <div className="flex flex-col gap-4">
      <header className="pt-1">
        <h1 className="text-3xl font-extrabold">{t('feed.title')}</h1>
        <p className="mt-1 text-base text-ink/65">{t('feed.subtitle')}</p>
      </header>

      {!data.canDiscuss && (
        <button
          type="button"
          onClick={() => navigate('/plans')}
          className="relative overflow-hidden rounded-3xl bg-night p-4 text-left text-white shadow-[0_6px_0_0_rgb(var(--shade)/0.25)] active:translate-y-1"
        >
          <span className="float-slow absolute -right-4 -top-6 h-24 w-24 rounded-full bg-white/10" aria-hidden="true" />
          <p className="text-xs font-extrabold uppercase tracking-wide text-sun">{t('feed.banner.over')}</p>
          <p className="mt-1 text-lg font-extrabold leading-tight">{data.activeThisWeek > 0 ? t('feed.banner.active', { count: data.activeThisWeek }) : t('feed.banner.empty')}</p>
          <p className="mt-1 text-sm font-semibold text-white/75">{t('feed.banner.text')}</p>
          <span className="mt-3 inline-flex min-h-10 items-center rounded-2xl bg-sun px-4 text-sm font-extrabold text-coal">👑 {t('feed.banner.button')}</span>
        </button>
      )}

      <div className="flex gap-1.5 rounded-2xl bg-card p-1.5">
        {FILTERS.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setFrom(value)}
            aria-pressed={from === value}
            className={`min-h-10 flex-1 rounded-xl text-sm font-extrabold transition-colors ${from === value ? 'bg-coral text-white' : 'text-ink/60'}`}
          >
            {t(`feed.filter.${value}`)}
          </button>
        ))}
      </div>

      {data.canDiscuss ? (
        from !== 'official' && <Composer left={data.postsLeft} onPosted={(post, left) => setData({ ...data, posts: [post, ...data.posts], postsLeft: left })} />
      ) : (
        from === 'students' && (
          <button type="button" onClick={() => navigate('/plans')} className="flex items-center gap-3 rounded-3xl bg-violet-soft p-4 text-left active:translate-y-0.5">
            <span className="text-3xl" aria-hidden="true">
              ✍️
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-base font-extrabold leading-tight">{t('feed.compose.lockedTitle')}</span>
              <span className="block text-sm font-semibold leading-snug text-ink/60">{t('feed.compose.lockedText')}</span>
            </span>
            <span className="text-xl" aria-hidden="true">
              👑
            </span>
          </button>
        )
      )}

      {data.posts.length === 0 && <p className="rounded-2xl bg-card p-4 text-base text-ink/65">{t(from === 'students' ? 'feed.noStudents' : 'feed.empty')}</p>}

      {data.posts.map((post) =>
        post.locked ? (
          <LockedPost key={post.id} post={post} />
        ) : (
        <PostCard
          key={post.id}
          post={post}
          onRemoved={(id) => setData({ ...data, posts: data.posts.filter((p) => p.id !== id) })}
          lang={lang}
          canDiscuss={data.canDiscuss}
          freeLeft={data.freeCommentsLeft}
          onChange={update}
          onFreeLeft={(left) => setData((current) => (current ? { ...current, freeCommentsLeft: left } : current))}
        />
        ),
      )}

      {data.more && (
        <button type="button" onClick={more} disabled={loadingMore} className="min-h-12 rounded-2xl bg-card text-base font-extrabold text-ink/70 shadow-[0_4px_0_0_rgb(var(--shade)/0.06)] active:translate-y-0.5">
          {t('feed.more')}
        </button>
      )}
    </div>
  )
}
