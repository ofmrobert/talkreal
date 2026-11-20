import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Lesson } from '../../../shared/lesson'
import Button from '../ui/Button'
import SpeakButton from './SpeakButton'

interface Props {
  lesson: Lesson
  onStart: () => void
  onClose: () => void
}

/** Before the exercises: the rule cards one by one, then the lesson's words. */
export default function LessonIntro({ lesson, onStart, onClose }: Props) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language === 'en' ? 'en' : 'ru'
  const pages = lesson.theory.length + 1 // rule cards + the vocabulary page
  const [page, setPage] = useState(0)
  const card = lesson.theory[page]
  const isLast = page === pages - 1

  return (
    <div className="safe-screen mx-auto flex h-full max-w-md flex-col gap-4">
      <header className="flex items-center gap-3">
        <button type="button" onClick={onClose} aria-label={t('lesson.close')} className="flex h-11 w-11 items-center justify-center rounded-full text-2xl font-bold text-ink/45 active:bg-ink/10">
          ✕
        </button>
        <div className="flex flex-1 gap-1.5" aria-hidden="true">
          {Array.from({ length: pages }, (_, i) => (
            <span key={i} className={`h-2 flex-1 rounded-full transition-colors ${i <= page ? 'bg-coral' : 'bg-ink/10'}`} />
          ))}
        </div>
        <button type="button" onClick={onStart} className="min-h-11 px-1 text-base font-bold text-ink/50">
          {t('common.skip')}
        </button>
      </header>

      <div key={page} className="slide-in flex flex-1 flex-col gap-4 overflow-y-auto pb-2">
        {page === 0 && (
          <div>
            <p className="text-sm font-extrabold uppercase tracking-wide text-coral">
              {lesson.level} · {t('lesson.lessonNumber', { number: lesson.order })}
            </p>
            <h1 className="mt-1 text-3xl font-extrabold leading-tight">{lesson.title[lang]}</h1>
            <p className="mt-2 text-lg text-ink/65">{lesson.goal[lang]}</p>
          </div>
        )}

        {card ? (
          <>
            <section className="rounded-3xl bg-card p-5 shadow-[0_5px_0_0_rgb(var(--shade)/0.07)]">
              <p className="text-xs font-extrabold uppercase tracking-wide text-ink/45">{t('lesson.rule')}</p>
              <h2 className="mt-1 text-xl font-extrabold leading-snug">{card.title}</h2>
              <p className="mt-3 select-text text-base leading-relaxed text-ink/80">{card.body}</p>
            </section>

            <section className="flex flex-col gap-2">
              {card.examples.map((example) => (
                <div key={example.en} className="flex items-center gap-3 rounded-2xl border-l-4 border-mint bg-card py-3 pl-4 pr-3">
                  <div className="min-w-0 flex-1 select-text">
                    <p className="text-lg font-bold leading-snug">{example.en}</p>
                    <p className="text-sm text-ink/55">{example.ru}</p>
                  </div>
                  <SpeakButton text={example.en} />
                </div>
              ))}
            </section>

            {card.tip && (
              <section className="flex gap-3 rounded-2xl bg-sun/25 p-4">
                <span className="text-xl" aria-hidden="true">
                  💡
                </span>
                <p className="select-text text-base font-semibold leading-snug">{card.tip}</p>
              </section>
            )}
          </>
        ) : (
          <>
            <div>
              <h2 className="text-2xl font-extrabold">{t('lesson.vocabTitle')}</h2>
              <p className="mt-1 text-base text-ink/60">{t('lesson.vocabHint')}</p>
            </div>
            <section className="flex flex-col gap-2">
              {lesson.vocab.map((word) => (
                <div key={word.en} className="flex items-center gap-3 rounded-2xl bg-card py-3 pl-4 pr-3">
                  <div className="min-w-0 flex-1 select-text">
                    <p className="text-lg font-extrabold leading-snug">
                      {word.en} <span className="font-semibold text-ink/50">— {word.ru}</span>
                    </p>
                    {word.example && <p className="text-sm text-ink/55">{word.example}</p>}
                  </div>
                  <SpeakButton text={word.example ? `${word.en}. ${word.example}` : word.en} />
                </div>
              ))}
            </section>
          </>
        )}
      </div>

      <footer className="flex gap-3">
        {page > 0 && (
          <Button variant="secondary" className="!w-auto px-5" onClick={() => setPage(page - 1)} aria-label={t('placement.back')}>
            ←
          </Button>
        )}
        <Button onClick={isLast ? onStart : () => setPage(page + 1)}>
          {isLast ? t('lesson.startExercises') : t('common.next')}
        </Button>
      </footer>
    </div>
  )
}
