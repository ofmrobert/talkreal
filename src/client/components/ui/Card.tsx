import type { HTMLAttributes } from 'react'

export default function Card({ className = '', ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`rounded-3xl bg-white p-5 shadow-[0_5px_0_0_rgba(31,27,58,0.07)] ${className}`}
      {...rest}
    />
  )
}
