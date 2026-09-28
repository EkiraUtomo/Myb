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
module.exports={enrich};
