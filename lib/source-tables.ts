import type {Row} from './domain';
export type SourceTable={name:string;rows:Row[]};
export function parseCSV(text:string):Row[]{
 text=text.replace(/^\uFEFF/,'');const first=text.split(/\r?\n/,1)[0],delimiter=first.split(';').length>first.split(',').length?';':',';
 const records:string[][]=[];let row:string[]=[],cell='',quoted=false;
 for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}else if(!quoted&&(c===delimiter||c==='\n'||c==='\r')){row.push(cell);cell='';if(c!==delimiter){if(c==='\r'&&text[i+1]==='\n')i++;if(row.some(v=>v!==''))records.push(row);row=[];}}else cell+=c;}
 if(quoted)throw new Error('CSV ka thonjëza të pambyllura. Shkarko origjinalin për shqyrtim.');
 if(cell!==''||row.length){row.push(cell);records.push(row);}if(!records.length)return [];
 const used=new Set<string>(),headers=records.shift()!.map((v,i)=>{let name=v||'column_'+(i+1);while(used.has(name))name+='_';used.add(name);return name;});
 return records.map(values=>Object.fromEntries(values.map((v,i)=>[headers[i]||'column_'+(i+1),v])));
}
export function sourceTables(text:string,fileName:string):SourceTable[]{
 if(/\.csv$/i.test(fileName))return [{name:'Tabela CSV',rows:parseCSV(text)}];
 return objectTables(JSON.parse(text));
}
export function objectTables(value:any):SourceTable[]{
 const tables:SourceTable[]=[];
 function visit(v:any,path:string,depth:number){
  if(Array.isArray(v)){tables.push({name:path,rows:v.map(x=>x&&typeof x==='object'&&!Array.isArray(x)?x:{value:x})});return;}
  if(!v||typeof v!=='object')return;
  const scalars=Object.entries(v).filter(([,x])=>x===null||typeof x!=='object');if(scalars.length)tables.push({name:path+' · fusha',rows:scalars.map(([field,value])=>({field,value}))});
  for(const [key,child] of Object.entries(v)){if(child&&typeof child==='object'){if(depth<6)visit(child,path+'.'+key,depth+1);else tables.push({name:path+'.'+key,rows:[{value:child}]});}}
 }
 visit(value,'root',0);return tables.length?tables:[{name:'Vlera',rows:[{value}]}];
}
