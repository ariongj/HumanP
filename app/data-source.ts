'use client';
import {useEffect,useState} from 'react';
import {appFetch} from '@/lib/browser-vault';
const cache=new Map<string,any>();
export function useRawData(name:string){const [data,setData]=useState<any>(cache.get(name));const [error,setError]=useState('');useEffect(()=>{let current=true;setData(cache.get(name));setError('');if(!cache.has(name))appFetch('/api/data/'+name,{cache:'no-store'}).then(async r=>{if(!r.ok)throw new Error((await r.json() as any).error||'Ngarkimi dështoi');return r.json();}).then(d=>{cache.set(name,d);if(current)setData(d);}).catch(e=>{if(current)setError(e.message);});return()=>{current=false;};},[name]);return {data,error};}
