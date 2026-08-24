const crypto = require('crypto');
function b64u(buf){return Buffer.from(buf).toString('base64url')}
function fromB64u(v){return Buffer.from(String(v||''),'base64url')}
function masterKey(){const s=process.env.LOCKER_MASTER_SECRET;if(!s||s.length<32)throw new Error('LOCKER_MASTER_SECRET must be at least 32 characters.');return crypto.createHash('sha256').update(s).digest()}
function encrypt(plain){const iv=crypto.randomBytes(12);const c=crypto.createCipheriv('aes-256-gcm',masterKey(),iv);const ct=Buffer.concat([c.update(Buffer.from(plain,'utf8')),c.final()]);return `${b64u(iv)}.${b64u(c.getAuthTag())}.${b64u(ct)}`}
function decrypt(blob){const p=String(blob).split('.');if(p.length!==3)throw new Error('Invalid encrypted payload.');const d=crypto.createDecipheriv('aes-256-gcm',masterKey(),fromB64u(p[0]));d.setAuthTag(fromB64u(p[1]));return Buffer.concat([d.update(fromB64u(p[2])),d.final()]).toString('utf8')}
function hashAccessKey(key){return crypto.createHash('sha256').update(String(key)).digest('hex')}
function newAccessKey(){return b64u(crypto.randomBytes(32))}
function accessKeyOk(key,hash){const a=Buffer.from(hashAccessKey(key),'hex'),b=Buffer.from(String(hash||''),'hex');return a.length===b.length&&a.length>0&&crypto.timingSafeEqual(a,b)}
function safeSlug(slug){return /^[a-z0-9][a-z0-9_-]{1,63}$/i.test(slug||'')}
module.exports={encrypt,decrypt,hashAccessKey,newAccessKey,accessKeyOk,safeSlug};
