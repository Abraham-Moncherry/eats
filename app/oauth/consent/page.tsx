"use client";

import { useCallback, useEffect, useState } from "react";
import { CircleCheck as CheckCircle, CircleX as XCircle } from "lucide-react";
import { getSiteUrl, supabase } from "@/lib/supabase";

type Details = { authorization_id: string; client: { name: string }; scope: string; redirect_uri: string };

export default function OAuthConsent() {
  const [details, setDetails] = useState<Details | null>(null);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [message, setMessage] = useState("Checking your Eats sign-in…");
  const [busy, setBusy] = useState(false);
  const authorizationId = typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("authorization_id") ?? "";

  const loadAuthorizationDetails = useCallback(async () => {
    const client = supabase;
    if (!client || !authorizationId) { setMessage("This connection request is missing its authorization details."); return; }
    const { data: { session } } = await client.auth.getSession();
    if (!session) { setMessage("Sign in to your Eats account to continue."); return; }
    const { data, error } = await client.auth.oauth.getAuthorizationDetails(authorizationId);
    if (error || !data) { setMessage(error?.message ?? "This connection request is no longer valid."); return; }
    if ("redirect_url" in data) { window.location.assign(data.redirect_url); return; }
    setDetails(data as Details); setMessage("");
  }, [authorizationId]);

  useEffect(() => { void loadAuthorizationDetails(); }, [loadAuthorizationDetails]);

  async function sendMagicLink(event: React.FormEvent) {
    event.preventDefault();
    if (!supabase || !email) return;
    setBusy(true);
    const redirectTo = `${getSiteUrl()}/oauth/consent?authorization_id=${encodeURIComponent(authorizationId)}`;
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo, shouldCreateUser: true } });
    if (error) setMessage(error.message);
    else { setCodeSent(true); setMessage(`We emailed a six-digit code to ${email}.`); }
    setBusy(false);
  }

  async function verifyCode(event: React.FormEvent) {
    event.preventDefault();
    if (!supabase || !email || code.length !== 6) return;
    setBusy(true);
    const { error } = await supabase.auth.verifyOtp({ email, token: code, type: "email" });
    if (error) { setMessage(error.message); setBusy(false); return; }
    setMessage("Signed in. Opening the Eats approval…");
    setCode("");
    setCodeSent(false);
    await loadAuthorizationDetails();
    setBusy(false);
  }

  async function decide(approved: boolean) {
    if (!supabase || !details) return;
    setBusy(true);
    const method = approved ? supabase.auth.oauth.approveAuthorization : supabase.auth.oauth.denyAuthorization;
    const { data, error } = await method(details.authorization_id, { skipBrowserRedirect: true });
    if (error || !data) { setMessage(error?.message ?? "Could not complete the connection."); setBusy(false); return; }
    window.location.assign(data.redirect_url);
  }

  const directVisit = !authorizationId;
  return <main className="auth-page"><div className="auth-brand"><img className="brand-logo" src="/eats-logo.png" alt="" /><span>eats</span></div><section className="auth-card"><span className="eyebrow">Connect ChatGPT</span><h1>{directVisit ? "Connect from ChatGPT" : "Allow Eats access?"}</h1>{details ? <><p><strong>{details.client.name}</strong> will be able to add the meals you explicitly approve. It cannot access other Eats accounts.</p><p className="privacy-note">Requested access: {details.scope || "add reviewed meals"}</p><div className="confirm-actions"><button className="secondary" disabled={busy} onClick={() => decide(false)}><XCircle /> Deny</button><button className="primary" disabled={busy} onClick={() => decide(true)}><CheckCircle /> Allow & continue</button></div></> : directVisit ? <><p>This page opens automatically after you tap <strong>Connect Eats</strong> in ChatGPT. There is nothing to sign in to here yet.</p><a className="primary full" href="/">Open Eats</a></> : <>{message && <p className="auth-message">{message}</p>}{codeSent ? <form onSubmit={verifyCode}><label>Six-digit code<input inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="[0-9]{6}" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="123456" required /></label><button className="primary full" disabled={busy || code.length !== 6}>{busy ? "Verifying…" : "Verify & continue"}</button><button className="auth-link" type="button" disabled={busy} onClick={() => { setCodeSent(false); setCode(""); setMessage("Enter your email to receive a new code."); }}>Use another email or resend</button></form> : <form onSubmit={sendMagicLink}><label>Email address<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" required /></label><button className="primary full" disabled={busy}>{busy ? "Sending…" : "Email me a sign-in code"}</button></form>}</>}</section></main>;
}
