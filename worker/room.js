export class TTSRoom {
 constructor(ctx,env){this.ctx=ctx;this.env=env}
 async fetch(req){
  if(new URL(req.url).pathname==="/publish"){
   const msg=await req.text();for(const ws of this.ctx.getWebSockets())try{ws.send(msg)}catch{}return new Response("ok")
  }
  if(req.headers.get("Upgrade")!=="websocket")return new Response("WebSocket required",{status:426});
  const pair=new WebSocketPair();const [client,server]=Object.values(pair);this.ctx.acceptWebSocket(server);server.send(JSON.stringify({type:"connected"}));return new Response(null,{status:101,webSocket:client})
 }
}