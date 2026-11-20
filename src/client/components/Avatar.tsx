import { avatarColor } from '../../shared/profile'

interface Props {
  userId: string
  name?: string | null
  /** Set when the student has a photo; it changes with every new photo. */
  photoVersion?: number | null
  /** A picture chosen a moment ago and not saved yet. */
  preview?: string | null
  size?: number
  className?: string
}

/** A student's picture: their photo, or their initial on a colour of their own. */
export default function Avatar({ userId, name, photoVersion, preview, size = 96, className = '' }: Props) {
  const style = { width: size, height: size }
  const src = preview ?? (photoVersion ? `/api/profile/photo/${userId}?v=${photoVersion}` : null)
  if (src) {
    return <img src={src} alt="" style={style} className={`shrink-0 rounded-full object-cover ${className}`} draggable={false} />
  }
  const initial = name?.trim()[0]?.toUpperCase()
  return (
    <span
      style={{ ...style, background: avatarColor(userId), fontSize: size * 0.42 }}
      className={`flex shrink-0 items-center justify-center rounded-full font-extrabold text-white ${className}`}
      aria-hidden="true"
    >
      {initial ?? '🙂'}
    </span>
  )
}
