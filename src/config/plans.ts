import type { Plan } from "../types";

// Single canonical commercial plan catalog. Keep IDs aligned with mobile, Supabase, AI and billing.
export const plans: Plan[] = [
  {
    id: "free",
    name: "Free",
    price: "₹0/month · ₹0/year",
    aiLimit: 0,
    audience: "Athletes",
    features: ["Core athlete dashboard", "Training and competition records", "Calendar and journey", "Taekwondo Kyorugi and Poomsae support"]
  },
  {
    id: "student",
    name: "Student",
    price: "₹99/month · ₹999/year",
    aiLimit: 50,
    audience: "Students",
    features: ["Student verification", "50 AI Coach messages", "Documents and messaging", "Priority roadmap voting"]
  },
  {
    id: "pro",
    name: "Pro",
    price: "₹199/month · ₹1,999/year",
    aiLimit: 200,
    audience: "Competitive athletes",
    features: ["200 AI Coach messages", "Advanced analytics", "Competition analysis", "Goal and performance tracking"]
  },
  {
    id: "elite",
    name: "Elite",
    price: "₹399/month · ₹3,999/year",
    aiLimit: 500,
    audience: "Serious competitive athletes",
    features: ["500 AI Coach messages", "Advanced analytics", "Competition analysis", "Export reports"]
  },
  {
    id: "coach",
    name: "Coach",
    price: "₹499/month · ₹4,999/year",
    aiLimit: 750,
    audience: "Independent coaches",
    features: ["Coach dashboard", "Athlete roster and management", "Training monitoring and feedback", "750 AI Coach messages"]
  },
  {
    id: "academy",
    name: "Academy",
    price: "₹799/month · ₹7,999/year",
    aiLimit: 1000,
    audience: "Clubs and academies",
    features: ["Academy dashboard", "Athlete and coach management", "Attendance and academy analytics", "1,000 AI Coach messages"]
  }
];

export function getPlan(id?: string): Plan {
  return plans.find((plan) => plan.id === id) ?? plans[0];
}
