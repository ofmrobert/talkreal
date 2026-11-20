import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { api } from '../lib/api'
import { load, save } from '../lib/storage'

/* Small building blocks shared by every screen of the admin panel. */

/** Rubles per dollar, used only to show an approximate dollar figure next to rubles. Set on the System screen. */
export const usdRate = () => Number(load('admin.usdRate')) || 83
export const setUsdRate = (rate: number) => save('admin.usdRate', String(rate))

export const num = (value: number | null | undefined) => (value ?? 0).toLocaleString('en-US')
export const rub = (value: number | null | undefined) => `${(value ?? 0).toLocaleString('ru-RU')} ₽`
export const usd = (rubles: number | null | undefined) => `$${Math.round((rubles ?? 0) / usdRate()).toLocaleString('en-US')}`
export const pct = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 1000) / 10}%` : '—')
export const date = (value: string | Date | null | undefined) =>
  value ? new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
export const dateTime = (value: string | Date | null | undefined) =>
  value ? new Date(value).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'
export const minutes = (seconds: number | null | undefined) => `${Math.round((seconds ?? 0) / 60)} min`

/** Loads one admin screen's data. `reload` fetches it again after a change. */
export function useAdmin<T>(path: string) {
  const [data, setData] = useState<T | null>(null)
  const [failed, setFailed] = useState(false)
  const reload = useCallback(() => {
    setFailed(false)
    api<T>(`/admin${path}`)
      .then(setData)
      .catch(() => setFailed(true))
  }, [path])
  useEffect(reload, [reload])
  return { data, failed, reload }
}

export function Loading({ failed }: { failed: boolean }) {
  return <p className="p-6 text-sm font-semibold text-slate-500">{failed ? 'Could not load this screen. Check the connection and reload.' : 'Loading…'}</p>
}

export function Page({ title, hint, actions, children }: { title: string; hint?: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">{title}</h1>
          {hint && <p className="mt-0.5 max-w-2xl text-sm text-slate-500">{hint}</p>}
        </div>
        {actions}
      </header>
      {children}
    </div>
  )
}

export function Card({ title, hint, children, className = '' }: { title?: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-slate-200 bg-white p-4 ${className}`}>
      {title && <h2 className="text-sm font-bold text-slate-900">{title}</h2>}
      {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
      <div className={title ? 'mt-3' : ''}>{children}</div>
    </section>
  )
}

/** One headline number. */
export function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-extrabold tabular-nums text-slate-900">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
    </div>
  )
}

export const Stats = ({ children }: { children: ReactNode }) => <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">{children}</div>

/** A small coloured label: a plan, a status. Colour is never the only signal: the word is always there. */
export function Pill({ tone = 'grey', children }: { tone?: 'grey' | 'green' | 'amber' | 'red' | 'violet' | 'dark'; children: ReactNode }) {
  const tones = {
    grey: 'bg-slate-100 text-slate-600',
    green: 'bg-emerald-100 text-emerald-800',
    amber: 'bg-amber-100 text-amber-800',
    red: 'bg-rose-100 text-rose-800',
    violet: 'bg-violet-100 text-violet-800',
    dark: 'bg-slate-800 text-white',
  }
  return <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-bold ${tones[tone]}`}>{children}</span>
}

export const planTone = (plan: string) => (plan === 'max' ? 'dark' : plan === 'pro' ? 'violet' : 'grey') as 'dark' | 'violet' | 'grey'

/** Days to show: 7, 30 or 90. */
export function RangePicker({ value, onChange }: { value: number; onChange: (days: number) => void }) {
  return (
    <div className="flex rounded-lg border border-slate-200 bg-white p-0.5" role="radiogroup" aria-label="Period">
      {[7, 30, 90].map((days) => (
        <button
          key={days}
          type="button"
          role="radio"
          aria-checked={value === days}
          onClick={() => onChange(days)}
          className={`rounded-md px-3 py-1.5 text-sm font-bold ${value === days ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
        >
          {days} days
        </button>
      ))}
    </div>
  )
}

/**
 * A bar per day (or per item). One measure, one colour, one axis. Hovering or tapping a bar
 * shows its exact value; the same numbers are available as text to screen readers.
 */
export function Bars({ data, format = num, height = 140 }: { data: { label: string; value: number }[]; format?: (value: number) => string; height?: number }) {
  const [hover, setHover] = useState<number | null>(null)
  const max = Math.max(1, ...data.map((d) => d.value))
  const total = data.reduce((sum, d) => sum + d.value, 0)
  const shown = hover !== null ? data[hover] : null
  return (
    <figure className="m-0">
      <div className="mb-1 flex h-5 items-baseline justify-between text-xs">
        <span className="font-bold tabular-nums text-slate-900">{shown ? `${shown.label}: ${format(shown.value)}` : `Total ${format(total)}`}</span>
        <span className="tabular-nums text-slate-400">peak {format(max)}</span>
      </div>
      <div className="flex items-end gap-[2px] border-b border-slate-200" style={{ height }} onMouseLeave={() => setHover(null)}>
        {data.map((d, i) => (
          <button
            key={d.label}
            type="button"
            aria-label={`${d.label}: ${format(d.value)}`}
            onMouseEnter={() => setHover(i)}
            onFocus={() => setHover(i)}
            onClick={() => setHover(i)}
            className="group flex h-full min-w-0 flex-1 items-end"
          >
            <span
              className={`w-full rounded-t-[4px] ${hover === i ? 'bg-violet-700' : 'bg-violet-500'} ${d.value === 0 ? 'opacity-25' : ''}`}
              style={{ height: d.value === 0 ? 2 : `${Math.max(2, (d.value / max) * 100)}%` }}
            />
          </button>
        ))}
      </div>
      <figcaption className="mt-1 flex justify-between text-[11px] tabular-nums text-slate-400">
        <span>{data[0]?.label}</span>
        {data.length > 2 && <span>{data[Math.floor(data.length / 2)]?.label}</span>}
        <span>{data[data.length - 1]?.label}</span>
      </figcaption>
    </figure>
  )
}

/** A horizontal bar inside a table cell: how big this row is next to the biggest one. */
export function Meter({ value, max }: { value: number; max: number }) {
  return (
    <span className="block h-2 w-full min-w-16 rounded-full bg-slate-100">
      <span className="block h-2 rounded-full bg-violet-500" style={{ width: `${max > 0 ? Math.max(2, (value / max) * 100) : 0}%` }} />
    </span>
  )
}

export const shortDay = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

/* Table pieces: plain, dense, scrollable sideways on a phone. */
export const Table = ({ children }: { children: ReactNode }) => (
  <div className="overflow-x-auto">
    <table className="w-full border-collapse text-left text-sm">{children}</table>
  </div>
)
export const Th = ({ children, right }: { children?: ReactNode; right?: boolean }) => (
  <th className={`whitespace-nowrap border-b border-slate-200 px-3 py-2 text-xs font-bold uppercase tracking-wide text-slate-500 ${right ? 'text-right' : ''}`}>{children}</th>
)
export const Td = ({ children, right, className = '' }: { children?: ReactNode; right?: boolean; className?: string }) => (
  <td className={`border-b border-slate-100 px-3 py-2 align-middle text-slate-700 ${right ? 'text-right tabular-nums' : ''} ${className}`}>{children}</td>
)

export const inputClass = 'h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-violet-500'
export const buttonClass = 'h-9 rounded-lg bg-slate-900 px-4 text-sm font-bold text-white hover:bg-slate-700 disabled:opacity-50'
export const ghostButtonClass = 'h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50'

export function Pager({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (page: number) => void }) {
  const last = Math.max(0, Math.ceil(total / pageSize) - 1)
  return (
    <div className="mt-3 flex items-center justify-between text-sm text-slate-500">
      <span>
        {total === 0 ? 'Nothing found' : `${page * pageSize + 1}–${Math.min(total, (page + 1) * pageSize)} of ${num(total)}`}
      </span>
      <span className="flex gap-2">
        <button type="button" className={ghostButtonClass} disabled={page <= 0} onClick={() => onPage(page - 1)}>
          ← Previous
        </button>
        <button type="button" className={ghostButtonClass} disabled={page >= last} onClick={() => onPage(page + 1)}>
          Next →
        </button>
      </span>
    </div>
  )
}
