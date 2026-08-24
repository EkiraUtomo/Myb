const { decrypt, accessKeyOk, safeSlug } = require('../locker/crypto');
const { getScript } = require('./_github');
module.exports=async(req,res)=>{
  res.setHeader('Cache-Control','no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma','no-cache');res.setHeader('Expires','0');res.setHeader('X-Content-Type-Options','nosniff');
  const slug=String(req.query?.slug||'').toLowerCase(), key=String(req.query?.key||'');
  if(!safeSlug(slug)||!key)return res.status(404).send('not found');
  try {
    const {item}=await getScript(slug);
    if(!item||!item.enabled||!accessKeyOk(key,item.accessKeyHash))return res.status(404).send('not found');
    if(item.expiresAt&&Date.now()>=new Date(item.expiresAt).getTime())return res.status(410).send('expired');
    res.setHeader('Content-Type','text/plain; charset=utf-8');
    res.setHeader('Content-Disposition','inline');
    return res.send(decrypt(item.payload));
  } catch(e) { console.error(e); return res.status(404).send('not found'); }
};
