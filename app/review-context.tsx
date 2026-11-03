'use client';
import {createContext,useContext,useEffect,useState,type ReactNode} from 'react';
import {parseReviewList,reviewStorageKey,type ReviewList,type ReviewStage} from '@/lib/review-list';
const Context=createContext<{entries:ReviewList;error:string;update:(key:string,stage:ReviewStage|null)=>void}>({entries:{},error:'',update:()=>{}});
export const useReviewList=()=>useContext(Context);
export function ReviewProvider({children}:{children:ReactNode}){
 const [entries,setEntries]=useState<ReviewList>({}),[error,setError]=useState('');
 useEffect(()=>{const read=()=>{try{setEntries(parseReviewList(localStorage.getItem(reviewStorageKey)));}catch{setError('Ruajtja në pajisje nuk është e disponueshme. Lista mbahet vetëm deri në mbylljen e faqes.');}};read();const sync=(event:StorageEvent)=>{if(event.key===reviewStorageKey||event.key===null)read();};addEventListener('storage',sync);return()=>removeEventListener('storage',sync);},[]);
 const update=(key:string,stage:ReviewStage|null)=>{let current=entries;try{if(!error)current=parseReviewList(localStorage.getItem(reviewStorageKey));}catch{}const next={...current};if(stage&&!current[key]&&Object.keys(current).length>=2000){setError('Lista ka arritur 2.000 rekorde. Eksporto dhe hiq disa përpara se të shtosh të tjera.');return;}if(stage)next[key]={stage,savedAt:current[key]?.savedAt||new Date().toISOString()};else delete next[key];setEntries(next);try{localStorage.setItem(reviewStorageKey,JSON.stringify(next));setError('');}catch{setError('Ndryshimi mbahet vetëm në këtë sesion; ruajtja në pajisje dështoi. Eksporto listën para mbylljes.');}};
 return <Context.Provider value={{entries,error,update}}>{children}</Context.Provider>;
}
