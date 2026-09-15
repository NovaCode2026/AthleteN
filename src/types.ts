export type PlanId = "free" | "student" | "pro" | "champion" | "academy";

export interface Plan { id: PlanId; name: string; price: string; aiLimit: number; audience: string; features: string[]; }
export interface Profile {
  id?: string;
  user_id?: string;
  full_name?: string;
  gender?: string;
  sport?: "taekwondo";
  discipline?: "kyorugi" | "poomsae";
  academy_id?: string;
  coach_user_id?: string;
  username?: string;
  date_of_birth?: string;
  profile_image_path?: string;
  weight_kg?: number;
  height_cm?: number;
  belt?: string;
  academy?: string;
  coach?: string;
  emergency_contact?: string;
  achievements?: string;
  plan_id?: PlanId;
  verified_athlete?: boolean;
  founder_badge?: boolean;
  role?: "athlete" | "coach" | "academy_admin" | "support_admin" | "admin" | "super_admin";
}
export interface KyorugiBout { id?: string; user_id?: string; tournament_id?: string; bout_date: string; opponent_name?: string; opponent_club?: string; category?: string; round_name?: string; result?: "win" | "loss" | "draw" | "walkover" | "other"; points_scored?: number; points_conceded?: number; penalties?: number; rounds_completed?: number; coach_notes?: string; attack_notes?: string; defence_notes?: string; techniques?: string[]; preparation_notes?: string; }
export interface KyorugiTrainingMetric { id?: string; user_id?: string; training_session_id?: string; metric_date: string; attack_score?: number; defence_score?: number; footwork_score?: number; reaction_score?: number; conditioning_score?: number; technique_notes?: string; coach_notes?: string; }
export interface PoomsaePerformance { id?: string; user_id?: string; tournament_id?: string; performance_date: string; category?: string; format?: "individual" | "pair" | "team"; poomsae_name: string; technical_score?: number; presentation_score?: number; total_score?: number; judge_scores?: unknown[]; coach_feedback?: string; preparation_notes?: string; result?: string; }
export interface PoomsaeTrainingMetric { id?: string; user_id?: string; training_session_id?: string; metric_date: string; technical_execution_score?: number; presentation_score?: number; balance_score?: number; power_score?: number; precision_score?: number; poomsae_name?: string; coach_notes?: string; preparation_notes?: string; }
export interface TrainingSession { id?: string; user_id?: string; title: string; session_date: string; minutes: number; intensity?: string; notes?: string; }
export interface Tournament { id?: string; user_id?: string; name: string; starts_at?: string; location?: string; status?: string; result?: string; opponent_notes?: string; match_notes?: string; }
export interface Medal { id?: string; user_id?: string; event_name: string; medal_type: string; category?: string; awarded_at?: string; }
export interface WeightLog { id?: string; user_id?: string; logged_at: string; weight_kg: number; target_weight_kg?: number; }
export interface Goal { id?: string; user_id?: string; title: string; target_date?: string; status?: string; progress?: number; }
export interface ChecklistItem { id?: string; user_id?: string; item: string; category: string; completed?: boolean; }
export interface DocumentRecord { id?: string; user_id?: string; title: string; document_type: string; issued_at?: string; file_path?: string; expires_at?: string; notes?: string; }
export interface FeedbackItem { id?: string; user_id?: string; title: string; details?: string; status?: string; priority?: string; }
export interface VerificationRequest { id?: string; user_id?: string; document_type: string; file_path?: string; status?: "pending" | "approved" | "rejected"; reviewer_notes?: string; }
export interface RoadmapItem { id?: string; title: string; description?: string; status?: string; votes?: number; user_has_voted?: boolean; }
export interface RoadmapVote { id?: string; roadmap_item_id: string; user_id?: string; }
export interface TournamentScan { id?: string; user_id?: string; source_url: string; tournament_name?: string; tournament_date?: string; venue?: string; registration_deadline?: string; weigh_in_information?: string; categories?: string; notices?: string; pdfs?: Array<{ href: string; label: string }>; schedules_results?: string; detected_changes?: string; status?: "pending" | "checked" | "blocked" | "failed"; last_checked_at?: string; next_check_at?: string; }
export interface UsageSummary { used: number; limit: number; plan: Plan; }
export interface AiUsageEvent { id?: string; user_id?: string; plan_id?: PlanId; topic: string; tokens_used?: number; created_at?: string; }
export interface Subscription { id?: string; user_id?: string; plan_id: PlanId; provider?: "manual" | "razorpay" | "stripe" | "cashfree"; status: "active" | "trialing" | "past_due" | "canceled"; current_period_end?: string; }
export interface SubscriptionUsage { id?: string; user_id?: string; usage_month: string; ai_requests_used: number; ai_requests_limit: number; storage_mb_used?: number; }
export interface CloudData { profile: Profile; tournaments: Tournament[]; training: TrainingSession[]; kyorugiBouts: KyorugiBout[]; kyorugiTrainingMetrics: KyorugiTrainingMetric[]; poomsaePerformances: PoomsaePerformance[]; poomsaeTrainingMetrics: PoomsaeTrainingMetric[]; medals: Medal[]; weights: WeightLog[]; goals: Goal[]; checklist: ChecklistItem[]; documents: DocumentRecord[]; notifications: Array<{ id?: string; title: string; body?: string; read_at?: string }>; feedback: FeedbackItem[]; verifications: VerificationRequest[]; roadmap: RoadmapItem[]; roadmapVotes: RoadmapVote[]; tournamentScans: TournamentScan[]; aiUsage: AiUsageEvent[]; subscriptions: Subscription[]; subscriptionUsage: SubscriptionUsage[]; }
