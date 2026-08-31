"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Camera, CaretDown, CaretUp, CheckCircle, ClockCounterClockwise, Fire, GearSix, Plus, SignOut, Sparkle, Trash, X } from "@phosphor-icons/react";
import type { User } from "@supabase/supabase-js";
import { getCurrentSession, getSiteUrl, isSupabaseConfigured, supabase } from "@/lib/supabase";
import AppNav from "./app-nav";
import EatsLoader from "./eats-loader";

type EntryIngredient = { id?:string; amount:number; unit:string; ingredient?:{name?:string;brand?:string|null} };
type Entry = { id: string; name: string; calories: number; protein: number; carbohydrates: number; fat: number; meal: string; date: string; createdAt: number; snapshot?:{quantity?:number;ingredients?:EntryIngredient[]}|null };
type Goals = { calories: number; protein: number };
type LibraryMeal = { id: string; name: string; notes?: string | null; ingredients: EntryIngredient[]; calories: number; protein: number; carbohydrates: number; fat: number };
type MealEstimate = { name: string; calories: number; protein: number; carbohydrates: number; fat: number; meal: string; confidence: "low" | "medium" | "high"; note: string };

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
  const [expandedEntry, setExpandedEntry] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Entry | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [confirmation, setConfirmation] = useState("");

  useEffect(() => {
    if (!confirmation) return;
    const timeout = window.setTimeout(() => setConfirmation(""), 3200);
    return () => window.clearTimeout(timeout);
  }, [confirmation]);

  useEffect(() => {
    if (!supabase) { setReady(true); return; }
    let active = true;
    getCurrentSession()
      .then((session) => { if (active) setUser(session?.user ?? null); })
      .catch((sessionError) => { if (active) { setUser(null); setError(sessionError instanceof Error ? sessionError.message : "Could not check your sign-in."); } })
      .finally(() => { if (active) setReady(true); });
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      setUser(session?.user ?? null);
      if (event === "INITIAL_SESSION") setReady(true);
    });
    return () => { active = false; data.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!user || !supabase) { setEntries([]); return; }
    setError("");
    Promise.all([
      supabase.from("food_entries").select("id,name,calories,protein,carbohydrates,fat,meal,entry_date,created_at,snapshot").order("created_at", { ascending: false }),
      supabase.from("profiles").select("calorie_goal,protein_goal").eq("user_id", user.id).maybeSingle(),
    ]).then(([foodResult, profileResult]) => {
      if (foodResult.error) { setError(foodResult.error.message); return; }
      setEntries((foodResult.data ?? []).map((row) => ({ id: row.id, name: row.name, calories: row.calories, protein: row.protein, carbohydrates: Number(row.carbohydrates||0), fat: Number(row.fat||0), meal: row.meal, date: row.entry_date, createdAt: new Date(row.created_at).getTime(), snapshot:row.snapshot as Entry["snapshot"] })));
      if (profileResult.data) setGoals({ calories: profileResult.data.calorie_goal, protein: profileResult.data.protein_goal });
    });
  }, [user]);

  const dayEntries = useMemo(() => entries.filter((entry) => entry.date === date).sort((a, b) => b.createdAt - a.createdAt), [entries, date]);
  const groupedDayEntries = useMemo(() => [...meals,...new Set(dayEntries.map(entry=>entry.meal).filter(category=>!meals.includes(category)))].map(category=>({category,entries:dayEntries.filter(entry=>entry.meal===category)})).filter(group=>group.entries.length), [dayEntries]);
  const totals = dayEntries.reduce((sum, entry) => ({ calories: sum.calories + entry.calories, protein: sum.protein + entry.protein, carbohydrates: sum.carbohydrates + entry.carbohydrates, fat: sum.fat + entry.fat }), { calories: 0, protein: 0, carbohydrates: 0, fat: 0 });

  async function addEntry(entry: Omit<Entry, "id" | "createdAt">) {
    if (!supabase || !user) return false;
    const { data, error: insertError } = await supabase.from("food_entries").insert({ user_id: user.id, name: entry.name, calories: entry.calories, protein: entry.protein, carbohydrates: entry.carbohydrates, fat: entry.fat, meal: entry.meal, entry_date: entry.date, snapshot: entry.snapshot ?? null }).select("id,created_at").single();
    if (insertError) { setError(insertError.message); return false; }
    setEntries((current) => [{ ...entry, id: data.id, createdAt: new Date(data.created_at).getTime() }, ...current]);
    setShowAdd(false);
    setConfirmation(`${entry.name} added to ${entry.meal.toLowerCase()}`);
    navigator.vibrate?.(20);
    return true;
  }

  async function deleteEntry(id: string) {
    if (!supabase) return;
    const { error: deleteError } = await supabase.from("food_entries").delete().eq("id", id);
    if (deleteError) { setError(deleteError.message); return; }
    setEntries((current) => current.filter((item) => item.id !== id));
    setPendingDelete(null);
  }

  async function saveGoals(next: Goals) {
    if (!supabase || !user) return;
    const { error: saveError } = await supabase.from("profiles").upsert({ user_id: user.id, calorie_goal: next.calories, protein_goal: next.protein, updated_at: new Date().toISOString() });
    if (saveError) { setError(saveError.message); return; }
    setGoals(next); setShowSettings(false);
  }

  if (!ready) return <div className="loading"><EatsLoader /></div>;
  if (!isSupabaseConfigured) return <SetupNeeded />;
  if (!user) return <AuthScreen initialMessage={error} />;

  return (
    <main className="home-page">
      <header className="app-header">
        <div className="brand"><img className="brand-logo" src="/eats-logo.png" alt="" /><span>eats</span></div>
        <button className="icon-btn" onClick={() => setShowSettings(true)} aria-label="Open settings"><GearSix /></button>
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
          <div className="meal-groups">{groupedDayEntries.map(group=><section className="meal-group" key={group.category}><div className="meal-group-heading"><h2>{group.category}</h2><span>{group.entries.length} {group.entries.length===1?"item":"items"} · {Math.round(group.entries.reduce((sum,entry)=>sum+entry.calories,0))} kcal</span></div><div className="entry-list">{group.entries.map((entry) => {const open=expandedEntry===entry.id;const quantity=Number(entry.snapshot?.quantity||1);return (
              <article className={`entry${open?" expanded":""}`} key={entry.id}>
                <div className="entry-row"><button className="entry-main" onClick={()=>setExpandedEntry(open?null:entry.id)} aria-expanded={open}><div className="meal-dot" data-meal={entry.meal}/><div className="entry-name"><strong>{entry.name}</strong><span>{entry.protein}g protein</span></div><strong className="entry-kcal">{entry.calories}<small> kcal</small></strong>{open?<CaretUp/>:<CaretDown/>}</button><button className="delete-btn" onClick={()=>setPendingDelete(entry)} aria-label={`Delete ${entry.name}`}><Trash/></button></div>
                {open&&<div className="entry-details"><div className="entry-macros"><span><strong>{entry.calories}</strong><small>kcal</small></span><span><strong>{entry.protein}g</strong><small>protein</small></span><span><strong>{entry.carbohydrates}g</strong><small>carbs</small></span><span><strong>{entry.fat}g</strong><small>fat</small></span></div>{entry.snapshot?.ingredients?.length?<div className="entry-ingredients"><span className="eyebrow">What was in this meal</span>{entry.snapshot.ingredients.map((item,index)=><div key={item.id||index}><span>{item.ingredient?.brand?`${item.ingredient.brand} `:""}{item.ingredient?.name||"Ingredient"}</span><strong>{Number(item.amount)*quantity} {item.unit}</strong></div>)}</div>:<p className="entry-no-breakdown">No ingredient breakdown was saved for this quick entry.</p>}</div>}
              </article>
            )})}</div></section>)}</div>
        ) : (
          <div className="empty"><span><ClockCounterClockwise /></span><h2>Nothing logged yet</h2><p>Add your first meal and your daily totals will show up here.</p><button className="primary" onClick={() => setShowAdd(true)}><Plus weight="bold" /> Log your first food</button></div>
        )}
      </section>

      <button className="fab" onClick={() => setShowAdd(true)} aria-label="Add food"><Plus weight="bold" /></button>
      {confirmation && <div className="action-toast" role="status" aria-live="polite"><CheckCircle weight="fill" /><span><strong>Added</strong>{confirmation}</span><button onClick={() => setConfirmation("")} aria-label="Dismiss"><X /></button></div>}
      <AppNav />
      {showAdd && <AddSheet date={date} user={user} onClose={() => setShowAdd(false)} onAdd={addEntry} />}
      {showSettings && <Settings goals={goals} email={user.email ?? ""} onClose={() => setShowSettings(false)} onSave={saveGoals} />}
      {pendingDelete&&<DeleteConfirmation entry={pendingDelete} onCancel={()=>setPendingDelete(null)} onConfirm={()=>deleteEntry(pendingDelete.id)}/>}
    </main>
  );
}

function DeleteConfirmation({entry,onCancel,onConfirm}:{entry:Entry;onCancel:()=>void;onConfirm:()=>void}) {
  return <div className="overlay" onMouseDown={e=>e.target===e.currentTarget&&onCancel()}><section className="sheet compact confirm-sheet" role="dialog" aria-modal="true" aria-labelledby="delete-title"><div className="sheet-handle"/><div className="confirm-icon"><Trash/></div><h2 id="delete-title">Delete this log?</h2><p>Are you sure you want to delete <strong>{entry.name}</strong> from {prettyDate(entry.date).toLowerCase()}?</p><div className="confirm-actions"><button className="secondary" onClick={onCancel}>No, keep it</button><button className="danger" onClick={onConfirm}>Yes, delete</button></div></section></div>
}

function AddSheet({ date, user, onClose, onAdd }: { date: string; user: User; onClose: () => void; onAdd: (entry: Omit<Entry, "id" | "createdAt">) => Promise<boolean> }) {
  const [name, setName] = useState("");
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");
  const [carbohydrates, setCarbohydrates] = useState("");
  const [fat, setFat] = useState("");
  const [meal, setMeal] = useState("Breakfast");
  const [mode, setMode] = useState<"quick" | "library">("quick");
  const [savedMeals, setSavedMeals] = useState<LibraryMeal[]>([]);
  const [savedMealsLoading, setSavedMealsLoading] = useState(true);
  const [savedMealsError, setSavedMealsError] = useState("");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!supabase) { setSavedMealsLoading(false); return; }
    supabase.from("meals").select("id,name,notes,meal_ingredients(id,amount,unit,ingredients(id,name,brand,serving_amount,calories,protein,carbohydrates,fat))").eq("user_id", user.id).order("name").then(({ data, error }) => {
      if (error) { setSavedMealsError(error.message); setSavedMealsLoading(false); return; }
      const next = (data ?? []).map((savedMeal: any) => {
        const ingredients: EntryIngredient[] = (savedMeal.meal_ingredients ?? []).map((item: any) => ({ id: item.id, amount: Number(item.amount), unit: item.unit, ingredient: item.ingredients }));
        const macros = ingredients.reduce((sum, item) => {
          const ingredient = item.ingredient as (EntryIngredient["ingredient"] & { serving_amount?: number; calories?: number; protein?: number; carbohydrates?: number; fat?: number }) | undefined;
          const ratio = ingredient?.serving_amount ? item.amount / ingredient.serving_amount : 0;
          return { calories: sum.calories + Number(ingredient?.calories ?? 0) * ratio, protein: sum.protein + Number(ingredient?.protein ?? 0) * ratio, carbohydrates: sum.carbohydrates + Number(ingredient?.carbohydrates ?? 0) * ratio, fat: sum.fat + Number(ingredient?.fat ?? 0) * ratio };
        }, { calories: 0, protein: 0, carbohydrates: 0, fat: 0 });
        return { id: savedMeal.id, name: savedMeal.name, notes: savedMeal.notes, ingredients, calories: Math.round(macros.calories), protein: Math.round(macros.protein), carbohydrates: Math.round(macros.carbohydrates), fat: Math.round(macros.fat) };
      });
      setSavedMeals(next); setSavedMealsLoading(false);
    });
  }, [user.id]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim() || !calories) return;
    setBusy(true);
    await onAdd({ name: name.trim(), calories: Number(calories), protein: Number(protein || 0), carbohydrates: Number(carbohydrates || 0), fat: Number(fat || 0), meal, date });
    setBusy(false);
  }

  async function addSavedMeal(savedMeal: LibraryMeal) {
    setBusy(true);
    await onAdd({ name: savedMeal.name, calories: savedMeal.calories, protein: savedMeal.protein, carbohydrates: savedMeal.carbohydrates, fat: savedMeal.fat, meal, date, snapshot: { quantity: 1, ingredients: savedMeal.ingredients } });
    setBusy(false);
  }

  const visibleSavedMeals = savedMeals.filter((savedMeal) => `${savedMeal.name} ${savedMeal.notes ?? ""}`.toLowerCase().includes(query.trim().toLowerCase()));
  return <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}><form className="sheet" onSubmit={submit}>
    <div className="sheet-handle" /><div className="sheet-title"><div><span className="eyebrow">Quick log</span><h2>Add food</h2></div><button type="button" className="icon-btn" onClick={onClose}><X /></button></div>
    <div className="add-mode-picker" role="tablist" aria-label="How to add food"><button type="button" role="tab" aria-selected={mode === "quick"} className={mode === "quick" ? "active" : ""} onClick={() => setMode("quick")}>Quick entry</button><button type="button" role="tab" aria-selected={mode === "library"} className={mode === "library" ? "active" : ""} onClick={() => setMode("library")}>From library</button></div>
    {mode === "quick" ? <><label>What did you eat?<input autoFocus placeholder="e.g. Chicken wrap" value={name} onChange={(e) => setName(e.target.value)} /></label>
    <div className="field-row"><label>Calories<input inputMode="numeric" placeholder="0" min="0" type="number" value={calories} onChange={(e) => setCalories(e.target.value)} /><span>kcal</span></label><label>Protein<input inputMode="numeric" placeholder="0" min="0" type="number" value={protein} onChange={(e) => setProtein(e.target.value)} /><span>grams</span></label></div>
    <div className="field-row"><label>Carbohydrates<input inputMode="numeric" placeholder="0" min="0" type="number" value={carbohydrates} onChange={(e) => setCarbohydrates(e.target.value)} /><span>grams</span></label><label>Fat<input inputMode="numeric" placeholder="0" min="0" type="number" value={fat} onChange={(e) => setFat(e.target.value)} /><span>grams</span></label></div></> : <div className="saved-meal-picker"><label className="saved-meal-search">Your saved meals<input autoFocus type="search" placeholder="Search your library" value={query} onChange={(event) => setQuery(event.target.value)} /></label>{savedMealsLoading ? <p className="saved-meal-empty">Loading your meals…</p> : savedMealsError ? <p className="saved-meal-empty">{savedMealsError}</p> : visibleSavedMeals.length ? <div className="saved-meal-list">{visibleSavedMeals.map((savedMeal) => <button type="button" className="saved-meal-option" onClick={() => addSavedMeal(savedMeal)} disabled={busy} key={savedMeal.id}><span><strong>{savedMeal.name}</strong><small>{savedMeal.ingredients.length} ingredients · {savedMeal.protein}g protein</small></span><b>{savedMeal.calories}<small> kcal</small></b><Plus weight="bold" /></button>)}</div> : <p className="saved-meal-empty">{savedMeals.length ? "No meals match that search." : "Your library has no saved meals yet."}</p>}</div>}
    <fieldset><legend>Meal</legend><div className="meal-picker">{meals.map((item) => <button type="button" className={meal === item ? "active" : ""} onClick={() => setMeal(item)} key={item}>{item}</button>)}</div></fieldset>
    {mode === "quick" && <button className="primary full" type="submit" disabled={busy || !name.trim() || !calories}><Plus weight="bold" /> {busy ? "Adding…" : `Add to ${prettyDate(date).toLowerCase()}`}</button>}
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

function AuthScreen({ initialMessage = "" }: { initialMessage?: string }) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [message, setMessage] = useState(initialMessage);
  const [busy, setBusy] = useState(false);
  async function sendEmail(event: React.FormEvent) {
    event.preventDefault(); if (!supabase) return; setBusy(true); setMessage("");
    const result = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: getSiteUrl(), shouldCreateUser: true } });
    setBusy(false);
    if (result.error) setMessage(result.error.message);
    else { setSent(true); setMessage("Email sent. Type the code below — the link in the email opens your browser instead."); }
  }
  // Typing the code signs you in inside this window. On a home screen app that
  // matters: a tapped link opens the browser instead, which keeps its own session.
  async function verifyCode(event: React.FormEvent) {
    event.preventDefault(); if (!supabase) return; setBusy(true); setMessage("");
    const result = await supabase.auth.verifyOtp({ email, token: code.trim(), type: "email" });
    setBusy(false);
    if (result.error) setMessage(result.error.message);
  }
  return <main className="auth-page"><div className="auth-brand"><img className="brand-logo" src="/eats-logo.png" alt="" /><span>eats</span></div><section className="auth-card"><span className="eyebrow">Password-free sign in</span><h1>Welcome back</h1><p>{sent ? "Type the 6-digit code from the email here. Tapping the link instead signs you in to your browser, which is a separate app to this one." : "Enter your email and we’ll send you a secure sign-in code. New emails automatically create an account."}</p>
    {sent ? (
      <form onSubmit={verifyCode}><label>Sign-in code<input className="code-input" inputMode="numeric" autoComplete="one-time-code" required autoFocus placeholder="000000" value={code} onChange={(e) => setCode(e.target.value)} /></label>{message && <div className="auth-message">{message}</div>}<button className="primary full" disabled={busy || !code.trim()}>{busy ? "Checking…" : "Sign in"}</button><button className="mode-switch" type="button" onClick={() => { setSent(false); setCode(""); setMessage(""); }}>Use a different email</button></form>
    ) : (
      <form onSubmit={sendEmail}><label>Email<input type="email" autoComplete="email" required autoFocus placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} /></label>{message && <div className="auth-message">{message}</div>}<button className="primary full" disabled={busy}>{busy ? "Sending…" : "Email me a sign-in code"}</button></form>
    )}
    <p className="magic-note">No password needed. Once you are in, this device stays signed in until you sign out.</p></section></main>;
}

function SetupNeeded() {
  return <main className="auth-page"><div className="auth-brand"><img className="brand-logo" src="/eats-logo.png" alt="" /><span>eats</span></div><section className="auth-card"><span className="eyebrow">One-time setup</span><h1>Connect Supabase</h1><p>The app is ready for cloud sync. Add your project URL and publishable key to <code>.env.local</code>, then run the included SQL migration in Supabase.</p><div className="setup-code">NEXT_PUBLIC_SUPABASE_URL<br />NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</div></section></main>;
}
