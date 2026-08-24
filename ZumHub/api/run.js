const { decrypt, accessKeyOk, safeSlug } = require('../locker/crypto');
const { getDb } = require('./_github');
module.exports=async(req,res)=>{
  res.setHeader('Cache-Control','no-store, no-cache, must-revalidate, proxy-revalidate');res.setHeader('Pragma','no-cache');res.setHeader('Expires','0');
  const slug=String(req.query?.slug||'').toLowerCase(), key=String(req.query?.key||'');
  if(!safeSlug(slug)||!key)return res.status(404).send('not found');
  try{const db=await getDb(),item=db.scripts[slug];if(!item||!item.enabled||!accessKeyOk(key,item.accessKeyHash))return res.status(404).send('not found');if(item.expiresAt&&Date.now()>=new Date(item.expiresAt).getTime())return res.status(410).send('expired');res.setHeader('Content-Type','text/plain; charset=utf-8');return res.send(decrypt(item.payload));}catch(e){console.error(e);return res.status(404).send('not found');}
};
