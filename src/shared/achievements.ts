/**
 * Every badge a student can earn. Names and descriptions are in the translation files
 * under "achievements.<key>". To add a badge: add it here, add its texts, and teach
 * src/server/progress/achievements.ts when it is earned.
 */
export const ACHIEVEMENTS = [
  { key: 'first_lesson', icon: '🎯' },
  { key: 'perfect', icon: '💎' },
  { key: 'streak_3', icon: '🔥' },
  { key: 'streak_7', icon: '🚀' },
  { key: 'streak_30', icon: '👑' },
  { key: 'lessons_10', icon: '📚' },
  { key: 'lessons_25', icon: '🎓' },
  { key: 'lessons_50', icon: '🏆' },
  { key: 'xp_100', icon: '⚡' },
  { key: 'xp_500', icon: '🌟' },
  { key: 'xp_1000', icon: '☄️' },
  { key: 'level_done', icon: '🏅' },
  { key: 'first_call', icon: '🎙️' },
] as const

export type AchievementKey = (typeof ACHIEVEMENTS)[number]['key']

export const achievementIcon = (key: string) => ACHIEVEMENTS.find((a) => a.key === key)?.icon ?? '⭐'
