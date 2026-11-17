import type { ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost'

const base =
  'inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl px-6 text-lg font-extrabold transition-transform duration-75 disabled:opacity-50 disabled:pointer-events-none'

const variants: Record<Variant, string> = {
  primary:
    'bg-coral text-white shadow-[0_5px_0_0_var(--color-coral-dark)] active:translate-y-1 active:shadow-[0_1px_0_0_var(--color-coral-dark)]',
  secondary:
    'bg-white text-ink shadow-[0_5px_0_0_rgba(31,27,58,0.12)] active:translate-y-1 active:shadow-[0_1px_0_0_rgba(31,27,58,0.12)]',
  ghost: 'min-h-11 text-base font-bold text-ink/60 active:text-ink',
}

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
}

/** The big, chunky Talkreal button. Always at least 44px tall for easy tapping. */
export default function Button({ variant = 'primary', className = '', ...rest }: Props) {
  return <button className={`${base} ${variants[variant]} ${className}`} {...rest} />
}
