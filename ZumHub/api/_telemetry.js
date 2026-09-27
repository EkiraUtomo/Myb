const WEBHOOK_URL = String(process.env.DISCORD_WEBHOOK_URL || '').trim();
const TIMEOUT_MS = 4500;
const recent = new Map();
const { enrich } = require('./_roblox');
const { record } = require('./_analytics');
function redact(value,max=500){return String(value??'').replace(/[\r\n\t]+/g,' ').slice(0,max)}
function field(name,value,inline=true){return {name:redact(name,256),value:redact(value||'—',1024),inline}}
function colour(e){if(e==='verify-success')return 0x4ade80;if(e.includes('ban')||e.includes('blocked')||e.includes('failed')||e==='verify-error')return 0xf87171;if(e==='execution-start')return 0x60a5fa;return 0xa07ee0}
function maskIp(ip){const s=String(ip||'unknown'); if(s.includes('.')){const p=s.split('.'); if(p.length===4)return `${p[0]}.${p[1]}.${p[2]}.xxx`;} if(s.includes(':'))return s.split(':').slice(0,3).join(':')+':…'; return s}
async function postWebhook(payload){if(!WEBHOOK_URL)return false;const c=new AbortController(),t=setTimeout(()=>c.abort(),TIMEOUT_MS);try{const r=await fetch(WEBHOOK_URL,{method:'POST',signal:c.signal,headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});return r.ok||r.status===204}catch{return false}finally{clearTimeout(t)}}
async function emit(event,data={}){
  record(event,data);
  if(!WEBHOOK_URL)return false;
  const key=`${event}:${data.ip||'unknown'}:${data.slug||''}`; const now=Date.now(); const last=recent.get(key)||0; const dedupeMs=Number(process.env.DISCORD_WEBHOOK_DEDUPE_MS||5000);
  if(now-last<dedupeMs)return false; recent.set(key,now); if(recent.size>1000)for(const[k,t]of recent)if(now-t>dedupeMs*2)recent.delete(k);
  const d=await enrich(data); const u=d.userProfile,g=d.gameProfile,geo=d.geo;
  const result=event==='verify-success'?'ACCEPTED':(event==='verify-failed'?'REJECTED':event.includes('blocked')||event==='bad-access-key'?'BLOCKED':event==='rate-limited'?'RATE LIMITED':'INFO');
  const fields=[];
  fields.push(field('Result',result)); fields.push(field('Script',d.slug)); fields.push(field('Request ID',d.reqId));
  if(u){fields.push(field('Player',u.displayName||u.username));fields.push(field('Username',u.username?`@${u.username}`:'—'));fields.push(field('User ID',u.userId));if(u.created){const days=Math.max(0,Math.floor((Date.now()-new Date(u.created).getTime())/86400000));fields.push(field('Account age',`${days} days`));}}
  if(g){fields.push(field('Game',g.name));fields.push(field('Universe ID',g.universeId));if(g.rootPlaceId)fields.push(field('Root Place',g.rootPlaceId));if(g.creator)fields.push(field('Creator',g.creator));}
  if(d.gameId&&!g)fields.push(field('Game ID',d.gameId)); if(d.placeId)fields.push(field('Place ID',d.placeId));
  if(d.executor)fields.push(field('Executor',d.executor)); if(d.executorSecondary)fields.push(field('Executor #2',d.executorSecondary));
  if(d.capabilities)fields.push(field('Capabilities',d.capabilities,false));
  if(geo){fields.push(field('Location', [geo.city,geo.region,geo.country].filter(Boolean).join(', ')));fields.push(field('Country',geo.countryCode?`${geo.country} (${geo.countryCode})`:geo.country));if(geo.isp)fields.push(field('ISP / ASN',`${geo.isp}${geo.asn?` / AS${geo.asn}`:''}`,false));}
  fields.push(field('IP',process.env.DISCORD_SHOW_RAW_IP==='true'?d.ip:maskIp(d.ip)));
  if(d.reason)fields.push(field('Reason',d.reason,false)); if(d.fingerprint)fields.push(field('Fingerprint',d.fingerprint)); if(d.userAgent&&process.env.DISCORD_SHOW_USER_AGENT==='true')fields.push(field('User-Agent',d.userAgent,false));
  const checks=d.checks||[]; if(checks.length)fields.push(field('Verification checks',checks.join('\n'),false));
  const payload={username:process.env.DISCORD_WEBHOOK_USERNAME||'ZumHub Security',allowed_mentions:{parse:[]},embeds:[{title:`ZumHub Security • ${result}`,description:d.description?redact(d.description,2000):`Event: ${event}`,color:colour(event),fields:fields.slice(0,25),thumbnail:u?.avatarUrl?{url:u.avatarUrl}:undefined,image:g?.iconUrl?{url:g.iconUrl}:undefined,footer:{text:'ZumHub security telemetry • client-reported fields are not authoritative'},timestamp:new Date().toISOString()}]};
  const ok=await postWebhook(payload); if(!ok)console.warn(`[webhook-failed] event=${event} slug=${redact(d.slug,64)} ip=${redact(d.ip,64)}`); return ok;
}
module.exports={emit};
