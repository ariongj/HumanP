'use client';
import {useEffect,useState} from 'react';
import feed from '@/monitor/feed.json';
import type {Row} from '@/lib/domain';
export function useMonitorUnread(){
 const [count,setCount]=useState(0);
 useEffect(()=>{const update=()=>{let decisions:Row={};try{const value=JSON.parse(localStorage.getItem('humanplus-procurement-decisions-v1')||'{}');decisions=value&&typeof value==='object'&&!Array.isArray(value)?value:{};}catch{}setCount((feed.notices as Row[]).filter(r=>decisions[r.notice_id]?.fingerprint!==r.fingerprint).length);};update();addEventListener('humanplus-monitor-review',update);addEventListener('storage',update);return()=>{removeEventListener('humanplus-monitor-review',update);removeEventListener('storage',update);};},[]);
 return count;
}
