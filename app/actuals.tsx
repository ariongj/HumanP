'use client';
import {useCallback,useEffect,useState} from 'react';
import type {Actual} from '@/lib/insights';
export type ActualDataset={records:Actual[];sourceName:string;importedAt:string;classification:string};
export function useActuals(){const [dataset,setDataset]=useState<ActualDataset|null>(null),[etag,setEtag]=useState<string|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true);
 const refresh=useCallback(async()=>{setLoading(true);setError('');try{const r=await fetch('/api/actuals',{cache:'no-store'}),data:any=await r.json();if(!r.ok)throw new Error(data.error||'Leximi dështoi.');setDataset(data.dataset);setEtag(data.etag);}catch(e){setError((e as Error).message);}finally{setLoading(false);}},[]);
 useEffect(()=>{void refresh();},[refresh]);return {dataset,etag,error,loading,refresh};}
