export const ACADEMY_NAV_KEY='athleten.academy-navigation.v1';
export const ACADEMY_NAV_DEFAULT=['Dashboard','People','Coaches','Training','Attendance','Events'] as const;
export const ACADEMY_NAV_AVAILABLE=[
 {id:'Dashboard',label:'Dashboard',icon:'dashboard'},
 {id:'People',label:'People',icon:'people'},
 {id:'Coaches',label:'Coaches',icon:'coach'},
 {id:'Training',label:'Training',icon:'training'},
 {id:'Attendance',label:'Attendance',icon:'calendar'},
 {id:'Events',label:'Events',icon:'event'},
 {id:'Calendar',label:'Calendar',icon:'calendar'},
 {id:'Intelligence',label:'Intelligence',icon:'ai'},
 {id:'Achievements',label:'Achievements',icon:'medal'},
 {id:'Approvals',label:'Approvals',icon:'shield'},
 {id:'Communication',label:'Communication',icon:'message'},
 {id:'Documents',label:'Documents',icon:'file-document-outline'},
 {id:'Finance',label:'Finance',icon:'finance'},
 {id:'AI',label:'AI',icon:'ai'},
] as const;

export function normalizeAcademyNavigation(ids:string[]):string[]{
 const valid=[...new Set(ids.filter(id=>ACADEMY_NAV_AVAILABLE.some(item=>item.id===id)))];
 return [...valid,...ACADEMY_NAV_DEFAULT.filter(id=>!valid.includes(id))].slice(0,6);
}
