import { TTSRoom } from "./room.js";

const json = (data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","access-control-allow-origin":"*","access-control-allow-headers":"content-type, authorization","access-control-allow-methods":"GET,POST,OPTIONS"}});

async function hashPassword(p){const b=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(p));return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,"0")).join("")}
async function token(payload,secret){const body=btoa(JSON.stringify({...payload,exp:Date.now()+7*86400000})).replaceAll("=","");const sig=await crypto.subtle.sign("HMAC",await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]),new TextEncoder().encode(body));return body+"."+btoa(String.fromCharCode(...new Uint8Array(sig))).replaceAll("=","")}
async function verify(t,secret){try{const [body,s]=t.split(".");if(!body||!s)return null;const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["verify"]);const ok=await crypto.subtle.verify("HMAC",key,Uint8Array.from(atob(s),c=>c.charCodeAt(0)),new TextEncoder().encode(body));const p=JSON.parse(atob(body));return ok&&p.exp>Date.now()?p:null}catch{return null}}
function auth(req){const h=req.headers.get("authorization")||"";return h.startsWith("Bearer ")?h.slice(7):null}

export { TTSRoom };

export default {
 async fetch(req,env){
  if(req.method==="OPTIONS")return new Response(null,{headers:{"access-control-allow-origin":"*","access-control-allow-headers":"content-type, authorization","access-control-allow-methods":"GET,POST,OPTIONS"}});
  const url=new URL(req.url);
  if(url.pathname==="/api/health")return json({ok:true,app:"KH TTS Streamer",time:new Date().toISOString()});
  if(url.pathname==="/api/auth/register"&&req.method==="POST"){
   const b=await req.json(); if(!b.username||!b.password)return json({error:"ត្រូវការឈ្មោះ និងពាក្យសម្ងាត់"},400);
   const exists=await env.DB.prepare("SELECT id FROM streamers WHERE username=?").bind(b.username).first(); if(exists)return json({error:"ឈ្មោះនេះមានរួចហើយ"},409);
   const hash=await hashPassword(b.password);
   const r=await env.DB.prepare("INSERT INTO streamers(username,password_hash,display_name) VALUES(?,?,?)").bind(b.username,hash,b.displayName||b.username).run();
   const id=r.meta.last_row_id; await env.DB.prepare("INSERT INTO settings(streamer_id) VALUES(?)").bind(id).run();
   return json({ok:true,token:await token({id,username:b.username},env.SESSION_SECRET)});
  }
  if(url.pathname==="/api/auth/login"&&req.method==="POST"){
   const b=await req.json();const u=await env.DB.prepare("SELECT * FROM streamers WHERE username=?").bind(b.username||"").first();if(!u||u.password_hash!==await hashPassword(b.password||""))return json({error:"ព័ត៌មាន Login មិនត្រឹមត្រូវ"},401);
   return json({ok:true,token:await token({id:u.id,username:u.username},env.SESSION_SECRET),displayName:u.display_name});
  }
  const t=auth(req), user=t?await verify(t,env.SESSION_SECRET):null;
  if(url.pathname==="/api/settings"&&req.method==="GET"){
   if(!user)return json({error:"ត្រូវ Login"},401);const s=await env.DB.prepare("SELECT * FROM settings WHERE streamer_id=?").bind(user.id).first();return json(s||{});
  }
  if(url.pathname==="/api/settings"&&req.method==="POST"){
   if(!user)return json({error:"ត្រូវ Login"},401);const b=await req.json();await env.DB.prepare("UPDATE settings SET voice=?,rate=?,pitch=?,volume=?,filter_enabled=?,blocked_words=? WHERE streamer_id=?").bind(b.voice||"",Number(b.rate||1),Number(b.pitch||1),Number(b.volume??1),b.filterEnabled===false?0:1,JSON.stringify(b.blockedWords||[]),user.id).run();return json({ok:true});
  }
  if(url.pathname==="/api/tts"&&req.method==="POST"){
   if(!user)return json({error:"ត្រូវ Login"},401);const b=await req.json();if(!b.message?.trim())return json({error:"សារទទេ"},400);
   const s=await env.DB.prepare("SELECT * FROM settings WHERE streamer_id=?").bind(user.id).first();let msg=b.message.trim();
   const blocked=JSON.parse(s?.blocked_words||"[]");if(s?.filter_enabled){for(const w of blocked)msg=msg.replaceAll(String(w),"***")}
   const r=await env.DB.prepare("INSERT INTO tts_events(streamer_id,message,status,donation_amount,donation_currency) VALUES(?,?,?,?,?)").bind(user.id,msg,"queued",Number(b.amount||0),b.currency||"USD").run();
   const id=env.ROOM.idFromName(String(user.id));const room=env.ROOM.get(id);await room.fetch(new Request("https://room/publish",{method:"POST",body:JSON.stringify({type:"tts",id:r.meta.last_row_id,message:msg,amount:Number(b.amount||0)})}));
   return json({ok:true,id:r.meta.last_row_id,message:msg});
  }
  if(url.pathname==="/api/events"&&req.method==="GET"){
   if(!user)return json({error:"ត្រូវ Login"},401);const rows=await env.DB.prepare("SELECT * FROM tts_events WHERE streamer_id=? ORDER BY id DESC LIMIT 50").bind(user.id).all();return json(rows.results||[]);
  }
  if(url.pathname==="/api/webhook/donation"&&req.method==="POST"){
   const secret=req.headers.get("x-webhook-secret");if(!env.DONATION_WEBHOOK_SECRET||secret!==env.DONATION_WEBHOOK_SECRET)return json({error:"Unauthorized"},401);
   const b=await req.json();if(!b.streamerId||!b.message)return json({error:"Invalid"},400);
   const r=await env.DB.prepare("INSERT INTO tts_events(streamer_id,message,status,donation_amount,donation_currency) VALUES(?,?,?,?,?)").bind(Number(b.streamerId),String(b.message),"queued",Number(b.amount||0),b.currency||"USD").run();
   const room=env.ROOM.get(env.ROOM.idFromName(String(b.streamerId)));await room.fetch(new Request("https://room/publish",{method:"POST",body:JSON.stringify({type:"tts",id:r.meta.last_row_id,message:b.message,amount:Number(b.amount||0)})}));
   return json({ok:true,id:r.meta.last_row_id});
  }
  if(url.pathname==="/api/obs"){
   const id=url.searchParams.get("streamer");if(!id)return json({error:"Missing streamer"},400);const room=env.ROOM.get(env.ROOM.idFromName(id));return room.fetch(req);
  }
  const asset=await env.ASSETS.fetch(req);return asset.status===404?env.ASSETS.fetch(new Request(new URL("/",req.url))):asset;
 }
};