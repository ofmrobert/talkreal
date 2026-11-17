import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import Badge from '../components/ui/Badge'
import Card from '../components/ui/Card'
import TeacherAvatar from '../components/TeacherAvatar'
import { ChevronRightIcon, MicIcon } from '../components/icons'
import { api } from '../lib/api'
import { TEACHERS } from '../../shared/teachers'

interface VoiceStatus {
  available: boolean
  remainingSeconds: number
  dailySeconds: number
}

/** Talk tab: choose an AI teacher to call, and see how much speaking time is left today. */
export default function Talk() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [status, setStatus] = useState<VoiceStatus | null>(null)

  useEffect(() => {
    const tz = encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone)
    api<VoiceStatus>(`/voice/status?tz=${tz}`)
      .then(setStatus)
      .catch(() => setStatus(null))
  }, [])

  const available = status?.available ?? false
  const minutesLeft = status ? Math.floor(status.remainingSeconds / 60) : 0
  const secondsLeft = status ? status.remainingSeconds % 60 : 0
  const outOfTime = available && status!.remainingSeconds <= 0

  return (
    <div className="flex flex-col gap-4">
      <header className="pt-1">
        <h1 className="text-3xl font-extrabold">{t('talk.title')}</h1>
        <p className="mt-2 text-base text-ink/65">{available ? t('talk.subtitleLive') : t('talk.subtitle')}</p>
      </header>

      {available && (
        <section className={`flex items-center gap-3 rounded-2xl p-4 ${outOfTime ? 'bg-coral/15' : 'bg-mint/20'}`}>
          <MicIcon width={26} height={26} className={outOfTime ? 'text-coral-dark' : 'text-[#0E6B55]'} />
          <p className="text-base font-bold">
            {outOfTime
              ? t('talk.noTime')
              : t('talk.timeLeft', { time: `${minutesLeft}:${String(secondsLeft).padStart(2, '0')}` })}
          </p>
        </section>
      )}

      {TEACHERS.map((teacher) => {
        const canCall = available && !outOfTime
        return (
          <button
            key={teacher.id}
            type="button"
            disabled={!canCall}
            onClick={() => navigate(`/talk/${teacher.id}`)}
            className="text-left active:translate-y-0.5 disabled:active:translate-y-0"
          >
            <Card className="flex items-start gap-4">
              <TeacherAvatar teacher={teacher.id} size={72} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-extrabold">{teacher.name}</h2>
                  {!available && <Badge>{t('common.soon')}</Badge>}
                </div>
                <p className="text-sm font-bold text-ink/55">{t(`teachers.${teacher.id}.role`)}</p>
                <p className="mt-1 text-base text-ink/75">{t(`teachers.${teacher.id}.style`)}</p>
              </div>
              {canCall && <ChevronRightIcon className="mt-3 shrink-0 text-ink/35" />}
            </Card>
          </button>
        )
      })}
    </div>
  )
}
