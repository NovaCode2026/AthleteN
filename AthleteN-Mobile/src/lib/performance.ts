export const MAX_SESSION_MINUTES=1440;
export function validMinutes(value:unknown){const n=Number(value);return Number.isFinite(n)&&n>=0&&n<=MAX_SESSION_MINUTES?n:0;}
export function validWeight(value:unknown){const n=Number(value);return Number.isFinite(n)&&n>0&&n<300?n:null;}
