export type QuestCadence = "daily" | "weekly" | "monthly";
export type AthleteQuest = { key: string; cadence: QuestCadence; title: string; description: string };

export const ATHLETE_QUESTS: AthleteQuest[] = [
 { key:"daily-plan-check", cadence:"daily", title:"Review today’s plan", description:"Choose a realistic priority for the day. Rest and recovery days count." },
 { key:"daily-reflection", cadence:"daily", title:"Capture one takeaway", description:"Note one thing you learned from practice, competition or recovery." },
 { key:"weekly-goal-review", cadence:"weekly", title:"Review a personal goal", description:"Check whether one goal still fits your priorities and adjust it if needed." },
 { key:"weekly-readiness-check", cadence:"weekly", title:"Check your readiness", description:"Review your event checklist or organise one part of your athlete records." },
 { key:"monthly-season-review", cadence:"monthly", title:"Reflect on your month", description:"Record one highlight and one lesson from the month." }
];

function localDateKey(date: Date) {
 return [date.getFullYear(),String(date.getMonth()+1).padStart(2,"0"),String(date.getDate()).padStart(2,"0")].join("-");
}
function isoWeekKey(date: Date) {
 const value = new Date(Date.UTC(date.getFullYear(),date.getMonth(),date.getDate()));
 const day=value.getUTCDay()||7;
 value.setUTCDate(value.getUTCDate()+4-day);
 const yearStart=new Date(Date.UTC(value.getUTCFullYear(),0,1));
 const week=Math.ceil((((value.getTime()-yearStart.getTime())/86400000)+1)/7);
 return `${value.getUTCFullYear()}-W${String(week).padStart(2,"0")}`;
}
export function getQuestPeriodKey(cadence: QuestCadence,date=new Date()) {
 if(cadence==="daily")return localDateKey(date);
 if(cadence==="weekly")return isoWeekKey(date);
 return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}`;
}
