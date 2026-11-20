import { LEVELS, type Level } from './levels'

/**
 * Role-play situations for a conversation with an AI teacher. Names shown to students are in
 * the translation files under "scenarios.<id>"; what the teacher is told is in
 * src/server/voice/scenarios.ts.
 */
export const SCENARIOS = [
  { id: 'cafe', icon: '☕', from: 'A1' },
  { id: 'shopping', icon: '🛍️', from: 'A1' },
  { id: 'directions', icon: '🗺️', from: 'A1' },
  { id: 'hotel', icon: '🏨', from: 'A2' },
  { id: 'airport', icon: '✈️', from: 'A2' },
  { id: 'doctor', icon: '🩺', from: 'A2' },
  { id: 'interview', icon: '💼', from: 'B1' },
  { id: 'meeting', icon: '📊', from: 'B1' },
  { id: 'debate', icon: '⚖️', from: 'B2' },
  { id: 'negotiation', icon: '🤝', from: 'B2' },
] as const satisfies readonly { id: string; icon: string; from: Level }[]

export type ScenarioId = (typeof SCENARIOS)[number]['id']

export const isScenario = (value: unknown): value is ScenarioId => SCENARIOS.some((s) => s.id === value)

/** The situations suitable for a level: everything that starts at that level or below. */
export function scenariosFor(level: string | null | undefined) {
  const index = LEVELS.indexOf(level as Level)
  return SCENARIOS.filter((s) => LEVELS.indexOf(s.from) <= (index === -1 ? 0 : index))
}
