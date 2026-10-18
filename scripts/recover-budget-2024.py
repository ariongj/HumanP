#!/usr/bin/env python3
"""Recover the 2024 health-budget evidence from hash-pinned official PDFs.

Requires PyMuPDF. Inputs and plaintext output must stay outside the Git checkout.
Coordinates are PDF points, one-based page numbers are retained in every row.
"""
import argparse, collections, copy, hashlib, json, pathlib, re, shutil, unicodedata
import pymupdf

SOURCES = {
    'budget-2024': ('a7ef95523599e2da45cc2cce229f420794e4a1184534f6d12a4a18c07b7445fa', 'https://gzk.rks-gov.net/ActDetail.aspx?ActID=85052', 'Ligji 08/L-260 · buxheti 2024 dhe shtojcat'),
    'audit-2024': ('92f2df7487174701bb4d88f106dfac531d9093229d655e448947c1fbbb4caf33', 'https://zka-rks.org/cms/ReportFiles/2025_f55bfd12-deb7-4182-a525-d74fdb2a25fe.pdf', 'ZKA · Raporti vjetor i auditimit 2024'),
    'msh-audit-2024': ('79b15bd6330f1d81feeb6acc5267b811e11f4eaab32e6b5bbfeb301a9c980d37', 'https://zka-rks.org/cms/ReportFiles/2025_34f6885b-da89-43c3-b7ca-b85bf26a4614.pdf', 'ZKA · Ministria e Shëndetësisë 2024'),
    'shskuk-audit-2024': ('f43234f9edf8fc95dedabd1d92cf4171f5b3de2fd5e3aeb042b6b3d509769f3a', 'https://zka-rks.org/cms/ReportFiles/2025_4286e926-f4c0-43b9-a9e3-cb942d294656.pdf', 'ZKA · SHSKUK 2024'),
    'fssh-audit-2024': ('ab9060b709daf9fd6b7fcddf384597c053c3209993ced2bfaa23dcdc28092e87', 'https://zka-rks.org/cms/ReportFiles/2025_e17c7bbb-f705-45ba-93b6-14a2684f5390.pdf', 'ZKA · Fondi i Sigurimeve Shëndetësore 2024'),
    'prishtina-2024': ('1df2e122c6e770324f5bc50f776e2e22fb9acf386f2628538c5cac122a17db3f', 'https://prishtinaonline.com/uploads/raporti_financiar_buxhetor_i_komunes_se_prishtines_per_periudhen_1_janar_-_31_dhjetor_2024.pdf', 'Prishtina · Raporti financiar vjetor 2024'),
}
ORGS = {'206': 'Ministria e Shëndetësisë', '220': 'SHSKUK', '224': 'Fondi i Sigurimeve Shëndetësore'}
COMPONENTS = ['employees', 'wages', 'goods_services', 'utilities', 'subsidies_transfers', 'capital', 'reserves', 'total']
CAPITAL_KEYS = ['reported_cumulative_expenditure_through_prior_year_eur', 'approved_continuing_current_year_eur', 'approved_new_current_year_eur', 'approved_current_year_eur', 'projection_next_year_eur', 'projection_second_year_eur', 'projection_later_years_eur', 'reported_total_project_value_eur']
HEALTH_TERMS = ['shendet', 'mjekesor', 'spital', 'qkmf', 'qmf', 'ambulanc', 'qmu', 'qkmp', 'qkuk', 'diagnostik']
def sha(b): return hashlib.sha256(b).hexdigest()
def norm(s): return ''.join(c for c in unicodedata.normalize('NFKD', s.lower()) if not unicodedata.combining(c))
def text(s): return ' '.join(s.split())
def number(s): return int(s.replace(',', '')) if s and s != '-' else 0
def write(path, value): path.write_text(json.dumps(value, ensure_ascii=False, separators=(',', ':')))
def provenance(name, page, table):
    digest, url, title = SOURCES[name]
    return {'source_url': url, 'source_document': 'documents/'+name+'.pdf', 'source_sha256': digest, 'pdf_page': page, 'table': table, 'retrieved_at': '2026-10-18', 'unit': 'EUR'}
def line_at(words, y): return sorted([w for w in words if abs(w[1]-y) < 1], key=lambda w:w[0])
def cell(words, low, high): return text(' '.join(w[4] for w in words if low <= w[0] < high))
def numeric_cells(words, edges):
    out=[]
    for lo,hi in zip(edges,edges[1:]):
        v=cell(words,lo,hi);assert re.fullmatch(r'[\d,]+|-|',v),v;out.append(number(v))
    return out

def central(pdf):
    words=pdf[85].get_text('words');rows=[]
    for code,name in ORGS.items():
        anchor=next(w for w in words if w[4]==code and w[0]<58);line=line_at(words,anchor[1])
        values=numeric_cells(line,[260,310,360,410,465,540,625,675,740,815,870,930,995,1055,1125])
        keys=COMPONENTS+['projection_operating_y1','projection_capital_y1','projection_total_y1','projection_operating_y2','projection_capital_y2','projection_total_y2']
        row=dict(zip(keys,values));row.update(year='2024',organization_code=code,organization=name,organization_source_label=cell(line,58,260),basis='initial_approved_annex1_includes_investment_clause',coverage='organization_total; includes investment clause; projects and programmes are already included',**provenance('budget-2024',86,'Shtojca 1'))
        row['sum_difference_eur']=row['total']-sum(row[k] for k in COMPONENTS[1:-1]);assert row['sum_difference_eur']==0
        rows.append(row)
    return rows

def municipal(pdf):
    rows=[];leaves=[];org=None;programme=None
    for page in range(201,344):
        words=pdf[page-1].get_text('words')
        anchors=sorted([w for w in words if w[4]=='Total' and 399<w[0]<402 and 95<w[1]<560],key=lambda w:w[1])
        for a in anchors:
            line=line_at(words,a[1]);code=cell(line,7,23);prog=cell(line,23,40);sub=cell(line,40,60)
            if code and re.fullmatch(r'6\d\d',code):org=(code,cell(line,84,161));programme=None
            if prog:programme=prog
            if programme not in ('730','770'):continue
            assert org,(page,line)
            values=numeric_cells(line,[475,515,560,610,660,710,765,820,875,930,980])
            r=dict(zip(COMPONENTS+['projection_total_y1','projection_total_y2'],values))
            r.update(year='2024',municipality_code=org[0],municipality=org[1],programme_code=programme,subprogramme_code=sub,function_code=cell(line,60,83),label=cell(line,161,400),hierarchy_level='programme' if prog else 'subprogramme',basis='initial_approved_health_programmes_730_770',coverage='Municipal health programmes 730 and 770; social-care programme 755 is excluded',**provenance('budget-2024',page,'4.1'))
            r['sum_difference_eur']=r['total']-sum(r[k] for k in COMPONENTS[1:-1])
            assert abs(r['sum_difference_eur'])<=1,(page,r)
            if prog in ('730','770'):rows.append(r)
            elif sub:leaves.append(r)
    assert len(rows)==41 and len({r['municipality_code'] for r in rows})==38
    parents=copy.deepcopy(rows);combined=[]
    for code in sorted({r['municipality_code'] for r in rows}):
        parts=[r for r in rows if r['municipality_code']==code];r=copy.deepcopy(parts[0])
        for k in COMPONENTS+['projection_total_y1','projection_total_y2','sum_difference_eur']:r[k]=sum(x[k] for x in parts)
        r['programme_code']=';'.join(x['programme_code'] for x in parts);r['hierarchy_level']='municipality_health_total'
        children=[x for x in leaves if x['municipality_code']==r['municipality_code']]
        r['primary_care_total']=sum(x['total'] for x in children if x['function_code'].startswith('072'))
        r['secondary_care_total']=sum(x['total'] for x in children if x['function_code'].startswith('073'))
        r['health_administration_total']=sum(x['total'] for x in children if not x['function_code'].startswith(('072','073')))
        r['leaf_total']=sum(x['total'] for x in children);r['parent_minus_leaf_eur']=r['total']-r['leaf_total'];r['pdf_pages']=';'.join(map(str,sorted({r['pdf_page'],*[x['pdf_page'] for x in children]})))
        assert abs(r['parent_minus_leaf_eur'])<=1,(r,children);combined.append(r)
    return combined,parents+leaves

def projects(pdf):
    out=[];org=programme=subprogramme=None;current=None;seen=set();all_projects=0
    for page in [*range(87,201),*range(344,642)]:
        pg=pdf[page-1];table='4.2' if page>=344 else '3.2.B' if page>=194 else '3.2'
        for raw in pg.get_text(sort=True).splitlines():
            s=text(raw)
            if not s:continue
            header=re.match(r'^(\d{5,6})\s+-\s+(.+)$',s)
            if header:
                code,name=header.groups()
                if len(code)==6 and code.endswith('000'):org=(code[:3],name);programme=subprogramme=None
                elif len(code)==6 and not code.endswith('00'):programme=(code,name);subprogramme=None
                else:subprogramme=(code,name)
                current=None;continue
            h=re.match(r'^(?:(\d{4})\s+)?(\d{6}-\d+)\s+(\d+)\s+([\d.]+-[\d.]+)\s+(.+)$',s)
            if h:
                assert org,(page,s);function,proposal,code,dates,name=h.groups();function=function or '';all_projects+=1
                current={'function_code':function,'proposal_code':proposal,'project_code':code,'project_dates_as_reported':dates,'project_name':name,'project_pdf_page':page,'organization_code':org[0],'organization_name':ORGS.get(org[0],org[1]),'program_name':programme[1] if programme else '', 'subprogram_name':subprogramme[1] if subprogramme else ''}
                continue
            funding=re.match(r'^(GQ|THV|FH|FHKI|GPD)\s+((?:[\d,]+\s+){7}[\d,]+)$',s)
            if funding:
                assert current,(page,s)
                fund,amounts=funding.groups();values=[number(x) for x in amounts.split()];assert len(values)==8
                c=copy.deepcopy(current);c.pop('_funded',None);current['_funded']=True;c.update(dict(zip(CAPITAL_KEYS,values)))
                scope='central' if page<344 else 'municipal'
                matched=[k for k in HEALTH_TERMS if k in norm(c['project_name']+' '+c['program_name']+' '+c['subprogram_name'])]
                basis='All projects of MoH 206 / SHSKUK 220' if scope=='central' and org[0] in ORGS else 'COFOG function 07' if c['function_code'].startswith('07') else 'Explicit health facility/service keyword in project or program' if matched else None
                if not basis:continue
                c.update(budget_year='2024',scope=scope,funding_source=fund,source_table=table,amount_pdf_page=page,source_local_file='budget-2024.pdf',prior_expenditure_cutoff_year='2023',projection_next_year='2025',projection_second_year='2026',projection_later_header='>2027 (as printed)',inclusion_basis=basis,inclusion_keywords=matched,scope_caution='Official function 07 and health keywords can include social-care or mixed projects; inspect the source scope.',**provenance('budget-2024',page,table))
                c['row_key']='2024:'+table+':'+c['proposal_code']+':'+fund
                assert c['row_key'] not in seen,c;seen.add(c['row_key'])
                assert abs(values[1]+values[2]-values[3])<=1,c
                c['sum_difference_eur']=values[7]-sum([values[0],*values[3:7]])
                assert abs(c['sum_difference_eur'])<=2,c
                out.append(c);continue
            if s.startswith('Totali'):current=None;continue
            if re.match(r'^(Programi i Investimeve|Data:|Republika|Qeveria|Ministria e Financave|Buxheti i|Tabela |Organizata Buxhetore|Kodi|Funk|1 2 3)',s):continue
            if current and not re.search(r'\d[\d,]*\s+\d[\d,]*\s+\d',s) and not s.startswith(('Aprovuar','Vlerësuara','Shpenz','Burimet')):
                # A wrapped project description precedes its first funding row.
                if not current.get('_funded'):current['project_name']+=' '+s
    return out,all_projects

def execution(pdfs):
    out=[]
    specs=[('msh-audit-2024','206',10,['wages','goods_services','utilities','subsidies_transfers','capital']),('shskuk-audit-2024','220',19,['wages','goods_services','utilities','capital']),('fssh-audit-2024','224',10,['wages','goods_services','utilities','subsidies_transfers'])]
    labels={'wages':'Paga dhe shtesa','goods_services':'Mallra dhe shërbime','utilities':'Shpenzime komunale','subsidies_transfers':'Subvencione dhe transfere','capital':'Investime kapitale'}
    for name,code,page,categories in specs:
        # Table 2 starts at the second occurrence of the organization total.
        lines=pdfs[name][page-1].get_text(sort=True).splitlines();arrays=[]
        for s in lines:
            m=re.search(r'([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s*$',s)
            if m:arrays.append([number(x) for x in m.groups()])
        totals=arrays[0];start=next(i for i,a in enumerate(arrays[1:],1) if a==totals and i>1);values=arrays[start:start+len(categories)+1]
        assert len(values)==len(categories)+1,(name,arrays)
        for i,nums in enumerate(values):
            category=categories[i-1] if i else 'total';initial,final,paid=nums[:3]
            out.append({'year':'2024','period':'2024-01-01/2024-12-31','organization_code':code,'organization':ORGS[code],'row_label':labels.get(category,ORGS[code]),'row_type':'economic_category' if i else 'organization_total','economic_category':category,'initial_budget_eur':initial,'final_simfk_budget_eur':final,'payments_eur':paid,'commitments_obligations_eur':None,'reported_execution_percent':None,'payment_vs_initial_percent':paid/initial*100 if initial else None,'payment_vs_final_percent':paid/final*100 if final else None,'basis':'ZKA_2024_audited_annual_execution_table_2','coverage':'Organization/category totals, not project-specific payments. EUR as printed; source rounding differences retained. 2023 Treasury series has a different source/funding scope; no automatic growth calculation.',**provenance(name,page,'Tabela 2 · kategoritë ekonomike')})
        for i,k in enumerate(['initial_budget_eur','final_simfk_budget_eur','payments_eur']):
            difference=totals[i]-sum(v[i] for v in values[1:]);assert abs(difference)<=1,(name,k,difference)
            out[-len(values)][k+'_component_difference']=difference
    return out

def functions(pdf):
    text_page=pdf[51].get_text(sort=True);rows=[]
    for line in text_page.splitlines():
        m=re.match(r'^\s*(0[1-9]|10)\s+(.+?)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s*$',line)
        if m:
            code,label,a,b,c=m.groups();rows.append({'year':'2024','function_code':code,'label':text(label),'payments_eur':number(a)*1000,'basis':'ZKA_SIMFK_reported_function_cash','source_unit':'EUR 000','coverage':'Reported functional classification; excludes debt service, public lending and deposit returns; audit flags classification errors in non-health functions.',**provenance('audit-2024',52,'Tabela 15 · faqja e shtypur 34')})
    assert len(rows)==10;total=3074595000;assert sum(r['payments_eur'] for r in rows)==total
    health=next(r for r in rows if r['function_code']=='07')
    share={'year':'2024','health_cash_eur':health['payments_eur'],'all_function_cash_eur':total,'health_share_percent':health['payments_eur']/total*100,'basis':'Pagesa faktike të raportuara sipas funksionit 07; jo prokurim dhe jo të ardhura HumanPlus','coverage':health['coverage'],**provenance('audit-2024',52,'Tabela 15 · faqja e shtypur 34')}
    return rows,share

def project_cash(pdf):
    page=pdf[17];words=page.get_text('words');heads=[w for w in words if w[4]=='73350'];assert len(heads)==1
    start=heads[0][1];end=next(w[1] for w in words if w[4].startswith('75526') and w[1]>start)
    anchors=sorted([w for w in words if re.fullmatch(r'\d{5}',w[4]) and w[0]<100 and start<w[1]<end],key=lambda w:w[1]);rows=[]
    previous=start
    for a in anchors:
        line=line_at(words,a[1]);nums=[w[4] for w in line if re.fullmatch(r'[\d,]+\.\d{2}|-',w[4])]
        # The source centers some monetary cells vertically against wrapped labels.
        if len(nums)<3:
            line=sorted([w for w in words if abs(w[1]-a[1])<9],key=lambda w:w[0]);nums=[w[4] for w in line if re.fullmatch(r'[\d,]+\.\d{2}|-',w[4])]
        assert len(nums)==3,(a,nums)
        amounts=[float(n.replace(',','')) if n!='-' else 0 for n in nums]
        description=sorted([w for w in words if 60<=w[0]<350 and previous+2<w[1]<=a[1]+1],key=lambda w:(round(w[1]),w[0]))
        label=' '.join(w[4] for w in description);previous=a[1]
        r={'year':'2024','period':'2024-01-01/2024-12-31','municipality':'Prishtinë','programme':'73350','project_code':a[4],'label':label,'reported_budget_eur':amounts[0],'cash_paid_period_eur':amounts[1],'unspent_reported_eur':amounts[2],'prior_quarter_paid_eur':None,'basis':'Municipal annual reported project budget and cash payments','caveat':'Reported annual budget, not necessarily initial allocation. Part of the municipal budget; do not add it again. A payment total does not identify a procurement contract.',**provenance('prishtina-2024',18,'Drejtoria e Shëndetësisë · 73350')}
        assert abs(amounts[0]-amounts[1]-amounts[2])<.02,r;rows.append(r)
    assert len(rows)==9,len(rows)
    assert abs(sum(r['cash_paid_period_eur'] for r in rows)-2886023.59)<.02
    return rows

def run(args):
    app=pathlib.Path(__file__).resolve().parents[1];base=pathlib.Path(args.baseline).resolve();source=pathlib.Path(args.sources).resolve();out=pathlib.Path(args.output).resolve()
    assert not out.is_relative_to(app) and out!=base
    pdfs={}
    for name,(digest,url,title) in SOURCES.items():
        raw=(source/(name+'.pdf')).read_bytes();assert sha(raw)==digest,name;pdfs[name]=pymupdf.open(stream=raw,filetype='pdf')
    budget=json.loads((base/'data/budget.json').read_text());assert not any(str(r['year'])=='2024' for r in budget['central_budget'])
    central_rows=central(pdfs['budget-2024']);municipal_rows,programmes=municipal(pdfs['budget-2024']);capital_rows,scanned=projects(pdfs['budget-2024']);execution_rows=execution(pdfs);functional,share=functions(pdfs['audit-2024']);cash=project_cash(pdfs['prishtina-2024'])
    for key,rows in [('central_budget',central_rows),('municipal_budget',municipal_rows),('capital_projects',capital_rows),('execution_2023',execution_rows)]:budget[key].extend(rows)
    budget['municipal_programmes_2024']=programmes;budget['functional_execution_2024']=functional
    budget['supplement']['health_actual_share'].append(share);budget['supplement']['health_actual_share'].sort(key=lambda r:str(r['year']))
    budget['supplement']['prishtina_project_cash'].extend(cash)
    receipt={'year':'2024','retrievedAt':'2026-10-18','law':'08/L-260','lawPublishedAt':'2023-12-29','sources':[{ 'name':n, 'sha256':v[0],'url':v[1],'title':v[2]} for n,v in SOURCES.items()], 'counts':{'central':len(central_rows),'municipal':len(municipal_rows),'municipalProgrammes':len(programmes),'capitalFundingRows':len(capital_rows),'capitalProjects':len({r['proposal_code'] for r in capital_rows}),'execution':len(execution_rows),'functional':len(functional),'projectCash':len(cash)},'centralApprovedEUR':sum(r['total'] for r in central_rows),'municipalHealthApprovedEUR':sum(r['total'] for r in municipal_rows),'capitalApprovedEUR':sum(r['approved_current_year_eur'] for r in capital_rows),'centralPaymentsEUR':sum(r['payments_eur'] for r in execution_rows if r['row_type']=='organization_total'),'healthFunctionPaymentsEUR':share['health_cash_eur'],'healthFunctionSharePercent':share['health_share_percent'],'projectCashEUR':sum(r['cash_paid_period_eur'] for r in cash),'scope':'Health institutions 206/220/224; health programmes 730 and 770 in all 38 municipalities; capital projects selected by central organization, COFOG 07, or explicit health keywords. Full original PDFs archived. Not all Kosovo expenditure is healthcare or a HumanPlus sales opportunity.','methods':['Initial allocations from Appendix 1 and municipal table 4.1; structural blank cells are zero only within source budget rows and checked against totals.','One capital row per proposal and funding source; parent totals excluded. Includes projects with zero current-year allocation and future estimates.','Execution uses audited 2024 Table 2 amounts; exact reported totals retained when rounded component sums differ by 1 EUR. Original 2023 Treasury series is preserved with its own scope.','Function 07 share uses EUR 000 converted to EUR; denominator is the same ten-function total.','Prishtina project payments cover the full fiscal year, programme 73350, page 18. These totals overlap allocation and functional views; never add different grains.'],'healthKeywords':HEALTH_TERMS,'scannedCapitalProjectHeaders':scanned,'limitations':['Initial approved allocation is not final budget, awarded value, or actual cash payment.','Municipal payments are not inferred from initial municipal allocations. Only the separately reported Prishtina project cash rows are included.','Audit reports identify functional classification errors; amounts retain the published classification.','Source rounding differences are retained; future project columns remain projections, not approved budgets for future years.']}
    budget['coverage2024']=receipt
    shutil.copytree(base,out,dirs_exist_ok=True)
    docs=json.loads((base/'data/documents.json').read_text())
    for name,(_,url,title) in SOURCES.items():
        target=out/'documents'/(name+'.pdf');shutil.copyfile(source/(name+'.pdf'),target);raw=target.read_bytes()
        docs['records'].append({'id':'documents/'+target.name,'path':'documents/'+target.name,'name':title+'.pdf','category':'budget_2024','bytes':len(raw),'sha256':sha(raw),'date':'2024','status':'Burim zyrtar · buxhet / auditim; shkarkuar 18.10.2026','text':title+' · '+receipt['scope'],'source_url':url})
    method=out/'documents/budget-2024-provenance.json';write(method,receipt);raw=method.read_bytes()
    docs['records'].append({'id':'documents/'+method.name,'path':'documents/'+method.name,'name':'Buxheti_2024_burimet_dhe_metoda.json','category':'budget_2024','bytes':len(raw),'sha256':sha(raw),'date':'2026-10-18','status':'Metoda, mbulimi dhe kufijtë e burimeve','text':raw.decode(),'source_url':SOURCES['budget-2024'][1]})
    overview=json.loads((base/'data/overview.json').read_text());overview['counts']['documents']=len(docs['records']);overview['cashShares']=budget['supplement']['health_actual_share'];overview['budget2024']=receipt
    for name,value in [('budget',budget),('documents',docs),('overview',overview)]:write(out/'data'/(name+'.json'),value)
    previous=json.loads((app/'lib/import-manifest.json').read_text());manifest={}
    for path in [*sorted((out/'data').glob('*.json')),*[out/r['id'] for r in docs['records']]]:
        if not path.is_file():continue
        key=str(path.relative_to(out));raw=path.read_bytes();item=previous.get(key,{});item.update(sha256=sha(raw),bytes=len(raw));item.setdefault('contentType','application/pdf' if path.suffix=='.pdf' else 'application/json');manifest[key]=item
    (app/'lib/import-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n');write(out/'budget-2024-recovery.json',receipt)
    print(json.dumps({'counts':receipt['counts'],'totals':{k:v for k,v in receipt.items() if k.endswith('EUR')},'documents':len(docs['records']),'objects':len(manifest)},indent=2))

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--baseline',required=True);p.add_argument('--sources',required=True);p.add_argument('--output',required=True);run(p.parse_args())
