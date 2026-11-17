import { useTranslation } from 'react-i18next'
import Badge from '../components/ui/Badge'
import Card from '../components/ui/Card'
import { TEACHERS } from '../../shared/teachers'

/** Talk tab. For now it introduces the teachers; live voice arrives at the voice step. */
export default function Talk() {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col gap-4">
      <header className="pt-1">
        <h1 className="text-3xl font-extrabold">{t('talk.title')}</h1>
        <p className="mt-2 text-base text-ink/65">{t('talk.subtitle')}</p>
      </header>

      {TEACHERS.map((teacher) => (
        <Card key={teacher.id} className="flex items-start gap-4">
          <div
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-2xl font-extrabold text-white"
            style={{ backgroundColor: teacher.color }}
            aria-hidden="true"
          >
            {teacher.name.replace(/^(Miss|Mr\.)\s/, '')[0]}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-extrabold">{teacher.name}</h2>
              <Badge>{t('common.soon')}</Badge>
            </div>
            <p className="text-sm font-bold text-ink/55">{t(`teachers.${teacher.id}.role`)}</p>
            <p className="mt-1 text-base text-ink/75">{t(`teachers.${teacher.id}.style`)}</p>
          </div>
        </Card>
      ))}
    </div>
  )
}
