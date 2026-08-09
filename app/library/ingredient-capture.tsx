"use client";

import { useEffect, useRef, useState } from "react";
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

type Nutriments = Record<string, string | number | null | undefined>;
function nutritionFromProduct(product:{serving_size?:string;serving_quantity?:number|string;nutrition_data_per?:string;nutriments?:Nutriments}) {
  const n=product.nutriments||{};
  const number=(...keys:string[])=>{for(const key of keys){const value=Number(n[key]);if(Number.isFinite(value))return value;}return null;};
  const kjToCalories=(value:number|null)=>value===null?null:Math.round((value/4.184)*10)/10;
  const per100=["energy-kcal_100g","proteins_100g","carbohydrates_100g","fat_100g"].some(key=>number(key)!==null);
  const perServing=["energy-kcal_serving","proteins_serving","carbohydrates_serving","fat_serving"].some(key=>number(key)!==null);
  const basis=per100?"100g":perServing?"serving":"generic";
  const suffix=basis==="100g"?"_100g":basis==="serving"?"_serving":"";
  const serving=String(product.serving_size||"").match(/(\d+(?:[.,]\d+)?)\s*(g|ml)\b/i);
  const amount=basis==="100g"?"100":String(product.serving_quantity||serving?.[1]||1).replace(",",".");
  const unit=basis==="100g"?"g":serving?.[2]?.toLowerCase()||"serving";
  const calories=number(`energy-kcal${suffix}`)??kjToCalories(number(`energy-kj${suffix}`,`energy${suffix}`));
  const values={serving_amount:amount,serving_unit:unit,calories,protein:number(`proteins${suffix}`),carbohydrates:number(`carbohydrates${suffix}`),fat:number(`fat${suffix}`)};
  return {...values,found:[values.calories,values.protein,values.carbohydrates,values.fat].some(value=>value!==null)};
}

export default function IngredientCapture({user,close,done}:{user:User;close:()=>void;done:()=>void}) {
  const [v,setV]=useState<Values>({name:"",brand:"",barcode:"",serving_amount:"100",serving_unit:"g",calories:"",protein:"",carbohydrates:"",fat:"",source:"manual"});
  const [busy,setBusy]=useState(""); const [notice,setNotice]=useState(""); const [scanning,setScanning]=useState(false);
  const videoRef=useRef<HTMLVideoElement>(null); const scannerControls=useRef<{stop:()=>void}|null>(null); const labelInput=useRef<HTMLInputElement>(null);
  const servingEdit=useRef<{amount:number;calories:string;protein:string;carbohydrates:string;fat:string}|null>(null);
  const set=(key:keyof Values,value:string)=>setV(current=>({...current,[key]:value}));
  const startServingEdit=()=>{servingEdit.current={amount:Number(v.serving_amount),calories:v.calories,protein:v.protein,carbohydrates:v.carbohydrates,fat:v.fat}};
  const resizeServing=(value:string)=>setV(current=>{const start=servingEdit.current,next=Number(value);if(!start||!Number.isFinite(next)||next<=0||!Number.isFinite(start.amount)||start.amount<=0)return{...current,serving_amount:value};const scale=(macro:string)=>macro===""?"":String(Math.round(Number(macro)*(next/start.amount)*100)/100);return{...current,serving_amount:value,calories:scale(start.calories),protein:scale(start.protein),carbohydrates:scale(start.carbohydrates),fat:scale(start.fat)}});
  useEffect(()=>{if(!scanning)return;let cancelled=false;(async()=>{try{const [{BrowserMultiFormatReader},{BarcodeFormat,DecodeHintType}]=await Promise.all([import("@zxing/browser"),import("@zxing/library")]);const hints=new Map();hints.set(DecodeHintType.POSSIBLE_FORMATS,[BarcodeFormat.EAN_13,BarcodeFormat.EAN_8,BarcodeFormat.UPC_A,BarcodeFormat.UPC_E,BarcodeFormat.CODE_128]);hints.set(DecodeHintType.TRY_HARDER,true);const reader=new BrowserMultiFormatReader(hints,{delayBetweenScanAttempts:150,delayBetweenScanSuccess:500});const permission=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:"environment"}}});permission.getTracks().forEach(track=>track.stop());const devices=await BrowserMultiFormatReader.listVideoInputDevices();const rear=[...devices].reverse().find(device=>/back|rear|environment/i.test(device.label))||devices.at(-1);const controls=await reader.decodeFromVideoDevice(rear?.deviceId,videoRef.current!,async(result,_error,activeControls)=>{if(!result||cancelled)return;cancelled=true;const code=result.getText();activeControls.stop();scannerControls.current=null;setBusy("Barcode found. Loading nutrition…");setScanning(false);await lookupBarcode(code);});scannerControls.current=controls;}catch(error){setScanning(false);const detail=error instanceof Error?error.message:"Unknown camera error";setNotice(`Camera could not start: ${detail}. Check Safari camera permission and try again.`);}})();return()=>{cancelled=true;scannerControls.current?.stop();scannerControls.current=null}},[scanning]);
  async function lookupBarcode(code:string){setBusy("Looking up barcode…");setNotice("");try{const response=await fetch(`/api/barcode/${encodeURIComponent(code)}`);const body=await response.json();if(!response.ok||!body.product)throw new Error(body.error||"Product not found. Photograph the nutrition label instead.");const p=body.product,nutrition=nutritionFromProduct(p);setV(current=>({...current,name:p.product_name||current.name,brand:p.brands||current.brand,barcode:code,serving_amount:nutrition.serving_amount,serving_unit:nutrition.serving_unit,calories:nutrition.calories===null?"":String(nutrition.calories),protein:nutrition.protein===null?"":String(nutrition.protein),carbohydrates:nutrition.carbohydrates===null?"":String(nutrition.carbohydrates),fat:nutrition.fat===null?"":String(nutrition.fat),source:"barcode"}));setNotice(nutrition.found?"Barcode found and nutrition filled in. Review the values, then save the ingredient.":"Barcode found, but its nutrition is missing from the free food database. Use Read label or enter the values manually.");}catch(error){setNotice(error instanceof Error?error.message:"Could not read that product.");}finally{setBusy("");}}
  async function readLabel(file:File){setBusy("Reading nutrition label on this device…");setNotice("");try{const Tesseract=await import("tesseract.js");const result=await Tesseract.recognize(file,"eng");setV(current=>({...current,...parseLabel(result.data.text)}));setNotice("Label read. Carefully confirm the serving column and every value before saving.");}catch{setNotice("The label could not be read. Try a straight, well-lit photo.");}finally{setBusy("");}}
  async function save(event:React.FormEvent){event.preventDefault();const {error}=await supabase!.from("ingredients").insert({user_id:user.id,name:v.name,brand:v.brand||null,barcode:v.barcode||null,serving_amount:Number(v.serving_amount),serving_unit:v.serving_unit,calories:Number(v.calories||0),protein:Number(v.protein||0),carbohydrates:Number(v.carbohydrates||0),fat:Number(v.fat||0),source:v.source});if(error)setNotice(error.message);else done();}
  return <div className="overlay"><div className="sheet scroll-sheet"><div className="sheet-handle"/><div className="sheet-title"><div><span className="eyebrow">Food capture</span><h2>New ingredient</h2></div><button className="icon-btn" onClick={close}><X/></button></div>
    <div className="capture-actions"><button type="button" onClick={()=>{setNotice("");setScanning(true)}}><Barcode/><strong>Scan barcode</strong><small>Point camera at the barcode</small></button><button type="button" onClick={()=>labelInput.current?.click()}><Camera/><strong>Read label</strong><small>Photograph nutrition panel</small></button></div>
    <input ref={labelInput} hidden type="file" accept="image/*" capture="environment" onChange={e=>e.target.files?.[0]&&readLabel(e.target.files[0])}/>
    {scanning&&<div className="scanner"><video ref={videoRef} autoPlay muted playsInline/><div className="scanner-guide"><span/><p>Move closer until the barcode fills the frame</p></div><div className="scanner-title"><Barcode/><span><strong>Scan barcode</strong><small>Looking automatically…</small></span></div><button type="button" onClick={()=>setScanning(false)}><X/> Cancel</button></div>}
    {busy&&<div className="capture-status"><SpinnerGap className="spin"/>{busy}</div>}{notice&&<div className="capture-notice">{notice}</div>}
    <form className="builder" onSubmit={save}><label>Ingredient name<input required value={v.name} onChange={e=>set("name",e.target.value)} placeholder="Rolled oats"/></label><label>Brand (optional)<input value={v.brand} onChange={e=>set("brand",e.target.value)} placeholder="Uncle Tobys"/></label><label>Barcode (optional)<div className="input-action"><input inputMode="numeric" value={v.barcode} onChange={e=>set("barcode",e.target.value)} placeholder="Scan or enter number"/><button type="button" disabled={!v.barcode||!!busy} onClick={()=>lookupBarcode(v.barcode)}>Look up</button></div></label><div className="field-row"><label>Values are for<input required type="number" min="0.01" step="0.01" value={v.serving_amount} onFocus={startServingEdit} onChange={e=>resizeServing(e.target.value)} onBlur={()=>{servingEdit.current=null}}/></label><label>Unit<select value={v.serving_unit} onChange={e=>set("serving_unit",e.target.value)}>{units.map(unit=><option key={unit}>{unit}</option>)}</select></label></div><p className="form-hint">Changing this amount recalculates calories and macros</p><div className="macro-fields">{[["calories","Calories"],["protein","Protein (g)"],["carbohydrates","Carbs (g)"],["fat","Fat (g)"]].map(([key,label])=><label key={key}>{label}<input type="number" min="0" step="0.1" value={v[key as keyof Values]} onChange={e=>set(key as keyof Values,e.target.value)}/></label>)}</div><button className="primary full" disabled={!!busy}>Review and save ingredient</button></form>
  </div></div>;
}
