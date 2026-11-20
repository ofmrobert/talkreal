import { useTranslation } from 'react-i18next'
import type { CallReport } from '../../../shared/report'
import SpeakButton from '../lesson/SpeakButton'

/** The teacher's review of a call: what went well, the mistakes with their corrections, and words to keep. */
export default function ReportCard({ report }: { report: CallReport }) {
  const { t } = useTranslation()
  return (
    <section className="bubble-in flex flex-col gap-4 rounded-3xl bg-white p-4 shadow-[0_5px_0_0_rgba(31,27,58,0.07)]">
      <div>
        <h2 className="text-xs font-extrabold uppercase tracking-wide text-ink/50">{t('report.title')}</h2>
        {report.summary && <p className="mt-1 select-text text-base font-bold leading-snug">{report.summary}</p>}
      </div>

      {report.corrections.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-extrabold">{t('report.corrections')}</h3>
          {report.corrections.map((c, i) => (
            <div key={i} className="select-text rounded-2xl bg-cream p-3">
              <p className="text-base text-coral-dark line-through decoration-2">{c.said}</p>
              <p className="mt-0.5 flex items-start gap-2 text-base font-extrabold text-[#0E6B55]">
                <span className="flex-1">{c.better}</span>
                <SpeakButton text={c.better} className="!h-8 !w-8" />
              </p>
              {c.why && <p className="mt-1 text-sm leading-snug text-ink/65">{c.why}</p>}
            </div>
          ))}
        </div>
      ) : (
        <p className="rounded-2xl bg-mint/20 p-3 text-base font-bold text-[#0E6B55]">{t('report.noMistakes')}</p>
      )}

      {report.words.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-extrabold">{t('report.words')}</h3>
          <ul className="flex flex-col gap-1.5">
            {report.words.map((w, i) => (
              <li key={i} className="flex select-text items-center gap-2 rounded-2xl bg-[#EDE8FF] px-3 py-2">
                <SpeakButton text={w.en} className="!h-8 !w-8 !bg-white/70 !text-[#5B3FD6]" />
                <span className="min-w-0 flex-1 text-base">
                  <span className="font-extrabold">{w.en}</span> <span className="text-ink/60">— {w.ru}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="text-sm font-semibold text-ink/50">{t('report.wordsHint')}</p>
        </div>
      )}

      {report.tip && (
        <p className="select-text rounded-2xl bg-sun/25 p-3 text-base leading-snug">
          <span className="font-extrabold">{t('report.tip')}</span> {report.tip}
        </p>
      )}
    </section>
  )
}
