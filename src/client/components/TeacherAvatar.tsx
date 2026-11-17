import type { ReactNode } from 'react'
import type { TeacherId } from '../../shared/teachers'

const INK = '#1F1B3A'

interface Look {
  background: string
  skin: string
  hair: string
  clothes: string
  /** Drawn behind the head (long hair, buns). */
  hairBack?: ReactNode
  /** Drawn over the forehead. */
  hairFront: ReactNode
  /** Clothes details, glasses, beard, jewellery. */
  extras?: ReactNode
  /** Drawn over the face, after the eyes (glasses). */
  overFace?: ReactNode
}

const LOOKS: Record<TeacherId, Look> = {
  // Miss Harper: auburn bun, round glasses, purple cardigan.
  harper: {
    background: '#E7E0FF',
    skin: '#F7D6BF',
    hair: '#B4532C',
    clothes: '#7C5CFF',
    hairBack: <circle cx="60" cy="22" r="11" fill="#B4532C" />,
    hairFront: <path d="M36 54c-3-21 9-33 24-33s27 12 24 33c-3-11-10-18-24-18s-21 7-24 18z" fill="#B4532C" />,
    extras: (
      <>
        <path d="M50 88l10 9 10-9 4 3-14 13-14-13z" fill="#fff" />
        <circle cx="37" cy="64" r="2.2" fill="#fff" />
        <circle cx="83" cy="64" r="2.2" fill="#fff" />
      </>
    ),
    overFace: (
      <g fill="none" stroke={INK} strokeWidth="2">
        <circle cx="50" cy="55" r="7.5" />
        <circle cx="70" cy="55" r="7.5" />
        <path d="M57.5 55h5" />
      </g>
    ),
  },
  // Jake: messy brown hair, green hoodie, headphones round his neck.
  jake: {
    background: '#D3F4EB',
    skin: '#F0C7A4',
    hair: '#5A3A22',
    clothes: '#2EC4A0',
    hairFront: (
      <path d="M35 53c-4-19 7-32 24-32 5-4 14-3 17 3 9 3 12 15 9 29-2-9-7-15-13-17-8 3-22 3-31 0-3 4-5 10-6 17z" fill="#5A3A22" />
    ),
    extras: (
      <>
        <path d="M54 92v12M66 92v12" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M36 84c2 11 12 17 24 17s22-6 24-17" fill="none" stroke={INK} strokeWidth="5" strokeLinecap="round" />
        <rect x="29" y="76" width="10" height="15" rx="5" fill={INK} />
        <rect x="81" y="76" width="10" height="15" rx="5" fill={INK} />
      </>
    ),
  },
  // Elena: long dark hair, coral top, gold hoops.
  elena: {
    background: '#FFE1D8',
    skin: '#F3CDAE',
    hair: '#2B1D16',
    clothes: '#FF6B4A',
    hairBack: <path d="M32 58c-3-26 10-38 28-38s31 12 28 38c0 15 3 26 8 34H24c5-8 8-19 8-34z" fill="#2B1D16" />,
    hairFront: <path d="M37 52c0-17 10-28 23-28 13 0 23 9 24 26-9-4-15-11-19-18-5 9-16 15-28 20z" fill="#2B1D16" />,
    extras: (
      <g fill="none" stroke="#FFC53D" strokeWidth="2">
        <circle cx="37" cy="66" r="4" />
        <circle cx="83" cy="66" r="4" />
      </g>
    ),
  },
  // Mr. Sterling: grey hair and beard, rectangular glasses, navy suit, yellow tie.
  sterling: {
    background: '#DCDCE8',
    skin: '#EBC3A0',
    hair: '#B6BBC6',
    clothes: '#1F1B3A',
    hairFront: <path d="M37 50c-2-17 9-28 23-28s25 11 23 28c-3-8-9-13-23-13s-20 5-23 13z" fill="#B6BBC6" />,
    extras: (
      <>
        <path d="M49 87l11 15 11-15z" fill="#fff" />
        <path d="M57 90h6l2 5-5 13-5-13z" fill="#FFC53D" />
        <path d="M38 60c0 15 9 25 22 25s22-10 22-25c-3 9-8 13-13 13H51c-5 0-10-4-13-13z" fill="#B6BBC6" />
      </>
    ),
    overFace: (
      <g fill="none" stroke={INK} strokeWidth="2">
        <rect x="42.5" y="49.500" width="15" height="10.500" rx="3" />
        <rect x="62.5" y="49.500" width="15" height="10.500" rx="3" />
        <path d="M57.5 54h5" />
      </g>
    ),
  },
}

interface Props {
  teacher: TeacherId
  size?: number
  /** True while the teacher is talking: the mouth moves. */
  speaking?: boolean
  className?: string
}

/** An illustrated, gently animated portrait of one AI teacher. */
export default function TeacherAvatar({ teacher, size = 56, speaking = false, className = '' }: Props) {
  const look = LOOKS[teacher]
  const clip = `avatar-clip-${teacher}`

  return (
    <svg width={size} height={size} viewBox="0 0 120 120" className={`shrink-0 ${className}`} aria-hidden="true">
      <defs>
        <clipPath id={clip}>
          <circle cx="60" cy="60" r="60" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clip})`}>
        <rect width="120" height="120" fill={look.background} />
        <g className="avatar-breathe">
          {look.hairBack}
          {/* shoulders, neck, head */}
          <path d="M14 124c0-25 19-38 46-38s46 13 46 38z" fill={look.clothes} />
          <rect x="52" y="72" width="16" height="18" rx="7" fill={look.skin} />
          <rect x="52" y="76" width="16" height="6" fill={INK} opacity="0.1" />
          <circle cx="37" cy="57" r="4.500" fill={look.skin} />
          <circle cx="83" cy="57" r="4.500" fill={look.skin} />
          <ellipse cx="60" cy="54" rx="23" ry="26" fill={look.skin} />
          {look.extras}
          {look.hairFront}

          {/* face */}
          <circle cx="45" cy="64" r="4.500" fill="#FF8A70" opacity="0.35" />
          <circle cx="75" cy="64" r="4.500" fill="#FF8A70" opacity="0.35" />
          <g className="avatar-blink" fill={INK}>
            <circle cx="50" cy="55" r="2.800" />
            <circle cx="70" cy="55" r="2.800" />
          </g>
          <g fill="none" stroke={look.hair === '#B6BBC6' ? '#8A8F9C' : look.hair} strokeWidth="2.200" strokeLinecap="round">
            <path d="M45 47.500q5-2.500 9 0" />
            <path d="M66 47.500q4-2.500 9 0" />
          </g>
          {speaking ? (
            <ellipse className="avatar-talk" cx="60" cy="68" rx="5" ry="4.200" fill="#7A2B2B" />
          ) : (
            <path d="M53 66.500q7 6 14 0" fill="none" stroke={INK} strokeWidth="2.400" strokeLinecap="round" />
          )}
          {look.overFace}
        </g>
      </g>
    </svg>
  )
}
