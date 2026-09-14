import type { Plan } from "../types";

export const plans: Plan[] = [
  {
    id: "free",
    name: "Free",
    price: "₹0",
    aiLimit: 0,
    audience: "New athletes",
    features: ["Core dashboard", "Training and medals", "Secure documents", "No AI Coach access"]
  },
  {
    id: "student",
    name: "Student",
    price: "₹49/month · ₹459/year",
    aiLimit: 50,
    audience: "Verified students",
    features: ["Student verification", "50 AI coach messages", "Resume PDF readiness", "Priority roadmap voting"]
  },
  {
    id: "pro",
    name: "Athlete",
    price: "₹99/month · ₹899/year",
    aiLimit: 100,
    audience: "Competitive athletes",
    features: ["100 AI coach messages", "Advanced analytics", "Goal tracking", "Referral rewards"]
  },
  {
    id: "champion",
    name: "Coach",
    price: "₹159/month · ₹1,499/year",
    aiLimit: 500,
    audience: "Coaches and trainers",
    features: ["500 AI coach messages", "Performance reports", "Athlete management", "Coach workflows"]
  },
  {
    id: "academy",
    name: "Organization",
    price: "₹550/month · ₹5,699/year",
    aiLimit: 2000,
    audience: "Clubs and academies",
    features: ["2,000 AI coach messages", "Organization dashboard", "Team analytics", "Bulk verification"]
  }
];

export function getPlan(id?: string): Plan {
  return plans.find((plan) => plan.id === id) ?? plans[0];
}
