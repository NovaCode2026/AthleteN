export type PlanId = 'free' | 'student' | 'pro' | 'elite' | 'coach' | 'academy';

export type FeatureKey =
  | 'basic_athlete'
  | 'ai_training_insights'
  | 'ai_performance_summaries'
  | 'detailed_progress'
  | 'advanced_analytics'
  | 'competition_analysis'
  | 'export_reports'
  | 'coach_dashboard'
  | 'coach_athlete_management'
  | 'coach_training_monitoring'
  | 'coach_ai_reports'
  | 'academy_management'
  | 'academy_analytics';

export const AI_LIMITS: Record<PlanId, number> = {
  free: 0,
  student: 50,
  pro: 200,
  elite: 500,
  coach: 750,
  academy: 2000,
};

export const PLAN_NAMES: Record<PlanId, string> = {
  free: 'Free',
  student: 'Student',
  pro: 'Pro',
  elite: 'Elite',
  coach: 'Coach',
  academy: 'Academy',
};

export function getAiLimit(plan: string | null | undefined): number {
  return AI_LIMITS[(plan || 'free') as PlanId] ?? 0;
}

export function getAiRemaining(plan: string | null | undefined, used: number): number {
  return Math.max(0, getAiLimit(plan) - Math.max(0, used || 0));
}

export function hasFeature(
  plan: string | null | undefined,
  feature: FeatureKey,
  role?: string | null,
): boolean {
  const p = (plan || 'free') as PlanId;

  if (feature === 'basic_athlete') return true;

  const access: Record<FeatureKey, PlanId[]> = {
    basic_athlete: ['free', 'student', 'pro', 'elite', 'coach', 'academy'],
    ai_training_insights: ['student', 'pro', 'elite', 'coach', 'academy'],
    ai_performance_summaries: ['student', 'pro', 'elite', 'coach', 'academy'],
    detailed_progress: ['student', 'pro', 'elite', 'coach', 'academy'],
    advanced_analytics: ['pro', 'elite', 'coach', 'academy'],
    competition_analysis: ['pro', 'elite', 'coach', 'academy'],
    export_reports: ['elite', 'coach', 'academy'],
    coach_dashboard: ['coach'],
    coach_athlete_management: ['coach', 'academy'],
    coach_training_monitoring: ['coach', 'academy'],
    coach_ai_reports: ['coach', 'academy'],
    academy_management: ['academy'],
    academy_analytics: ['academy'],
  };

  if (!access[feature]?.includes(p)) return false;

  if (feature.startsWith('coach_') && role && role !== 'coach' && role !== 'academy_admin') {
    return false;
  }
  if (feature.startsWith('academy_') && role && role !== 'academy_admin') {
    return false;
  }

  return true;
}
