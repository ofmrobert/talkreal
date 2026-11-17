import { useTranslation } from 'react-i18next'
import { canSpeak, speak } from '../../lib/speech'

function SpeakerIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 9v6h4l5 4V5L8 9z" />
      <path d="M16.5 8.500a5 5 0 0 1 0 7M19 6a8.500 8.500 0 0 1 0 12" />
    </svg>
  )
}

interface Props {
  text: string
  slow?: boolean
  /** "small" sits inline next to a sentence; "big" is the main control of a listening exercise. */
  size?: 'small' | 'big'
  className?: string
}

/** A button that reads English text aloud. Renders nothing if the device cannot speak. */
export default function SpeakButton({ text, slow = false, size = 'small', className = '' }: Props) {
  const { t } = useTranslation()
  if (!canSpeak()) return null

  const shape =
    size === 'big'
      ? 'h-24 w-24 rounded-[2rem] bg-coral text-white shadow-[0_6px_0_0_var(--color-coral-dark)] active:translate-y-1 active:shadow-[0_2px_0_0_var(--color-coral-dark)]'
      : 'h-10 w-10 rounded-xl bg-coral/10 text-coral active:bg-coral/20'

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        speak(text, slow)
      }}
      aria-label={slow ? t('lesson.listenSlow') : t('lesson.listen')}
      className={`inline-flex shrink-0 items-center justify-center ${shape} ${className}`}
    >
      <SpeakerIcon size={size === 'big' ? 44 : 20} />
    </button>
  )
}
