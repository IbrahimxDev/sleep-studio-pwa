export const formatDuration = minutes => `${Math.floor(Math.max(0, minutes) / 60)}h ${Math.max(0, minutes) % 60}m`;
export function dateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
export function clockTime(date) { return `${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`; }
export function displayTime(value) {
  const [hours,minutes] = value.split(':').map(Number);
  return [(hours % 12 || 12)+':'+String(minutes).padStart(2,'0'), hours >= 12 ? 'PM' : 'AM'];
}
export function durationBetween(bedtime, wakeTime) {
  const parse = value => { if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) throw new Error('Choose valid times.'); const [h,m] = value.split(':').map(Number); return h*60+m; };
  const duration = (parse(wakeTime)-parse(bedtime)+1440)%1440;
  if (!duration) throw new Error('Bedtime and wake-up time must differ.');
  return duration;
}
export function nextAlarm(wake, now = new Date()) {
  const [h,m] = wake.split(':').map(Number), due = new Date(now);
  due.setHours(h,m,0,0); if (due <= now) due.setDate(due.getDate()+1); return due.getTime();
}
export function rhythmStats(entries, goal = 8) {
  if (!entries.length) return {average:0,atGoal:0,total:0,regularity:null};
  const minutes = entries.map(e=>Math.max(0,Number(e.minutes)||0));
  // Shift noon to zero so nearby bedtimes across midnight remain nearby.
  const bedtimes = entries.map(e=>{const [h,m]=(e.bed||'00:00').split(':').map(Number);return (h*60+m+720)%1440});
  const mean=bedtimes.reduce((a,b)=>a+b,0)/bedtimes.length;
  return {average:Math.round(minutes.reduce((a,b)=>a+b,0)/minutes.length),atGoal:minutes.filter(m=>m>=goal*60).length,total:minutes.reduce((a,b)=>a+b,0),regularity:bedtimes.length>1?Math.round(Math.sqrt(bedtimes.reduce((sum,t)=>sum+(t-mean)**2,0)/bedtimes.length)):null};
}
export function escapeHTML(value) { return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
export function habitComparisons(entries) {
  return ['Exercise','Caffeine','Alcohol','Stress','Late screen','Travel'].map(factor=>{
    const withFactor=entries.filter(e=>(e.factors||[]).includes(factor)),without=entries.filter(e=>!(e.factors||[]).includes(factor));
    if(withFactor.length<3||without.length<3)return null;
    const average=values=>values.reduce((sum,e)=>sum+Math.max(0,Number(e.minutes)||0),0)/values.length;
    return {factor,withCount:withFactor.length,withoutCount:without.length,difference:Math.round(average(withFactor)-average(without)),restedWith:withFactor.filter(e=>e.mood==='Rested').length};
  }).filter(Boolean);
}
