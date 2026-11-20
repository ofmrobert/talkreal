import type { HTMLAttributes } from 'react'

export default function Card({ className = '', ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`rounded-3xl bg-card p-5 shadow-[0_5px_0_0_rgb(var(--shade)/0.07)] ${className}`}
      {...rest}
    />
  )
}
