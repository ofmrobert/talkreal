import type { ReactNode } from 'react'

/** Small rounded label, e.g. "Скоро". */
export default function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-block rounded-full bg-sun/30 px-3 py-1 text-xs font-extrabold uppercase tracking-wide text-ink">
      {children}
    </span>
  )
}
