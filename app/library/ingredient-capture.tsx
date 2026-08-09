"use client";

import { useRef, useState } from "react";
import { Barcode, Camera, SpinnerGap, X } from "@phosphor-icons/react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

const units = ["g","ml","item","scoop","tsp","tbsp","serving"];
type Values = { name:string; brand:string; barcode:string; serving_amount:string; serving_unit:string; calories:string; protein:string; carbohydrates:string; fat:string; source:string };

function numberNear(text:string,label:RegExp) {
  const match=text.match(new RegExp(`${label.source}[^\\d]{0,18}(\\d+(?:[.,]\\d+)?)`,"i"));
  return match?.[1]?.replace(",",".")||"";
}
function parseLabel(text:string):Partial<Values> {
  const serving=text.match(/serving size[^\d]{0,15}(\d+(?:[.,]\d+)?)\s*(g|ml)/i);
  let calories=numberNear(text,/calories|energy\s*\(?kcal\)?/i);
  if(!calories){const kj=numberNear(text,/energy/i);if(kj)calories=String(Math.round(Number(kj)/4.184));}
  return { serving_amount:serving?.[1]?.replace(",",".")||"100", serving_unit:serving?.[2]?.toLowerCase()||"g", calories, protein:numberNear(text,/protein/i), carbohydrates:numberNear(text,/carbohydrate(?:s)?/i), fat:numberNear(text,/total fat|fat/i), source:"label" };
}

export default function IngredientCapture({user,close,done}:{user:User;close:()=>void;done:()=>void}) {
  const [v,setV]=useState<Values>({name:"",brand:"",barcode:"",serving_amount:"100",serving_unit:"g",calories:"",protein:"",carbohydrates:"",fat:"",source:"manual"});
  const [busy,setBusy]=useState(""); const [notice,setNotice]=useState("");
  const barcodeInput=useRef<HTMLInputElement>(null); const labelInput=useRef<HTMLInputElement>(null);
  const set=(key:keyof Values,value:string)=>setV(current=>({...current,[key]:value}));
  async function lookupBarcode(code:string){setBusy("Looking up barcode…");setNotice("");try{const response=await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}?fields=code,product_name,brands,serving_size,nutriments`);const body=await response.json();if(!body.product)throw new Error("Product not found. Photograph the nutrition label instead.");const p=body.product,n=p.nutriments||{};setV(current=>({...current,name:p.product_name||current.name,brand:p.brands||current.brand,barcode:code,serving_amount:"100",serving_unit:"g",calories:String(n["energy-kcal_100g"]??""),protein:String(n.proteins_100g??""),carbohydrates:String(n.carbohydrates_100g??""),fat:String(n.fat_100g??""),source:"barcode"}));setNotice("Product found. Check the per-100g values against the package.");}catch(error){setNotice(error instanceof Error?error.message:"Could not read that product.");}finally{setBusy("");}}
  async function scanBarcode(file:File){setBusy("Reading barcode…");setNotice("");try{const {BrowserMultiFormatReader}=await import("@zxing/browser");const url=URL.createObjectURL(file);const result=await new BrowserMultiFormatReader().decodeFromImageUrl(url);URL.revokeObjectURL(url);await lookupBarcode(result.getText());}catch{setBusy("");setNotice("Barcode was not clear. Try again in bright light or enter its number below.");}}
  async function readLabel(file:File){setBusy("Reading nutrition label on this device…");setNotice("");try{const Tesseract=await import("tesseract.js");const result=await Tesseract.recognize(file,"eng");setV(current=>({...current,...parseLabel(result.data.text)}));setNotice("Label read. Carefully confirm the serving column and every value before saving.");}catch{setNotice("The label could not be read. Try a straight, well-lit photo.");}finally{setBusy("");}}
  async function save(event:React.FormEvent){event.preventDefault();const {error}=await supabase!.from("ingredients").insert({user_id:user.id,name:v.name,brand:v.brand||null,barcode:v.barcode||null,serving_amount:Number(v.serving_amount),serving_unit:v.serving_unit,calories:Number(v.calories||0),protein:Number(v.protein||0),carbohydrates:Number(v.carbohydrates||0),fat:Number(v.fat||0),source:v.source});if(error)setNotice(error.message);else done();}
  return <div className="overlay"><div className="sheet scroll-sheet"><div className="sheet-handle"/><div className="sheet-title"><div><span className="eyebrow">Food capture</span><h2>New ingredient</h2></div><button className="icon-btn" onClick={close}><X/></button></div>
    <div className="capture-actions"><button type="button" onClick={()=>barcodeInput.current?.click()}><Barcode/><strong>Scan barcode</strong><small>Photograph the barcode</small></button><button type="button" onClick={()=>labelInput.current?.click()}><Camera/><strong>Read label</strong><small>Photograph nutrition panel</small></button></div>
    <input ref={barcodeInput} hidden type="file" accept="image/*" capture="environment" onChange={e=>e.target.files?.[0]&&scanBarcode(e.target.files[0])}/><input ref={labelInput} hidden type="file" accept="image/*" capture="environment" onChange={e=>e.target.files?.[0]&&readLabel(e.target.files[0])}/>
    {busy&&<div className="capture-status"><SpinnerGap className="spin"/>{busy}</div>}{notice&&<div className="capture-notice">{notice}</div>}
    <form className="builder" onSubmit={save}><label>Ingredient name<input required value={v.name} onChange={e=>set("name",e.target.value)} placeholder="Rolled oats"/></label><label>Brand (optional)<input value={v.brand} onChange={e=>set("brand",e.target.value)} placeholder="Uncle Tobys"/></label><label>Barcode (optional)<div className="input-action"><input inputMode="numeric" value={v.barcode} onChange={e=>set("barcode",e.target.value)} placeholder="Scan or enter number"/><button type="button" disabled={!v.barcode||!!busy} onClick={()=>lookupBarcode(v.barcode)}>Look up</button></div></label><div className="field-row"><label>Nutrition amount<input required type="number" min="0.01" step="0.01" value={v.serving_amount} onChange={e=>set("serving_amount",e.target.value)}/></label><label>Unit<select value={v.serving_unit} onChange={e=>set("serving_unit",e.target.value)}>{units.map(unit=><option key={unit}>{unit}</option>)}</select></label></div><p className="form-hint">Nutrition for that amount</p><div className="macro-fields">{[["calories","Calories"],["protein","Protein (g)"],["carbohydrates","Carbs (g)"],["fat","Fat (g)"]].map(([key,label])=><label key={key}>{label}<input type="number" min="0" step="0.1" value={v[key as keyof Values]} onChange={e=>set(key as keyof Values,e.target.value)}/></label>)}</div><button className="primary full" disabled={!!busy}>Review and save ingredient</button></form>
  </div></div>;
}
