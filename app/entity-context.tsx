'use client';
import {createContext,useContext,useMemo,type ReactNode} from 'react';
import {createEntityScope,emptyEntitySelection,type EntitySelection} from '@/lib/entity-scope';
import {useRawData} from './data-source';
const fallback=createEntityScope({},emptyEntitySelection);
const EntityContext=createContext({selection:emptyEntitySelection,select:(_s:EntitySelection)=>{},scope:fallback,ready:true,error:''});
export const useEntityScope=()=>useContext(EntityContext);
export function EntityScopeProvider({children,selection,onSelect}:{children:ReactNode;selection:EntitySelection;onSelect:(s:EntitySelection)=>void}){
 const market=useRawData('market'),products=useRawData('products'),medical=useRawData('medical'),budget=useRawData('budget');
 const scope=useMemo(()=>createEntityScope({market:market.data,products:products.data,medical:medical.data,budget:budget.data},selection),[market.data,products.data,medical.data,budget.data,selection]);
 return <EntityContext.Provider value={{selection,select:onSelect,scope,ready:Boolean(market.data&&products.data&&medical.data&&budget.data),error:market.error||products.error||medical.error||budget.error}}>{children}</EntityContext.Provider>;
}
