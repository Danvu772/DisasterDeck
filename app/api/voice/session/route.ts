import { checkPin, getUpdate, issueTicket, limitVoice } from "@/lib/family-voice";
import { voiceBody, voiceOrigin } from "@/lib/voice-http";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{"cache-control":"no-store"}});
export async function POST(req:Request) {
  if(!voiceOrigin(req))return json({error:"Open this from the family voice page"},403);
  if(Number(req.headers.get("content-length")??0)>2048)return json({error:"Request too large"},413);
  try {
    const body=await voiceBody(req);
    if(typeof body.reference!=="string" || !/^[a-f0-9]{16}$/.test(body.reference) || typeof body.pin!=="string" || !/^\d{8}$/.test(body.pin))return json({error:"Enter the reference and eight-digit PIN supplied by the coordinator"},400);
    // Per-reference limits cannot be bypassed by forging proxy IP headers.
    if(limitVoice("attempt:"+body.reference,6,15*60_000) || limitVoice("sessions-global",60,3600_000))return json({error:"Please wait before trying again"},429);
    const doc=await getUpdate(body.reference);
    if(!doc || !checkPin(doc,body.pin))return json({error:"Reference or PIN is invalid, expired or revoked"},403);
    const key=process.env.ELEVENLABS_API_KEY,agent=process.env.ELEVENLABS_FAMILY_AGENT_ID;
    if(!key || !agent)return json({error:"Voice service setup is incomplete. Ask the coordinator to configure ElevenLabs."},503);
    const ticket=issueTicket(doc._id);
    const response=await fetch("https://api.elevenlabs.io/v1/convai/conversation/token?agent_id="+encodeURIComponent(agent),{headers:{"xi-api-key":key},signal:AbortSignal.timeout(15_000),cache:"no-store"});
    if(!response.ok)return json({error:"Voice provider could not start the conversation"},502);
    const data=await response.json();
    if(typeof data.token!=="string")return json({error:"Voice provider returned an invalid session"},502);
    return json({token:data.token,ticket,expiresInSeconds:600,demo:doc.demo});
  }catch{return json({error:"Unable to start the call"},503);}
}
