import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useFeedNews } from '../../lib/feedNews'
import Avatar from '../Avatar'

/**
 * On the Learn tab: what is happening in the feed right now. The weekly challenge if one is
 * running and the student has not answered it, otherwise today's post. One tap opens the feed.
 */
export default function FeedCard() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const news = useFeedNews()
  if (!news || (!news.challenge && !news.latest)) return null
  const lang = i18n.language === 'en' ? 'en' : 'ru'

  const challenge = news.challenge && !news.challenge.answered ? news.challenge : null
  const hours = challenge ? Math.max(1, Math.ceil((new Date(challenge.endsAt).getTime() - Date.now()) / 3_600_000)) : 0
  const left = hours >= 24 ? t('feed.challenge.daysLeft', { count: Math.ceil(hours / 24) }) : t('feed.challenge.hoursLeft', { count: hours })
  const post = challenge ?? news.latest!

  return (
    <button
      type="button"
      onClick={() => navigate('/feed')}
      className="flex flex-col gap-3 rounded-3xl bg-card p-4 text-left shadow-[0_5px_0_0_rgb(var(--shade)/0.07)] active:translate-y-1"
    >
      <span className="flex items-center gap-3">
        <span className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-3xl ${challenge ? 'bg-sun/30' : 'bg-coral/10'}`} aria-hidden="true">
          {challenge ? '🏆' : news.latest!.emoji}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wide text-coral-ink">
            {challenge ? t('feed.kinds.challenge') : t('feed.home.today')}
            {news.fresh > 0 && <span className="rounded-full bg-coral px-2 py-0.5 text-[11px] normal-case tracking-normal text-white">{news.fresh > 9 ? t('feed.home.freshLots') : t('feed.home.fresh', { count: news.fresh })}</span>}
          </span>
          <span className="mt-0.5 block text-lg font-extrabold leading-tight">{post.title[lang]}</span>
          {challenge && (
            <span className="mt-0.5 block text-sm font-semibold text-ink/60">
              {left} · {t('feed.challenge.answers', { count: challenge.answers })}
            </span>
          )}
        </span>
        <span className="text-xl font-extrabold text-ink/30" aria-hidden="true">
          ›
        </span>
      </span>
      {news.activeThisWeek > 0 && (
        <span className="flex items-center gap-2 border-t border-ink/5 pt-3 text-sm font-bold text-ink/55">
          {news.faces.length > 0 && (
            <span className="flex -space-x-2">
              {news.faces.map((face) => (
                <Avatar key={face.userId} userId={face.userId} name={face.name} photoVersion={face.photoVersion} size={24} className="ring-2 ring-card" />
              ))}
            </span>
          )}
          {t('feed.home.active', { count: news.activeThisWeek })}
        </span>
      )}
    </button>
  )
}
