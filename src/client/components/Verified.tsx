import { useTranslation } from 'react-i18next'

/** The blue checkmark next to the name of a real teacher verified by Talkreal. */
export default function Verified({ size = 16 }: { size?: number }) {
  const { t } = useTranslation()
  return (
    <span
      role="img"
      aria-label={t('feed.verifiedTeacher')}
      title={t('feed.verifiedTeacher')}
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-[#3D9BFF] font-extrabold leading-none text-white"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.62) }}
    >
      ✓
    </span>
  )
}
