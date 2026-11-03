'use client';
import {useEffect,useState} from 'react';
import {ArrowUpRight,Sparkles} from 'lucide-react';
import report from '@/monitor/ai-report.json';
import type {Row} from '@/lib/domain';

const daily=report as Row;
const storageKey='humanplus-daily-report-read-v1';
const eventName='humanplus-daily-report-read';
export function markDailyReportRead(){
 if(daily.status!=='ready'||!daily.generated_at)return;
 try{localStorage.setItem(storageKey,daily.generated_at);}catch{}
 dispatchEvent(new CustomEvent(eventName,{detail:daily.generated_at}));
}
export default function DailyReportNotice({onOpen}:{onOpen:()=>void}){
 const [unread,setUnread]=useState(false);
 useEffect(()=>{
  const update=(event?:Event)=>{
   if(event instanceof CustomEvent&&event.detail===daily.generated_at){setUnread(false);return;}
   let seen='';try{seen=localStorage.getItem(storageKey)||'';}catch{}
   setUnread(daily.status==='ready'&&Boolean(daily.generated_at)&&seen!==daily.generated_at);
  };
  update();addEventListener(eventName,update);addEventListener('storage',update);
  return()=>{removeEventListener(eventName,update);removeEventListener('storage',update);};
 },[]);
 if(!unread)return null;
 const fresh=Number.isFinite(Date.parse(daily.generated_at))&&Date.now()-Date.parse(daily.generated_at)<=36*3600000;
 return <div className="agent-report-notice" role="status"><Sparkles size={22}/><div><strong>{fresh?'Raporti ditor AI është gati':'Raport AI i ruajtur'}</strong><p>{daily.date} · {daily.entries?.length||0} procedura me analizë AI. Kontrollo afatet, kërkesat dhe hapat e sugjeruar.</p></div><button className="button secondary" onClick={()=>{markDailyReportRead();onOpen();}}>{fresh?'Lexo raportin ditor':'Lexo raportin e ruajtur'} <ArrowUpRight size={15}/></button></div>;
}
