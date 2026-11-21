import { useTranslation } from 'react-i18next'

/**
 * The checkmark next to a name: blue for a real teacher verified by Talkreal,
 * gold with a shine for the founder.
 */
export default function Verified({ size = 16, owner = false }: { size?: number; owner?: boolean }) {
  const { t } = useTranslation()
  const label = t(owner ? 'feed.ownerFull' : 'feed.verifiedTeacher')
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-extrabold leading-none ${owner ? 'owner-shine text-coal' : 'bg-[#3D9BFF] text-white'}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.62) }}
    >
      ✓
    </span>
  )
}

/** The founder's gold tag. */
export function OwnerTag({ small = false }: { small?: boolean }) {
  const { t } = useTranslation()
  return <span className={`owner-shine inline-flex shrink-0 items-center gap-1 rounded-full font-extrabold uppercase tracking-wide text-coal ${small ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-0.5 text-xs'}`}>👑 {t('feed.owner')}</span>
}
