import type { Plan } from "../types";

export const plans: Plan[] = [
  {
    id: "free",
    name: "Free",
    price: "₹0/month · ₹0/year",
    aiLimit: 0,
    audience: "Everyone",
    features: [
      "Core athlete dashboard",
      "Training and competition records",
      "Medals and documents",
      "Calendar, athlete journey and weight tracking",
      "Taekwondo Kyorugi and Poomsae support"
    ]
  },
  {
    id: "student",
    name: "Student",
    price: "₹99/month · ₹999/year",
    aiLimit: 50,
    audience: "Individual athletes",
    features: [
      "50 AI Coach messages/month",
      "Student verification",
      "Goals and detailed progress",
      "Messaging and document workflows"
    ]
  },
  {
    id: "pro",
    name: "Pro",
    price: "₹199/month · ₹1,999/year",
    aiLimit: 200,
    audience: "Competitive athletes",
    features: [
      "200 AI Coach messages/month",
      "Advanced analytics",
      "Competition analysis",
      "Advanced performance insights"
    ]
  },
  {
    id: "elite",
    name: "Elite",
    price: "₹399/month · ₹3,999/year",
    aiLimit: 500,
    audience: "Advanced athletes",
    features: [
      "500 AI Coach messages/month",
      "Advanced competition analysis",
      "Long-term performance trends",
      "Exportable athlete reports"
    ]
  },
  {
    id: "coach",
    name: "Coach",
    price: "₹499/month · ₹4,999/year",
    aiLimit: 750,
    audience: "Coaches",
    features: [
      "750 AI Coach messages/month",
      "Coach dashboard",
      "Athlete management and monitoring",
      "Training plans, attendance and AI reports"
    ]
  },
  {
    id: "academy",
    name: "Academy",
    price: "₹799/month · ₹7,999/year",
    aiLimit: 1000,
    audience: "Clubs and academies",
    features: [
      "1,000 AI Coach messages/month",
      "Academy management",
      "Coach and athlete management",
      "Academy analytics, attendance and training workflows"
    ]
  }
];

export function getPlan(id?: string): Plan {
  return plans.find((plan) => plan.id === id) ?? plans[0];
}
