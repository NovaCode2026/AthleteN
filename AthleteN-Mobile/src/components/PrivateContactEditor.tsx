import { useEffect, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import { c } from "@/components/mobile-ui";

type Props = { contactUserId?: string; originalName?: string };

export default function PrivateContactEditor({ contactUserId, originalName }: Props) {
  const { session } = useAuth();
  const ownerUserId = session?.user.id;
  const [expanded, setExpanded] = useState(false);
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
      const { data, error } = await supabase.from("messaging_private_contacts")
        .select("nickname,personal_note,relationship_label,organization_label,custom_labels")
        .eq("owner_user_id", ownerUserId).eq("contact_user_id", contactUserId).maybeSingle();
      if (!active) return;
      if (error) { setStatus("Private details unavailable until the update is installed."); return; }
      setNickname(data?.nickname || "");
      setNote(data?.personal_note || "");
      setRelationship(data?.relationship_label || "");
      setOrganization(data?.organization_label || "");
      setLabels(Array.isArray(data?.custom_labels) ? data.custom_labels.join(", ") : "");
    }
    void load();
    return () => { active = false; };
  }, [ownerUserId, contactUserId]);

  if (!contactUserId || !ownerUserId || ownerUserId === contactUserId) return null;

  async function save() {
    if (!ownerUserId || !contactUserId || busy) return;
    setBusy(true); setStatus("");
    const customLabels = [...new Set(labels.split(",").map(value => value.trim()).filter(Boolean))].slice(0, 20);
    const { error } = await supabase.from("messaging_private_contacts").upsert({
      owner_user_id: ownerUserId, contact_user_id: contactUserId,
      nickname: nickname.trim() || null, personal_note: note.trim() || null,
      relationship_label: relationship.trim() || null,
      organization_label: organization.trim() || null, custom_labels: customLabels,
    }, { onConflict: "owner_user_id,contact_user_id" });
    setBusy(false);
    setStatus(error ? "Could not save private details." : "Saved privately.");
  }

  const input = { borderWidth: 1, borderColor: c.border, borderRadius: 10, padding: 10, color: c.text, marginTop: 8 } as const;
  return <View style={{ marginVertical: 10, padding: 12, borderWidth: 1, borderColor: c.border, borderRadius: 14 }}>
    <Pressable onPress={() => setExpanded(value => !value)} accessibilityRole="button" accessibilityState={{ expanded }}>
      <Text style={{ color: c.text, fontWeight: "700" }}>Private contact details {expanded ? "−" : "+"}</Text>
      <Text style={{ color: c.muted, fontSize: 12, marginTop: 3 }}>Only visible to you · {originalName || "Contact"}</Text>
    </Pressable>
    {expanded && <>
      <TextInput value={nickname} onChangeText={setNickname} placeholder="Private nickname" placeholderTextColor={c.muted} maxLength={60} style={input}/>
      <TextInput value={note} onChangeText={setNote} placeholder="Personal note (only you can see)" placeholderTextColor={c.muted} maxLength={1000} multiline style={[input,{minHeight:64,textAlignVertical:"top"}]}/>
      <TextInput value={relationship} onChangeText={setRelationship} placeholder="Relationship" placeholderTextColor={c.muted} maxLength={60} style={input}/>
      <TextInput value={organization} onChangeText={setOrganization} placeholder="Academy or organization" placeholderTextColor={c.muted} maxLength={100} style={input}/>
      <TextInput value={labels} onChangeText={setLabels} placeholder="Private labels, comma separated" placeholderTextColor={c.muted} maxLength={500} style={input}/>
      <Pressable onPress={() => void save()} disabled={busy} style={{ marginTop: 10, padding: 12, backgroundColor: c.primary, borderRadius: 10, opacity: busy ? 0.6 : 1 }}>
        <Text style={{ color: "#FFFFFF", fontWeight: "700", textAlign: "center" }}>{busy ? "Saving..." : "Save private details"}</Text>
      </Pressable>
      {!!status && <Text accessibilityRole="status" style={{ color: c.muted, marginTop: 8 }}>{status}</Text>}
    </>}
  </View>;
}
