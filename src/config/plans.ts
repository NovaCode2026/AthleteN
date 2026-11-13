import type { Plan } from "../types";

// Paid checkout remains server-disabled until billing, provider and cost-control acceptance is complete.
export const paidCheckoutEnabled = false;
const legacyStudentPlan: Plan = {
  id: "student", name: "Student (legacy)",
  price: "Existing subscribers only · not available for new purchases",
  aiLimit: 50, audience: "Existing approved Student subscribers",
  features: ["Existing Student entitlements are preserved", "Existing subscriptions are not repriced", "No new Student subscriptions are sold"]
};
export const plans: Plan[] = [
  { id:"free", name:"Free", price:"₹0/month · ₹0/year · GST inclusive where applicable", monthlyPrice:0, yearlyPrice:0, aiLimit:0, audience:"Every athlete", features:["Athlete profile and sporting identity","Core training logs and competition history","Medal records, goals and milestones","Calendar and Athlete Journey","Join a verified academy"] },
  { id:"pro", name:"Pro", price:"₹99/month · ₹999/year · GST inclusive where applicable", monthlyPrice:99, yearlyPrice:999, aiLimit:50, audience:"Athletes building consistent progress", features:["Everything in Free","50 AI Coach requests per month","Advanced analytics and training insights","Performance reports","Competition analysis"] },
  { id:"elite", name:"Elite", price:"₹199/month · ₹1,999/year · GST inclusive where applicable", monthlyPrice:199, yearlyPrice:1999, aiLimit:200, audience:"Competitive athletes", features:["Everything in Pro","200 AI Coach requests per month","Advanced competition analytics","Historical performance trends","Exportable reports","Priority support"] },
  { id:"coach", name:"Coach", price:"₹499/month · ₹4,999/year · GST inclusive where applicable", monthlyPrice:499, yearlyPrice:4999, aiLimit:750, audience:"Verified coaches", features:["Dedicated coach workspace","Athlete roster and progress monitoring","Training and attendance management","Coach reports and feedback","750 AI Coach requests per month"] },
  { id:"academy", name:"Academy", price:"₹799/month · ₹7,999/year · GST inclusive where applicable", monthlyPrice:799, yearlyPrice:7999, aiLimit:1000, audience:"Verified academy administrators", features:["Dedicated academy workspace","Athlete and coach management","Two included coach seats","Attendance and academy analytics","Competition and operational reports","1,000 shared AI Coach requests per month"] }
];
export function getPlan(id?: string): Plan {
  if (id === "student") return legacyStudentPlan;
  return plans.find(plan => plan.id === id) ?? plans[0];
}
