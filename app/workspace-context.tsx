'use client';
import {createContext,useContext} from 'react';
import type {Filters} from '@/lib/domain';
export type Focus={tab?:string;q?:string;year?:string;category?:string;market?:Filters};
export const WorkspaceContext=createContext<{year:string;setYear:(y:string)=>void;marketFilters:Filters;setMarketFilters:(f:Filters)=>void;focus:Focus;go:(page:string,focus?:Focus)=>void}>({year:'2025',setYear:()=>{},marketFilters:{},setMarketFilters:()=>{},focus:{},go:()=>{}});
export const useWorkspace=()=>useContext(WorkspaceContext);
