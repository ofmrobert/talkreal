import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import Chai from '../components/Chai'
import Badge from '../components/ui/Badge'
import Card from '../components/ui/Card'
import { BoltIcon, ChevronRightIcon, FlameIcon } from '../components/icons'

/** Learn tab. Streak, XP and the daily lesson become real once login and lessons are built. */
export default function Home() {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-center justify-between pt-1">
        <span className="text-2xl font-extrabold tracking-tight text-coral">Talkreal</span>
        <div className="flex gap-2">
          <span className="flex items-center gap-1 rounded-full bg-white px-3 py-1.5 text-sm font-extrabold" aria-label={t('home.streak')}>
            <FlameIcon width={18} height={18} className="text-coral" />0
          </span>
          <span className="flex items-center gap-1 rounded-full bg-white px-3 py-1.5 text-sm font-extrabold" aria-label={t('home.xp')}>
            <BoltIcon width={18} height={18} className="text-sun" />0
          </span>
        </div>
      </header>

      <div className="flex items-center gap-3">
        <Chai size={96} />
        <div className="relative rounded-3xl rounded-bl-md bg-white px-4 py-3 text-base font-bold shadow-[0_4px_0_0_rgba(31,27,58,0.07)]">
          {t('home.greeting')}
        </div>
      </div>

      <Card>
        <Badge>{t('common.soon')}</Badge>
        <h2 className="mt-3 text-xl font-extrabold">{t('home.lessonTitle')}</h2>
        <p className="mt-1 text-base text-ink/65">{t('home.lessonText')}</p>
      </Card>

      <Link to="/talk" className="block active:translate-y-0.5">
        <Card className="flex items-center gap-3">
          <div className="flex-1">
            <h2 className="text-xl font-extrabold">{t('home.talkTitle')}</h2>
            <p className="mt-1 text-base text-ink/65">{t('home.talkText')}</p>
          </div>
          <ChevronRightIcon className="shrink-0 text-ink/35" />
        </Card>
      </Link>
    </div>
  )
}
