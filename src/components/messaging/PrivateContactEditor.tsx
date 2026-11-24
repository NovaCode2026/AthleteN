import { useEffect, useState } from "react";
import { requireSupabase } from "../../lib/supabase";
import { useAuth } from "../../hooks/useAuth";

type Props = { contactUserId?: string; originalName?: string };

export default function PrivateContactEditor({ contactUserId, originalName }: Props) {
  const auth = useAuth();
  const supabase = requireSupabase();
  const ownerUserId = auth.user?.id;
  const [nickname, setNickname] = useState("");
  const [note, setNote] = useState("");
  const [relationship, setRelationship] = useState("");
  const [organization, setOrganization] = useState("");
  const [labels, setLabels] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      if (!ownerUserId || !contactUserId || ownerUserId === contactUserId) return;
      const { data, error } = await supabase
        .from("messaging_private_contacts")
        .select("nickname,personal_note,relationship_label,organization_label,custom_labels")
        .eq("owner_user_id", ownerUserId)
        .eq("contact_user_id", contactUserId)
        .maybeSingle();
      if (!active) return;
      if (error) { setStatus("Private contact details are not available yet."); return; }
      setNickname(data?.nickname || "");
      setNote(data?.personal_note || "");
      setRelationship(data?.relationship_label || "");
      setOrganization(data?.organization_label || "");
      setLabels(Array.isArray(data?.custom_labels) ? data.custom_labels.join(", ") : "");
    }
    void load();
    return () => { active = false; };
  }, [ownerUserId, contactUserId, supabase]);

  if (!contactUserId || !ownerUserId || ownerUserId === contactUserId) return null;

  async function save() {
    if (!ownerUserId || !contactUserId || busy) return;
    setBusy(true); setStatus("");
    const customLabels = [...new Set(labels.split(",").map(value => value.trim()).filter(Boolean))].slice(0, 20);
    const { error } = await supabase.from("messaging_private_contacts").upsert({
      owner_user_id: ownerUserId,
      contact_user_id: contactUserId,
      nickname: nickname.trim() || null,
      personal_note: note.trim() || null,
      relationship_label: relationship.trim() || null,
      organization_label: organization.trim() || null,
      custom_labels: customLabels,
    }, { onConflict: "owner_user_id,contact_user_id" });
    setBusy(false);
    setStatus(error ? "Could not save private details. Check that the messaging update is available." : "Saved privately.");
  }

  return <details className="messaging-create" style={{ marginTop: 10 }}>
    <summary style={{ cursor: "pointer", fontWeight: 600 }}>Private contact details · only visible to you</summary>
    <p className="messaging-help">Your nickname and notes are private. Other members continue seeing this person's AthleteN identity.</p>
    <label className="messaging-help">Private nickname<input aria-label="Private nickname" maxLength={60} value={nickname} onChange={event => setNickname(event.target.value)} placeholder={originalName || "Nickname"} /></label>
    <label className="messaging-help">Personal note<textarea aria-label="Private contact note" maxLength={1000} rows={2} value={note} onChange={event => setNote(event.target.value)} placeholder="A note only you can see" /></label>
    <label className="messaging-help">Relationship<input maxLength={60} value={relationship} onChange={event => setRelationship(event.target.value)} placeholder="Coach, teammate, friend..." /></label>
    <label className="messaging-help">Organization<input maxLength={100} value={organization} onChange={event => setOrganization(event.target.value)} placeholder="Academy or organization" /></label>
    <label className="messaging-help">Private labels<input maxLength={500} value={labels} onChange={event => setLabels(event.target.value)} placeholder="Training partner, competition team..." /></label>
    <div className="inline-actions"><button type="button" className="btn" disabled={busy} onClick={() => void save()}>{busy ? "Saving..." : "Save private details"}</button>{status && <small role="status">{status}</small>}</div>
  </details>;
}
