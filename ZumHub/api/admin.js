const { encrypt, safeSlug, newAccessKey } = require('../locker/crypto');
const { getDb, saveDb } = require('./_github');
const { validSession } = require('./_auth');
module.exports = async (req,res)=>{
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST')return res.status(405).json({error:'POST only'});
  if(!validSession(req))return res.status(401).json({error:'Authentication required.'});
  try{
    const {action='upsert',slug,source,enabled=true,expiresAt=null,description='',regenerateKey=false}=req.body||{};
    if(!safeSlug(slug))return res.status(400).json({error:'Slug must be 2-64 chars: letters, numbers, _ or -.'});
    const db=await getDb();
    if(action==='delete'){delete db.scripts[slug];await saveDb(db.scripts,db.sha,`locker: delete ${slug}`);return res.json({ok:true,slug,deleted:true});}
    if(typeof source!=='string'||!source.length)return res.status(400).json({error:'Source is required.'});
    if(source.length>1024*1024)return res.status(413).json({error:'Source exceeds 1 MiB.'});
    const old=db.scripts[slug];
    const accessKey=old?.accessKeyHash&&!regenerateKey?null:newAccessKey();
    db.scripts[slug]={v:2,payload:encrypt(source),accessKeyHash:accessKey?require('../locker/crypto').hashAccessKey(accessKey):old.accessKeyHash,enabled:!!enabled,expiresAt:expiresAt||null,description:String(description).slice(0,300),updatedAt:new Date().toISOString()};
    await saveDb(db.scripts,db.sha,`locker: upsert ${slug}`);
    return res.json({ok:true,slug,regenerated:!!accessKey,accessKey:accessKey||null});
  }catch(e){console.error(e);return res.status(500).json({error:e.message||'Server error'});}
};
