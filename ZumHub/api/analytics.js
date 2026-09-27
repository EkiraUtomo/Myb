const { validSession } = require('./_auth');
const { checkAdmin } = require('./_ratelimit');
const { snapshot } = require('./_analytics');
module.exports = async (req,res)=>{
  res.setHeader('Cache-Control','no-store'); res.setHeader('X-Content-Type-Options','nosniff');
  const rl=checkAdmin(req); if(!rl.allowed){res.setHeader('Retry-After',String(rl.resetIn));return res.status(429).json({error:'too many requests'})}
  if(!validSession(req)) return res.status(401).json({error:'Authentication required.'});
  if(req.method!=='GET') return res.status(405).json({error:'GET only'});
  return res.json(snapshot());
};
