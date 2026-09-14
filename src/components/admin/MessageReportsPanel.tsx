import { useEffect, useState } from "react";
import { Flag, RefreshCw } from "lucide-react";
import { requireSupabase } from "../../lib/supabase";

type Report = { id: string; reporter_user_id: string; reported_user_id?: string | null; conversation_id?: string | null; message_id?: string | null; reason: string; details?: string | null; status: "open" | "reviewing" | "resolved" | "dismissed"; created_at: string };

export default function MessageReportsPanel() {
  const supabase = requireSupabase();
  const [rows,setRows]=useState<Report[]>([]); const [loading,setLoading]=useState(false); const [error,setError]=useState("");
  async function load(){setLoading(true);setError("");const {data,error:queryError}=await supabase.from("message_reports").select("*").order("created_at",{ascending:false}).limit(50);if(queryError)setError(queryError.message);setRows((data??[]) as Report[]);setLoading(false);}
  useEffect(()=>{void load();},[]);
  async function updateStatus(row:Report,status:Report["status"]){const {error:updateError}=await supabase.from("message_reports").update({status,updated_at:new Date().toISOString()}).eq("id",row.id);if(updateError){setError(updateError.message);return;}await load();}
  return <section className="card panel"><div className="inline-actions"><div><span className="eyebrow">Trust & safety</span><h3><Flag size={17}/> Message reports</h3><p>Review reports submitted from athlete messaging.</p></div><button className="btn" onClick={()=>void load()} disabled={loading}><RefreshCw size={15}/> {loading?"Refreshing...":"Refresh"}</button></div>{error&&<p className="notice" role="alert">{error}</p>}{rows.length===0&&!loading&&<p className="empty-copy">No message reports.</p>}{rows.length>0&&<div className="table-wrap"><table><thead><tr><th>Reason</th><th>Details</th><th>Reported user</th><th>Status</th><th>Created</th></tr></thead><tbody>{rows.map((row)=><tr key={row.id}><td>{row.reason}</td><td>{row.details||"—"}</td><td>{row.reported_user_id?.slice(0,8)||"—"}</td><td><select value={row.status} onChange={(e)=>void updateStatus(row,e.target.value as Report["status"])}><option value="open">Open</option><option value="reviewing">Reviewing</option><option value="resolved">Resolved</option><option value="dismissed">Dismissed</option></select></td><td>{new Date(row.created_at).toLocaleString()}</td></tr>)}</tbody></table></div>}</section>;
}
