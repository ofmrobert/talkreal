import type { SVGProps } from 'react'

function Icon({ children, ...rest }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="26"
      height="26"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  )
}

export const BookIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M4 5a2 2 0 0 1 2-2h13v15H6a2 2 0 0 0-2 2z" />
    <path d="M4 20a2 2 0 0 0 2 2h13v-4" />
  </Icon>
)

export const MicIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <rect x="9" y="2" width="6" height="12" rx="3" />
    <path d="M5 11a7 7 0 0 0 14 0M12 18v4" />
  </Icon>
)

export const UserIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21a8 8 0 0 1 16 0" />
  </Icon>
)

export const FlameIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-1.8.7-3 1.8-4 .2 1.5 1 2.5 2 2.5C11 9 10.5 6 12 3z" />
  </Icon>
)

export const BoltIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M13 2 4 14h7l-1 8 9-12h-7z" />
  </Icon>
)

export const CheckIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon strokeWidth="3.4" {...p}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Icon>
)

export const StarIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon fill="currentColor" strokeWidth="1.6" {...p}>
    <path d="M12 2.8l2.8 5.9 6.4.9-4.7 4.5 1.2 6.4L12 17.4l-5.700 3.100 1.200-6.400-4.700-4.500 6.400-.9z" />
  </Icon>
)

export const LockIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <rect x="5" y="11" width="14" height="10" rx="2.5" fill="currentColor" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </Icon>
)

export const TrophyIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M7 4h10v4.500a5 5 0 0 1-10 0z" fill="currentColor" />
    <path d="M7 5.500H4V7a3.500 3.500 0 0 0 3.500 3.500M17 5.500h3V7a3.500 3.500 0 0 1-3.500 3.500M12 13.500V17M8 20h8" />
  </Icon>
)

export const CrownIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon fill="currentColor" strokeWidth="1.6" {...p}>
    <path d="M3 8l4.500 4L12 5l4.500 7L21 8l-2 10.500H5z" />
  </Icon>
)

export const ChevronRightIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="m9 5 7 7-7 7" />
  </Icon>
)
