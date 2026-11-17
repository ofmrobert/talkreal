/** A chunky progress bar. value goes from 0 to 1. */
export default function ProgressBar({ value }: { value: number }) {
  const percent = Math.round(Math.min(1, Math.max(0, value)) * 100)
  return (
    <div
      className="h-4 w-full overflow-hidden rounded-full bg-ink/10"
      role="progressbar"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full bg-mint transition-[width] duration-300 ease-out"
        style={{ width: `${Math.max(percent, 4)}%` }}
      />
    </div>
  )
}
