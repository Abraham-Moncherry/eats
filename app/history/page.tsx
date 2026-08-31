"use client";

import { useEffect, useMemo, useState } from "react";
import { CaretLeft, CaretRight } from "@phosphor-icons/react";
import type { User } from "@supabase/supabase-js";
import { getCurrentSession, supabase } from "@/lib/supabase";
import EatsLoader from "../eats-loader";
import AppNav from "../app-nav";

type Log={id:string;name:string;calories:number;protein:number;carbohydrates:number;fat:number;meal:string;entry_date:string;created_at:string;routine_name:string|null};
const weekdays=["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
function iso(date:Date){const offset=date.getTimezoneOffset();return new Date(date.getTime()-offset*60000).toISOString().slice(0,10)}
function monthTitle(date:Date){return new Intl.DateTimeFormat("en-AU",{month:"long",year:"numeric"}).format(date)}

export default function HistoryPage(){
  const [user,setUser]=useState<User|null>(null);const [month,setMonth]=useState(()=>new Date(new Date().getFullYear(),new Date().getMonth(),1));const [logs,setLogs]=useState<Log[]>([]);const [selected,setSelected]=useState(iso(new Date()));const [loading,setLoading]=useState(true);const [error,setError]=useState("");
  useEffect(()=>{getCurrentSession().then(session=>{setUser(session?.user??null);if(!session?.user)setLoading(false)}).catch(error=>{setError(error instanceof Error?error.message:"Could not check your account");setLoading(false)})},[]);
  useEffect(()=>{if(!user||!supabase)return;const start=iso(month),end=iso(new Date(month.getFullYear(),month.getMonth()+1,0));setLoading(true);supabase.from("food_entries").select("id,name,calories,protein,carbohydrates,fat,meal,entry_date,created_at,routine_name").gte("entry_date",start).lte("entry_date",end).order("created_at").then(({data,error})=>{setLogs((data||[]) as Log[]);setError(error?.message||"");setLoading(false)})},[user,month]);
  const grouped=useMemo(()=>logs.reduce<Record<string,Log[]>>((all,log)=>{(all[log.entry_date]??=[]).push(log);return all},{}),[logs]);
  const first=(month.getDay()+6)%7,days=new Date(month.getFullYear(),month.getMonth()+1,0).getDate();const cells=[...Array(first).fill(null),...Array.from({length:days},(_,i)=>i+1)];while(cells.length%7)cells.push(null);
  const selectedLogs=grouped[selected]||[];const totals=selectedLogs.reduce((s,l)=>({calories:s.calories+Number(l.calories),protein:s.protein+Number(l.protein),carbs:s.carbs+Number(l.carbohydrates||0),fat:s.fat+Number(l.fat||0)}),{calories:0,protein:0,carbs:0,fat:0});
  function move(n:number){const next=new Date(month.getFullYear(),month.getMonth()+n,1);setMonth(next);setSelected(iso(next))}
  return <main className="history-page"><header className="app-header"><div className="brand"><img className="brand-logo" src="/eats-logo.png" alt=""/><span>eats</span></div><span className="screen-title">History</span></header>
    <section className="history-heading"><span className="eyebrow">Food history</span><h1>Your calendar</h1><p>Look back at meals and macros across months and years.</p></section>
    <section className="calendar-card"><div className="month-switch"><button onClick={()=>move(-1)} aria-label="Previous month"><CaretLeft/></button><h2>{monthTitle(month)}</h2><button onClick={()=>move(1)} aria-label="Next month"><CaretRight/></button></div><div className="weekdays">{weekdays.map(day=><span key={day}>{day}</span>)}</div><div className="calendar-grid">{cells.map((day,index)=>day===null?<span className="day blank" key={`b-${index}`}/>:<button key={day} className={`day ${selected===iso(new Date(month.getFullYear(),month.getMonth(),day))?"selected":""} ${grouped[iso(new Date(month.getFullYear(),month.getMonth(),day))]?.length?"has-log":""}`} onClick={()=>setSelected(iso(new Date(month.getFullYear(),month.getMonth(),day)))}><strong>{day}</strong>{grouped[iso(new Date(month.getFullYear(),month.getMonth(),day))]?.length?<small>{Math.round(grouped[iso(new Date(month.getFullYear(),month.getMonth(),day))].reduce((s,l)=>s+Number(l.calories),0))}</small>:null}</button>)}</div></section>
    <section className="history-detail"><div className="history-date"><div><span className="eyebrow">Selected day</span><h2>{new Intl.DateTimeFormat("en-AU",{weekday:"long",day:"numeric",month:"long",year:"numeric"}).format(new Date(`${selected}T12:00:00`))}</h2></div><strong>{Math.round(totals.calories)}<small> kcal</small></strong></div>{selectedLogs.length?<><div className="history-macros"><span><strong>{Math.round(totals.protein)}g</strong>Protein</span><span><strong>{Math.round(totals.carbs)}g</strong>Carbs</span><span><strong>{Math.round(totals.fat)}g</strong>Fat</span></div><div className="history-list">{selectedLogs.map(log=><article key={log.id}><div><strong>{log.name}</strong><span>{log.routine_name||log.meal}</span></div><strong>{Math.round(log.calories)} <small>kcal</small></strong></article>)}</div></>:<div className="mini-empty">{loading?<EatsLoader compact/>:"Nothing was logged on this day."}</div>}{error&&<div className="error-banner">{error}</div>}</section><AppNav/>
  </main>
}
