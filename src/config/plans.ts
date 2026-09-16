import type { Plan } from "../types";

export const plans: Plan[] = [
  {
    id: "free",
    name: "Free Athlete",
    price: "₹0",
    aiLimit: 0,
    audience: "Athletes",
    features: ["Core athlete dashboard", "Training and medals", "Secure documents", "Taekwondo Kyorugi and Poomsae support"]
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
    name: "Individual Coach",
    price: "₹149/month · ₹1,499/year",
    aiLimit: 500,
    audience: "Independent coaches",
    features: ["Coach dashboard", "Athlete roster and management", "Training assignments and feedback", "Competition, belt and weight workflows"]
  },
  {
    id: "academy",
    name: "Academy",
    price: "₹550/month · ₹5,699/year",
    aiLimit: 2000,
    audience: "Clubs and academies",
    features: ["Academy dashboard", "2 coach seats included", "Athlete and coach management", "Academy-wide analytics and workflows", "Additional coach seats: ₹349 activation + ₹100/month"]
  }
];

export function getPlan(id?: string): Plan { return plans.find((plan) => plan.id === id) ?? plans[0]; }
