"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, CalendarBlank, ClockCounterClockwise, Fire, ForkKnife, GearSix, Plus, SignOut, Trash, X } from "@phosphor-icons/react";
import type { User } from "@supabase/supabase-js";
import { getSiteUrl, isSupabaseConfigured, supabase } from "@/lib/supabase";

type Entry = { id: string; name: string; calories: number; protein: number; carbohydrates: number; fat: number; meal: string; date: string; createdAt: number };
type Goals = { calories: number; protein: number };

const meals = ["Breakfast", "Lunch", "Dinner", "Snack"];

function localDate(date = new Date()) {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 10);
}

function prettyDate(value: string) {
  const today = localDate();
  const yesterday = localDate(new Date(Date.now() - 86400000));
  if (value === today) return "Today";
  if (value === yesterday) return "Yesterday";
  return new Intl.DateTimeFormat("en-AU", { weekday: "short", day: "numeric", month: "short" }).format(new Date(`${value}T12:00:00`));
}

function shiftDate(value: string, amount: number) {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + amount);
  return localDate(date);
}

function ProgressRing({ value, goal }: { value: number; goal: number }) {
  const pct = Math.min(value / goal, 1);
  const radius = 82;
  const circumference = 2 * Math.PI * radius;
  return (
    <div className="ring-wrap">
      <svg className="ring" viewBox="0 0 200 200" aria-label={`${value} of ${goal} calories`}>
        <circle className="ring-track" cx="100" cy="100" r={radius} />
        <circle className="ring-value" cx="100" cy="100" r={radius} strokeDasharray={circumference} strokeDashoffset={circumference * (1 - pct)} />
      </svg>
      <div className="ring-copy"><span>{value.toLocaleString()}</span><small>of {goal.toLocaleString()} kcal</small></div>
    </div>
  );
}

export default function Home() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [goals, setGoals] = useState<Goals>({ calories: 2200, protein: 150 });
  const [user, setUser] = useState<User | null>(null);
  const [date, setDate] = useState(localDate());
  const [showAdd, setShowAdd] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!supabase) { setReady(true); return; }
    supabase.auth.getUser().then(({ data }) => { setUser(data.user); setReady(true); });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user ?? null));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!user || !supabase) { setEntries([]); return; }
    setError("");
    Promise.all([
      supabase.from("food_entries").select("id,name,calories,protein,carbohydrates,fat,meal,entry_date,created_at").order("created_at", { ascending: false }),
      supabase.from("profiles").select("calorie_goal,protein_goal").eq("user_id", user.id).maybeSingle(),
    ]).then(([foodResult, profileResult]) => {
      if (foodResult.error) { setError(foodResult.error.message); return; }
      setEntries((foodResult.data ?? []).map((row) => ({ id: row.id, name: row.name, calories: row.calories, protein: row.protein, carbohydrates: Number(row.carbohydrates||0), fat: Number(row.fat||0), meal: row.meal, date: row.entry_date, createdAt: new Date(row.created_at).getTime() })));
      if (profileResult.data) setGoals({ calories: profileResult.data.calorie_goal, protein: profileResult.data.protein_goal });
    });
  }, [user]);

  const dayEntries = useMemo(() => entries.filter((entry) => entry.date === date).sort((a, b) => b.createdAt - a.createdAt), [entries, date]);
  const totals = dayEntries.reduce((sum, entry) => ({ calories: sum.calories + entry.calories, protein: sum.protein + entry.protein, carbohydrates: sum.carbohydrates + entry.carbohydrates, fat: sum.fat + entry.fat }), { calories: 0, protein: 0, carbohydrates: 0, fat: 0 });

  async function addEntry(entry: Omit<Entry, "id" | "createdAt">) {
    if (!supabase || !user) return;
    const { data, error: insertError } = await supabase.from("food_entries").insert({ user_id: user.id, name: entry.name, calories: entry.calories, protein: entry.protein, carbohydrates: entry.carbohydrates, fat: entry.fat, meal: entry.meal, entry_date: entry.date }).select("id,created_at").single();
    if (insertError) { setError(insertError.message); return; }
    setEntries((current) => [{ ...entry, id: data.id, createdAt: new Date(data.created_at).getTime() }, ...current]);
    setShowAdd(false);
  }

  async function deleteEntry(id: string) {
    if (!supabase) return;
    const { error: deleteError } = await supabase.from("food_entries").delete().eq("id", id);
    if (deleteError) { setError(deleteError.message); return; }
    setEntries((current) => current.filter((item) => item.id !== id));
  }

  async function saveGoals(next: Goals) {
    if (!supabase || !user) return;
    const { error: saveError } = await supabase.from("profiles").upsert({ user_id: user.id, calorie_goal: next.calories, protein_goal: next.protein, updated_at: new Date().toISOString() });
    if (saveError) { setError(saveError.message); return; }
    setGoals(next); setShowSettings(false);
  }

  if (!ready) return <div className="loading"><img className="brand-logo large" src="/eats-logo.png" alt="eats" /><p>Loading your log…</p></div>;
  if (!isSupabaseConfigured) return <SetupNeeded />;
  if (!user) return <AuthScreen />;

  return (
    <main>
      <header>
        <div className="brand"><img className="brand-logo" src="/eats-logo.png" alt="" /><span>eats</span></div>
        <div className="header-actions"><Link className="library-link" href="/history"><CalendarBlank /> History</Link><Link className="library-link" href="/library"><ForkKnife /> Library</Link><button className="icon-btn" onClick={() => setShowSettings(true)} aria-label="Open settings"><GearSix /></button></div>
      </header>

      <section className="date-switcher">
        <button className="icon-btn subtle" onClick={() => setDate(shiftDate(date, -1))} aria-label="Previous day"><ArrowLeft /></button>
        <button className="date-label" onClick={() => setDate(localDate())}>
          <strong>{prettyDate(date)}</strong><span>{new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "long", year: "numeric" }).format(new Date(`${date}T12:00:00`))}</span>
        </button>
        <button className="icon-btn subtle" disabled={date >= localDate()} onClick={() => setDate(shiftDate(date, 1))} aria-label="Next day"><ArrowRight /></button>
      </section>

      <section className="dashboard">
        <div className="summary-card">
          <div className="eyebrow"><Fire weight="fill" /> Daily energy</div>
          <ProgressRing value={totals.calories} goal={goals.calories} />
          <div className="remaining"><strong>{Math.max(goals.calories - totals.calories, 0).toLocaleString()}</strong> kcal remaining</div>
        </div>
        <div className="protein-card">
          <div><span>Protein</span><strong>{totals.protein}<small>g</small></strong></div>
          <div className="protein-track"><span style={{ width: `${Math.min((totals.protein / goals.protein) * 100, 100)}%` }} /></div>
          <p>{Math.max(goals.protein - totals.protein, 0)}g left of your {goals.protein}g goal</p>
          <div className="other-macros"><span><strong>{Math.round(totals.carbohydrates)}g</strong> carbs</span><span><strong>{Math.round(totals.fat)}g</strong> fat</span></div>
        </div>
      </section>

      <section className="log-section">
        {error && <div className="error-banner">{error}</div>}
        <div className="section-heading"><div><span className="eyebrow">Food log</span><h1>What you ate</h1></div><button className="add-small" onClick={() => setShowAdd(true)}><Plus weight="bold" /> Add food</button></div>
        {dayEntries.length ? (
          <div className="entry-list">{dayEntries.map((entry) => (
            <article className="entry" key={entry.id}>
              <div className="meal-dot" data-meal={entry.meal} />
              <div className="entry-name"><strong>{entry.name}</strong><span>{entry.meal} · {entry.protein}g protein</span></div>
              <strong className="entry-kcal">{entry.calories}<small> kcal</small></strong>
              <button className="delete-btn" onClick={() => deleteEntry(entry.id)} aria-label={`Delete ${entry.name}`}><Trash /></button>
            </article>
          ))}</div>
        ) : (
          <div className="empty"><span><ClockCounterClockwise /></span><h2>Nothing logged yet</h2><p>Add your first meal and your daily totals will show up here.</p><button className="primary" onClick={() => setShowAdd(true)}><Plus weight="bold" /> Log your first food</button></div>
        )}
      </section>

      <button className="fab" onClick={() => setShowAdd(true)} aria-label="Add food"><Plus weight="bold" /></button>
      {showAdd && <AddSheet date={date} onClose={() => setShowAdd(false)} onAdd={addEntry} />}
      {showSettings && <Settings goals={goals} email={user.email ?? ""} onClose={() => setShowSettings(false)} onSave={saveGoals} />}
    </main>
  );
}

function AddSheet({ date, onClose, onAdd }: { date: string; onClose: () => void; onAdd: (entry: Omit<Entry, "id" | "createdAt">) => void }) {
  const [name, setName] = useState("");
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");
  const [carbohydrates, setCarbohydrates] = useState("");
  const [fat, setFat] = useState("");
  const [meal, setMeal] = useState("Breakfast");
  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim() || !calories) return;
    onAdd({ name: name.trim(), calories: Number(calories), protein: Number(protein || 0), carbohydrates: Number(carbohydrates || 0), fat: Number(fat || 0), meal, date });
  }
  return <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}><form className="sheet" onSubmit={submit}>
    <div className="sheet-handle" /><div className="sheet-title"><div><span className="eyebrow">Quick log</span><h2>Add food</h2></div><button type="button" className="icon-btn" onClick={onClose}><X /></button></div>
    <label>What did you eat?<input autoFocus placeholder="e.g. Chicken wrap" value={name} onChange={(e) => setName(e.target.value)} /></label>
    <div className="field-row"><label>Calories<input inputMode="numeric" placeholder="0" min="0" type="number" value={calories} onChange={(e) => setCalories(e.target.value)} /><span>kcal</span></label><label>Protein<input inputMode="numeric" placeholder="0" min="0" type="number" value={protein} onChange={(e) => setProtein(e.target.value)} /><span>grams</span></label></div>
    <div className="field-row"><label>Carbohydrates<input inputMode="numeric" placeholder="0" min="0" type="number" value={carbohydrates} onChange={(e) => setCarbohydrates(e.target.value)} /><span>grams</span></label><label>Fat<input inputMode="numeric" placeholder="0" min="0" type="number" value={fat} onChange={(e) => setFat(e.target.value)} /><span>grams</span></label></div>
    <fieldset><legend>Meal</legend><div className="meal-picker">{meals.map((item) => <button type="button" className={meal === item ? "active" : ""} onClick={() => setMeal(item)} key={item}>{item}</button>)}</div></fieldset>
    <button className="primary full" type="submit" disabled={!name.trim() || !calories}><Plus weight="bold" /> Add to {prettyDate(date).toLowerCase()}</button>
  </form></div>;
}

function Settings({ goals, email, onClose, onSave }: { goals: Goals; email: string; onClose: () => void; onSave: (goals: Goals) => void }) {
  const [calories, setCalories] = useState(String(goals.calories));
  const [protein, setProtein] = useState(String(goals.protein));
  return <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}><form className="sheet compact" onSubmit={(e) => { e.preventDefault(); onSave({ calories: Number(calories), protein: Number(protein) }); }}>
    <div className="sheet-handle" /><div className="sheet-title"><div><span className="eyebrow">Personalise</span><h2>Daily goals</h2></div><button type="button" className="icon-btn" onClick={onClose}><X /></button></div>
    <div className="field-row"><label>Calorie goal<input type="number" min="1" value={calories} onChange={(e) => setCalories(e.target.value)} /><span>kcal</span></label><label>Protein goal<input type="number" min="1" value={protein} onChange={(e) => setProtein(e.target.value)} /><span>grams</span></label></div>
    <p className="privacy-note">Signed in as {email}. Your food log is securely synced to your account.</p><button className="primary full" type="submit">Save goals</button>
    <button className="sign-out" type="button" onClick={() => supabase?.auth.signOut()}><SignOut /> Sign out</button>
  </form></div>;
}

function AuthScreen() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); if (!supabase) return; setBusy(true); setMessage("");
    const result = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: getSiteUrl(), shouldCreateUser: true } });
    setBusy(false);
    if (result.error) setMessage(result.error.message);
    else setMessage("Magic link sent. Check your email and tap the link to sign in.");
  }
  return <main className="auth-page"><div className="auth-brand"><img className="brand-logo" src="/eats-logo.png" alt="" /><span>eats</span></div><section className="auth-card"><span className="eyebrow">Password-free sign in</span><h1>Welcome back</h1><p>Enter your email and we’ll send you a secure sign-in link. New emails automatically create an account.</p><form onSubmit={submit}><label>Email<input type="email" autoComplete="email" required autoFocus placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} /></label>{message && <div className="auth-message">{message}</div>}<button className="primary full" disabled={busy}>{busy ? "Sending link…" : "Email me a magic link"}</button></form><p className="magic-note">No password needed. Each link can only be used once.</p></section></main>;
}

function SetupNeeded() {
  return <main className="auth-page"><div className="auth-brand"><img className="brand-logo" src="/eats-logo.png" alt="" /><span>eats</span></div><section className="auth-card"><span className="eyebrow">One-time setup</span><h1>Connect Supabase</h1><p>The app is ready for cloud sync. Add your project URL and publishable key to <code>.env.local</code>, then run the included SQL migration in Supabase.</p><div className="setup-code">NEXT_PUBLIC_SUPABASE_URL<br />NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</div></section></main>;
}
