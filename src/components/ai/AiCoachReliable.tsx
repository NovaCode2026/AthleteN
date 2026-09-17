import { useState } from "react";
import { Sparkles } from "lucide-react";
import type { UsageSummary } from "../../types";

type Toast = { type: "success" | "error" | "warning"; message: string } | null;

type Props = { usage: UsageSummary; accessToken?: string; setToast: (toast: Toast) => void };

async function parseApiResponse(response: Response) {
  const raw = await response.text();
  if (!raw.trim()) return { error: `AI service returned an empty response (HTTP ${response.status}).` };
  try {
    return JSON.parse(raw) as { answer?: string; error?: string };
  } catch {
    const preview = raw.replace(/\s+/g, " ").trim().slice(0, 180);
    return { error: preview ? `AI service returned an invalid response: ${preview}` : "AI service returned an invalid response." };
  }
}

export default function AiCoachReliable({ usage, accessToken, setToast }: Props) {
  const [topic, setTopic] = useState("Training Coach");
  const [prompt, setPrompt] = useState("");
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);
  const remaining = Math.max(0, usage.limit - usage.used);

  async function ask() {
    if (!prompt.trim()) { setToast({ type: "warning", message: "Enter a training question before asking AI Coach." }); return; }
    if (!usage.limit) { setToast({ type: "error", message: "AI Coach is not available on the Free plan." }); return; }
    if (remaining <= 0) { setToast({ type: "error", message: "Monthly AI limit reached for your current plan." }); return; }
    if (!accessToken) { setToast({ type: "error", message: "Please sign in again before using AI Coach." }); return; }
    setLoading(true); setAnswer("");
    try {
      const response = await fetch("/.netlify/functions/ai-coach", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` }, body: JSON.stringify({ topic, prompt: prompt.trim() }) });
      const payload = await parseApiResponse(response);
      if (!response.ok) throw new Error(payload.error || `AI request failed (HTTP ${response.status}).`);
      if (!payload.answer?.trim()) throw new Error("AI Coach returned no answer. Please try again.");
      setAnswer(payload.answer.trim());
    } catch (error) {
      setToast({ type: "error", message: error instanceof Error ? error.message : "AI request failed." });
    } finally { setLoading(false); }
  }

  return <FeaturePage title="Secure AI Coach"><section className="card panel ai-panel"><div className="usage-bar"><span>Monthly AI usage</span><strong>{usage.used}/{usage.limit}</strong><i style={{ width: `${usage.limit ? Math.min(100, (usage.used / usage.limit) * 100) : 0}%` }} /></div>{!usage.limit && <p className="notice" role="status">Free plan includes zero AI access.</p>}<div className="inline-actions"><Sparkles size={18}/><strong>Athlete performance assistant</strong></div><select value={topic} onChange={(e) => setTopic(e.target.value)} aria-label="AI coaching topic">{["Training Coach","Tournament Preparation","Match Analysis","Nutrition Advice","Recovery Advice","Goal Suggestions","Performance Reports","Motivational Feedback"].map((item) => <option key={item}>{item}</option>)}</select><textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Describe your training, tournament situation, recovery question, or performance goal." /><button className="btn primary" onClick={() => void ask()} disabled={loading || remaining <= 0 || !usage.limit}>{loading ? "Thinking…" : "Ask AI Coach"}</button>{answer && <div className="answer" role="status">{answer}</div>}</section></FeaturePage>;
}

function FeaturePage({ title, children }: { title: string; children: React.ReactNode }) { return <><div className="page-head"><div><p className="eyebrow">AthleteN V2</p><h2>{title}</h2></div></div>{children}</>; }
