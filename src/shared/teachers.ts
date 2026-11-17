/**
 * The cast of AI teachers. Names and colours live here; the texts shown to students
 * (role, style) live in the translation files under "teachers.<id>".
 * Voices and system prompts are attached at the voice-conversation step.
 */
export type TeacherId = 'harper' | 'jake' | 'elena' | 'sterling'

export interface Teacher {
  id: TeacherId
  name: string
  /** Avatar background colour. */
  color: string
}

export const TEACHERS: Teacher[] = [
  { id: 'harper', name: 'Miss Harper', color: '#7C5CFF' },
  { id: 'jake', name: 'Jake', color: '#2EC4A0' },
  { id: 'elena', name: 'Elena', color: '#FF6B4A' },
  { id: 'sterling', name: 'Mr. Sterling', color: '#1F1B3A' },
]
