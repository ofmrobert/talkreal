import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import type { FeedPost } from '../../shared/feed'
import { GOALS, INTERESTS } from '../../shared/profile'
import type { PublicProfile as ProfileData } from '../../shared/social'
import Verified, { OwnerTag } from '../components/Verified'
import Avatar from '../components/Avatar'
import Chai from '../components/Chai'
import { BackButton, FollowButton, SafetyMenu, useFaceName } from '../components/social/SocialBits'
import { api } from '../lib/api'
import { LockedPost, PostCard } from './Feed'

interface PostsData {
  posts: FeedPost[]
  canDiscuss: boolean
  freeCommentsLeft: number | null
}

/** Another student's profile: what they chose to show, their posts, and the ways to follow and write to them. */
export default function PublicProfile() {
  const { id = '' } = useParams()
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const nameOf = useFaceName()
  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [feed, setFeed] = useState<PostsData | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setProfile(null)
    setFeed(null)
    api<{ profile: ProfileData }>(`/social/people/${id}`)
      .then((result) => setProfile(result.profile))
      .catch(() => setFailed(true))
    api<PostsData>(`/feed?author=${id}`)
      .then(setFeed)
      .catch(() => {})
  }, [id])

  if (!profile) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <Chai size={110} />
        {failed && (
          <>
            <p className="text-base font-bold text-ink/60">{t('social.profile.notFound')}</p>
            <BackButton to="/people" />
          </>
        )}
      </div>
    )
  }

  const { face } = profile
  const lang = i18n.language === 'en' ? 'en' : 'ru'

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between pt-1">
        <BackButton />
        {!profile.me && <SafetyMenu userId={face.userId} blocked={profile.blocked} onBlocked={(blocked) => setProfile({ ...profile, blocked, canMessage: !blocked && profile.open, following: blocked ? false : profile.following })} />}
      </header>

      <section className="flex flex-col items-center gap-3 rounded-3xl bg-card p-5 text-center shadow-[0_5px_0_0_rgb(var(--shade)/0.07)]">
        <Avatar userId={face.userId} name={face.name} photoVersion={face.photoVersion} size={104} className={face.owner ? 'ring-4 ring-sun-dark ring-offset-4 ring-offset-card' : undefined} />
        <div>
          <h1 className="flex items-center justify-center gap-1.5 text-2xl font-extrabold leading-tight">
            {nameOf(face)}
            {face.teacher && <Verified size={22} owner={face.owner} />}
          </h1>
          <p className="mt-1.5 flex flex-wrap items-center justify-center gap-2 text-sm font-extrabold text-ink/55">
            {face.owner ? <OwnerTag /> : face.teacher && <span className="rounded-full bg-[#3D9BFF] px-2.5 py-0.5 text-white">{t('feed.verifiedTeacher')}</span>}
            {profile.level && (
              <span className="rounded-full bg-coral px-2.5 py-0.5 text-white">
                {profile.level} · {t(`levels.${profile.level}.name`)}
              </span>
            )}
            {profile.streak > 0 && <span>🔥 {t('social.profile.streak', { count: profile.streak })}</span>}
            {profile.city && <span>📍 {profile.city}</span>}
          </p>
        </div>
        {profile.bio && <p className="select-text text-base font-semibold leading-snug text-ink/75">{profile.bio}</p>}
        {!profile.open && <p className="rounded-2xl bg-cream px-4 py-3 text-sm font-semibold leading-snug text-ink/60">{t('social.profile.closed')}</p>}

        <dl className="grid w-full grid-cols-3 gap-2">
          {(
            [
              ['posts', profile.posts],
              ['followers', profile.followers],
              ['following', profile.followingCount],
            ] as const
          ).map(([key, value]) => (
            <div key={key} className="rounded-2xl bg-cream py-2.5">
              <dd className="text-xl font-extrabold tabular-nums">{value}</dd>
              <dt className="text-xs font-bold text-ink/50">{t(`social.profile.${key}`)}</dt>
            </div>
          ))}
        </dl>

        {profile.me ? (
          <button type="button" onClick={() => navigate('/profile/edit')} className="min-h-12 w-full rounded-2xl bg-card text-base font-extrabold text-ink ring-2 ring-inset ring-ink/10 active:translate-y-0.5">
            {t('social.profile.edit')}
          </button>
        ) : profile.blocked ? (
          <p className="text-sm font-bold text-bad-ink">{t('social.profile.blocked')}</p>
        ) : (
          <div className="flex w-full gap-2">
            <FollowButton
              wide
              userId={face.userId}
              following={profile.following}
              onChange={(following) => setProfile({ ...profile, following, followers: Math.max(0, profile.followers + (following === profile.following ? 0 : following ? 1 : -1)) })}
            />
            {profile.canMessage && (
              <button
                type="button"
                onClick={() => navigate(`/messages/${face.userId}`)}
                className="min-h-11 flex-1 rounded-2xl bg-night px-4 text-sm font-extrabold text-white shadow-[0_4px_0_0_rgb(var(--shade)/0.3)] active:translate-y-1"
              >
                ✉️ {t('social.profile.write')}
              </button>
            )}
          </div>
        )}
        {profile.followsYou && !profile.me && <p className="text-xs font-extrabold text-violet-ink">{t('social.followsYou')}</p>}
      </section>

      {(profile.goals.length > 0 || profile.interests.length > 0) && (
        <section className="flex flex-col gap-3 rounded-3xl bg-card p-4 shadow-[0_5px_0_0_rgb(var(--shade)/0.07)]">
          {profile.goals.length > 0 && (
            <div>
              <h2 className="text-sm font-extrabold text-ink/50">{t('social.profile.goals')}</h2>
              <p className="mt-1.5 flex flex-wrap gap-1.5 text-sm font-extrabold">
                {profile.goals.map((goal) => (
                  <span key={goal} className="rounded-full bg-sun/25 px-3 py-1.5">
                    {GOALS.find((g) => g.id === goal)?.icon} {t(`goals.${goal}`)}
                  </span>
                ))}
              </p>
            </div>
          )}
          {profile.interests.length > 0 && (
            <div>
              <h2 className="flex items-center gap-2 text-sm font-extrabold text-ink/50">
                {t('social.profile.interests')}
                {profile.common > 0 && !profile.me && <span className="rounded-full bg-good-soft px-2 py-0.5 text-xs text-good-ink">{t('social.common', { count: profile.common })}</span>}
              </h2>
              <p className="mt-1.5 flex flex-wrap gap-1.5 text-sm font-extrabold">
                {profile.interests.map((interest) => (
                  <span key={interest} className="rounded-full bg-cream px-3 py-1.5">
                    {INTERESTS.find((i) => i.id === interest)?.icon} {t(`interests.${interest}`)}
                  </span>
                ))}
              </p>
            </div>
          )}
        </section>
      )}

      {feed && feed.posts.length > 0 && <h2 className="px-1 text-lg font-extrabold">{t('social.profile.theirPosts')}</h2>}
      {feed?.posts.map((post) =>
        post.locked ? (
          <LockedPost key={post.id} post={post} />
        ) : (
          <PostCard
            key={post.id}
            post={post}
            lang={lang}
            canDiscuss={feed.canDiscuss}
            freeLeft={feed.freeCommentsLeft}
            onChange={(next) => setFeed({ ...feed, posts: feed.posts.map((p) => (p.id === next.id ? next : p)) })}
            onFreeLeft={(left) => setFeed((current) => (current ? { ...current, freeCommentsLeft: left } : current))}
            onRemoved={(removed) => setFeed({ ...feed, posts: feed.posts.filter((p) => p.id !== removed) })}
            onAnswered={() => {}}
          />
        ),
      )}
    </div>
  )
}
