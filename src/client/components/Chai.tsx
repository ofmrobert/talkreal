/** Chai, the Talkreal mascot: a cheerful teacup whose steam drifts upward. */
export default function Chai({ size = 180 }: { size?: number }) {
  return (
    <svg
      className="chai-bob"
      width={size}
      height={size}
      viewBox="0 0 200 200"
      role="img"
      aria-label="Chai"
    >
      <g fill="none" stroke="#FFC53D" strokeWidth="7" strokeLinecap="round">
        <path className="chai-steam" d="M72 52c-8-10 8-16 0-28" />
        <path className="chai-steam chai-steam-2" d="M100 48c-8-10 8-16 0-28" />
        <path className="chai-steam chai-steam-3" d="M128 52c-8-10 8-16 0-28" />
      </g>
      <ellipse cx="100" cy="178" rx="62" ry="9" fill="#1F1B3A" opacity="0.1" />
      <path d="M150 96h10a22 22 0 0 1 0 44h-14" fill="none" stroke="#E2512F" strokeWidth="12" strokeLinecap="round" />
      <path d="M40 72h120v44a60 60 0 0 1-120 0z" fill="#FF6B4A" />
      <rect x="34" y="64" width="132" height="16" rx="8" fill="#E2512F" />
      <circle cx="80" cy="112" r="7" fill="#1F1B3A" />
      <circle cx="120" cy="112" r="7" fill="#1F1B3A" />
      <circle cx="82.5" cy="109.5" r="2.2" fill="#fff" />
      <circle cx="122.5" cy="109.5" r="2.2" fill="#fff" />
      <path d="M86 130q14 13 28 0" fill="none" stroke="#1F1B3A" strokeWidth="5" strokeLinecap="round" />
      <circle cx="66" cy="126" r="7" fill="#FFC53D" opacity="0.75" />
      <circle cx="134" cy="126" r="7" fill="#FFC53D" opacity="0.75" />
    </svg>
  )
}
