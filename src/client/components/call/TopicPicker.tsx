import { useTranslation } from 'react-i18next'
import type { Text } from '../../../shared/lesson'
import { scenariosFor, type ScenarioId } from '../../../shared/scenarios'

/** What a conversation with a teacher is about. */
export type Topic = { kind: 'free' } | { kind: 'lesson'; id: string } | { kind: 'scenario'; id: ScenarioId }

export interface LastLesson {
  id: string
  title: Text
}

interface Props {
  level: string | null | undefined
  lastLesson: LastLesson | null
  value: Topic
  onChange: (topic: Topic) => void
}

/** What goes to the server with a call or a chat. */
export function topicFields(topic: Topic): { scenario?: string; lessonId?: string } {
  if (topic.kind === 'lesson') return { lessonId: topic.id }
  if (topic.kind === 'scenario') return { scenario: topic.id }
  return {}
}

/** Lets the student choose what to talk about: anything, their last lesson, or a role-play. */
export default function TopicPicker({ level, lastLesson, value, onChange }: Props) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language === 'en' ? 'en' : 'ru'

  const options: { topic: Topic; icon: string; label: string; hint?: string }[] = [
    { topic: { kind: 'free' }, icon: '💬', label: t('topics.free') },
    ...(lastLesson ? [{ topic: { kind: 'lesson', id: lastLesson.id } as Topic, icon: '📘', label: t('topics.lesson'), hint: lastLesson.title[lang] }] : []),
    ...scenariosFor(level).map((s) => ({ topic: { kind: 'scenario', id: s.id } as Topic, icon: s.icon, label: t(`scenarios.${s.id}`) })),
  ]
  const same = (a: Topic, b: Topic) => a.kind === b.kind && ('id' in a ? a.id : '') === ('id' in b ? b.id : '')

  return (
    <div className="flex w-full flex-col gap-2">
      <h2 className="text-sm font-extrabold uppercase tracking-wide text-ink/50">{t('topics.title')}</h2>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t('topics.title')}>
        {options.map((option) => {
          const active = same(option.topic, value)
          return (
            <button
              key={option.label}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(option.topic)}
              className={`flex min-h-11 items-center gap-1.5 rounded-2xl border-2 px-3 py-1.5 text-left text-sm font-extrabold active:translate-y-0.5 ${
                active ? 'border-coral bg-coral/10 text-coral-ink' : 'border-ink/10 bg-card text-ink'
              }`}
            >
              <span aria-hidden="true">{option.icon}</span>
              <span className="leading-tight">
                {option.label}
                {option.hint && <span className="block max-w-48 truncate text-xs font-semibold opacity-70">{option.hint}</span>}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
