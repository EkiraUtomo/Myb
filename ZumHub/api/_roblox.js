const TIMEOUT_MS = 2500;
async function getJson(url){
  const c=new AbortController(); const t=setTimeout(()=>c.abort(),TIMEOUT_MS);
  try{ const r=await fetch(url,{signal:c.signal,headers:{'User-Agent':'ZumHub-Security/2.0'}}); if(!r.ok)return null; return await r.json(); }
  catch{return null} finally{clearTimeout(t)}
}
async function user(userId){
  if(!/^\d+$/.test(String(userId||''))) return null;
  const d=await getJson(`https://users.roblox.com/v1/users/${encodeURIComponent(userId)}`);
  const t=await getJson(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${encodeURIComponent(userId)}&size=150x150&format=Png&isCircular=false`);
  const x=t?.data?.[0];
  return d?{userId:String(d.id),username:d.name||'',displayName:d.displayName||'',created:d.created||null,avatarUrl:x?.imageUrl||null}:null;
}
async function game(universeId){
  if(!/^\d+$/.test(String(universeId||''))) return null;
  const d=await getJson(`https://games.roblox.com/v1/games?universeIds=${encodeURIComponent(universeId)}`);
  const g=d?.data?.[0];
  const t=await getJson(`https://thumbnails.roblox.com/v1/games/icons?universeIds=${encodeURIComponent(universeId)}&size=512x512&format=Png&isCircular=false`);
  return g?{universeId:String(g.id),name:g.name||'',creator:g.creator?.name||'',rootPlaceId:g.rootPlaceId?String(g.rootPlaceId):'',avatarType:g.universeAvatarType||'',iconUrl:t?.data?.[0]?.imageUrl||null}:null;
}
async function geo(ip){
  if(!ip || ip==='unknown' || /^(10\.|127\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(ip)) return null;
  const d=await getJson(`https://ipwho.is/${encodeURIComponent(ip)}`);
  if(!d?.success)return null;
  return {country:d.country||'',countryCode:d.country_code||'',region:d.region||'',city:d.city||'',isp:d.connection?.isp||'',org:d.connection?.org||'',asn:d.connection?.asn?String(d.connection.asn):''};
}
async function enrich(data){
  const [u,g,geoData]=await Promise.all([user(data.userId),game(data.gameId),geo(data.ip)]);
  return {...data,userProfile:u,gameProfile:g,geo:geoData};
}
const checkCache=new Map();
const CHECK_TTL_MS=10*60*1000;
function cached(key,fn){
  const hit=checkCache.get(key);
  if(hit&&hit.exp>Date.now())return Promise.resolve(hit.v);
  return fn().then(v=>{
    if(v!==null){ if(checkCache.size>2000)checkCache.clear(); checkCache.set(key,{v,exp:Date.now()+CHECK_TTL_MS}); }
    return v;
  });
}
async function status(url){
  const c=new AbortController(); const t=setTimeout(()=>c.abort(),TIMEOUT_MS);
  try{ const r=await fetch(url,{signal:c.signal,headers:{'User-Agent':'ZumHub-Security/2.0'}}); return {status:r.status,json:r.ok?await r.json().catch(()=>null):null}; }
  catch{ return null } finally{ clearTimeout(t) }
}
// true / false when Roblox answers definitively, null when it cannot be checked.
function placeBelongsToUniverse(placeId,universeId){
  if(!/^[1-9]\d*$/.test(String(placeId))||!/^[1-9]\d*$/.test(String(universeId)))return Promise.resolve(null);
  return cached(`pu:${placeId}`,async()=>{
    const r=await status(`https://apis.roblox.com/universes/v1/places/${encodeURIComponent(placeId)}/universe`);
    if(!r||r.status!==200||!r.json||r.json.universeId==null)return null;
    return String(r.json.universeId);
  }).then(found=>found===null?null:String(found)===String(universeId));
}
function userExists(userId){
  if(!/^[1-9]\d*$/.test(String(userId)))return Promise.resolve(null);
  return cached(`u:${userId}`,async()=>{
    const r=await status(`https://users.roblox.com/v1/users/${encodeURIComponent(userId)}`);
    if(!r)return null;
    if(r.status===200)return true;
    if(r.status===404)return false;
    return null;
  });
}
module.exports={enrich,placeBelongsToUniverse,userExists};
