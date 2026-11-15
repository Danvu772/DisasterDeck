import { sessionUserId } from "@/auth";
import { desk } from "@/agents/desk";
import { isLocalDemo } from "@/lib/localDemo";
import { listUpdates, makeUpdate, revokeUpdate, saveUpdate } from "@/lib/family-voice";
import { voiceBody, voiceOrigin } from "@/lib/voice-http";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{"cache-control":"no-store"}});
async function coordinator(req:Request) {
  const id=await sessionUserId() ?? (isLocalDemo(req)?new URL(req.url).searchParams.get("user"):null);
  const user=id?await desk().getUser(id):null;
  return user?.role==="coordinator"?user:null;
}
export async function GET(req:Request) {
  const user=await coordinator(req); if(!user)return json({error:"Coordinator sign-in required"},403);
  const board=await desk().getBoard(user.deskId);
  return json({updates:await listUpdates(user.deskId),sites:board.sites.filter(s=>s.deskId===user.deskId).map(s=>({_id:s._id,address:s.address})),storage:process.env.MONGODB_URI?"MongoDB":"temporary demo memory"});
}
export async function POST(req:Request) {
  if(!voiceOrigin(req))return json({error:"Open this from the coordinator page"},403);
  const user=await coordinator(req); if(!user)return json({error:"Coordinator sign-in required"},403);
  try {
    const body=await voiceBody(req,8192);
    if(typeof body.reference==="string" && body.revoke===true){ await revokeUpdate(body.reference,user.deskId); return json({ok:true}); }
    if(typeof body.siteId!=="string" || typeof body.alias!=="string" || !body.alias.trim() || body.alias.length>80 ||
      typeof body.summary!=="string" || !body.summary.trim() || body.summary.length>1500 || typeof body.sourceAt!=="string" || !Number.isFinite(Date.parse(body.sourceAt)) || Date.parse(body.sourceAt)>Date.now()) return json({error:"Provide a case, display name, approved update and a valid past source timestamp"},400);
    const board=await desk().getBoard(user.deskId);
    if(!board.sites.some(s=>s._id===body.siteId && s.deskId===user.deskId))return json({error:"Case not found on your desk"},404);
    const {update,pin}=makeUpdate({deskId:user.deskId,siteId:body.siteId,alias:body.alias.trim(),summary:body.summary.trim(),sourceAt:new Date(body.sourceAt).toISOString(),publishedBy:user._id,expiresAt:new Date(Date.now()+24*3600_000).toISOString(),demo:process.env.DEMO_MODE==="1"});
    await saveUpdate(update);
    return json({reference:update._id,pin,expiresAt:update.expiresAt},201);
  } catch {return json({error:"Could not publish the update"},500);}
}
