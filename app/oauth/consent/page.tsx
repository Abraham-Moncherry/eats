"use client";

import { useEffect, useState } from "react";
import { CheckCircle, XCircle } from "@phosphor-icons/react";
import { getSiteUrl, supabase } from "@/lib/supabase";

type Details = { authorization_id: string; client: { name: string }; scope: string; redirect_uri: string };

export default function OAuthConsent() {
  const [details, setDetails] = useState<Details | null>(null);
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("Checking your Eats sign-in…");
  const [busy, setBusy] = useState(false);
  const authorizationId = typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("authorization_id") ?? "";

  useEffect(() => {
    const client = supabase;
    if (!client || !authorizationId) { setMessage("This connection request is missing its authorization details."); return; }
    client.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { setMessage("Sign in to your Eats account to continue."); return; }
      const { data, error } = await client.auth.oauth.getAuthorizationDetails(authorizationId);
      if (error || !data) { setMessage(error?.message ?? "This connection request is no longer valid."); return; }
      if ("redirect_url" in data) { window.location.assign(data.redirect_url); return; }
      setDetails(data as Details); setMessage("");
    });
  }, [authorizationId]);

  async function sendMagicLink(event: React.FormEvent) {
    event.preventDefault();
    if (!supabase || !email) return;
    setBusy(true);
    const redirectTo = `${getSiteUrl()}/oauth/consent?authorization_id=${encodeURIComponent(authorizationId)}`;
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo, shouldCreateUser: true } });
    setMessage(error ? error.message : "Check your email for the Eats sign-in link, then return here to approve the connection."); setBusy(false);
  }

  async function decide(approved: boolean) {
    if (!supabase || !details) return;
    setBusy(true);
    const method = approved ? supabase.auth.oauth.approveAuthorization : supabase.auth.oauth.denyAuthorization;
    const { data, error } = await method(details.authorization_id, { skipBrowserRedirect: true });
    if (error || !data) { setMessage(error?.message ?? "Could not complete the connection."); setBusy(false); return; }
    window.location.assign(data.redirect_url);
  }

  return <main className="auth-page"><div className="auth-brand"><img className="brand-logo" src="/eats-logo.png" alt="" /><span>eats</span></div><section className="auth-card"><span className="eyebrow">Connect ChatGPT</span><h1>Allow Eats access?</h1>{details ? <><p><strong>{details.client.name}</strong> will be able to add the meals you explicitly approve. It cannot access other Eats accounts.</p><p className="privacy-note">Requested access: {details.scope || "add reviewed meals"}</p><div className="confirm-actions"><button className="secondary" disabled={busy} onClick={() => decide(false)}><XCircle /> Deny</button><button className="primary" disabled={busy} onClick={() => decide(true)}><CheckCircle weight="fill" /> Allow & continue</button></div></> : <>{message && <p className="auth-message">{message}</p>}<form onSubmit={sendMagicLink}><label>Email address<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" required /></label><button className="primary full" disabled={busy || !authorizationId}>{busy ? "Sending…" : "Email me a sign-in link"}</button></form></>}</section></main>;
}
