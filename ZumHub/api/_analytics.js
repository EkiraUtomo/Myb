const state = globalThis.__ZH_ANALYTICS__ || (globalThis.__ZH_ANALYTICS__ = {
  startedAt: Date.now(), total: 0, accepted: 0, rejected: 0, blocked: 0, rateLimited: 0,
  byScript: {}, byGame: {}, byExecutor: {}, reasons: {}, recent: []
});

function key(v, fallback='unknown'){ const s=String(v||'').trim(); return s ? s.slice(0,120) : fallback; }
function bump(obj,k){ obj[k]=(obj[k]||0)+1; }
function record(event,data={}){
  state.total++;
  if(event==='verify-success') state.accepted++;
  else if(event==='verify-failed') state.rejected++;
  else if(event.includes('blocked') || event==='bad-access-key' || event==='loader-expired') state.blocked++;
  else if(event==='rate-limited') state.rateLimited++;
  bump(state.byScript,key(data.slug));
  if(data.gameName || data.gameId) bump(state.byGame,key(data.gameName || data.gameId));
  if(data.executor) bump(state.byExecutor,key(data.executor));
  if(data.reason) bump(state.reasons,key(data.reason));
  state.recent.unshift({event:String(event),at:new Date().toISOString(),slug:key(data.slug),gameId:key(data.gameId,''),gameName:key(data.gameName,''),executor:key(data.executor,''),reason:key(data.reason,'')});
  state.recent=state.recent.slice(0,40);
}
function top(obj,n=8){ return Object.entries(obj).sort((a,b)=>b[1]-a[1]).slice(0,n).map(([name,count])=>({name,count})); }
function snapshot(){
  return {ok:true, startedAt:new Date(state.startedAt).toISOString(), generatedAt:new Date().toISOString(), totals:{...state}, top:{scripts:top(state.byScript),games:top(state.byGame),executors:top(state.byExecutor),reasons:top(state.reasons)}};
}
module.exports={record,snapshot};
