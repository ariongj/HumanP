'use client';
import {createContext,useContext,useMemo,useState,type ReactNode} from 'react';
import {createEntityScope,emptyEntitySelection,type EntitySelection} from '@/lib/entity-scope';
import {useRawData} from './data-source';
const fallback=createEntityScope({},emptyEntitySelection);
const EntityContext=createContext({selection:emptyEntitySelection,select:(_s:EntitySelection)=>{},scope:fallback,ready:true,error:''});
export const useEntityScope=()=>useContext(EntityContext);
export function EntityScopeProvider({children,onChange}:{children:ReactNode;onChange:()=>void}){
 const market=useRawData('market'),products=useRawData('products'),medical=useRawData('medical');
 const [selection,setSelection]=useState<EntitySelection>(emptyEntitySelection);
 const scope=useMemo(()=>createEntityScope({market:market.data,products:products.data,medical:medical.data},selection),[market.data,products.data,medical.data,selection]);
 return <EntityContext.Provider value={{selection,select:next=>{setSelection(next);onChange();},scope,ready:Boolean(market.data&&products.data&&medical.data),error:market.error||products.error||medical.error}}>{children}</EntityContext.Provider>;
}
