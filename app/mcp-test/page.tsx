"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Copy } from "lucide-react";
import { getCurrentSession, supabase } from "@/lib/supabase";
import EatsLoader from "../eats-loader";

export default function McpTestPage() {
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => { getCurrentSession().then((session) => setSignedIn(Boolean(session?.user))).catch((error) => setMessage(error instanceof Error ? error.message : "Could not check your account.")).finally(() => setReady(true)); }, []);

  async function copyToken() {
    const { data, error } = await supabase!.auth.getSession();
    if (error || !data.session) { setMessage("Your session expired. Sign in again first."); return; }
    await navigator.clipboard.writeText(data.session.access_token);
    setMessage("Temporary token copied. Treat it like a password and do not share it.");
  }

  if (!ready) return <div className="loading"><EatsLoader /></div>;
  return <main className="auth-page">
    <Link href="/" className="back-link"><ArrowLeft /> Today</Link>
    <section className="auth-card">
      <span className="eyebrow">Local development</span><h1>Test Eats MCP</h1>
      {!signedIn ? <p>Sign in to Eats first, then return to this page.</p> : <>
        <p>Copy a short-lived token for MCP Inspector. It gives the Inspector the same private access as your signed-in Eats account.</p>
        <button className="primary full" onClick={copyToken}><Copy /> Copy temporary token</button>
        {message && <div className="auth-message">{message}</div>}
        <div className="setup-code">URL: http://localhost:3000/mcp<br />Header: Authorization: Bearer YOUR_TOKEN</div>
      </>}
    </section>
  </main>;
}
