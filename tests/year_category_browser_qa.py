"""Shared year/category acceptance against the actual supplied encrypted package."""
import os,json,pathlib,re,csv
from playwright.sync_api import sync_playwright,expect
ROOT=pathlib.Path(__file__).resolve().parents[2]; URL=os.environ.get('PANEL_URL','http://127.0.0.1:62729/');ACCOUNT=json.loads((ROOT/'artifacts/HumanPlus-Login.private.json').read_text());checks=[];errors=[];network=[]
M=json.loads((ROOT/'private/budget-2024-objects/data/market.json').read_text());PRODUCTS=json.loads((ROOT/'private/budget-2024-objects/data/products.json').read_text())['records']
with sync_playwright() as p:
 env=dict(os.environ,LD_LIBRARY_PATH='/home/codex/projects/.browser-libs/root/usr/lib/x86_64-linux-gnu:/home/codex/projects/.browser-engines/deps/root/usr/lib/x86_64-linux-gnu')
 browser=p.chromium.launch(executable_path=os.environ['CHROMIUM_PATH'],headless=True,env=env);context=browser.new_context(viewport={'width':1500,'height':1000},accept_downloads=True);page=context.new_page();page.set_default_timeout(30000)
 page.on('pageerror',lambda e:errors.append(str(e)));page.on('request',lambda r:network.append(r.url) if r.resource_type in ['xhr','fetch'] else None)
 def nav(title):
  if page.viewport_size['width']<761:page.get_by_role('button',name='Hap menunë',exact=True).click()
  page.get_by_role('navigation').get_by_role('button',name=title,exact=True).click();page.get_by_role('heading',name=title,level=1,exact=True).wait_for();page.locator('.empty[role=status]').wait_for(state='hidden')
 def panel(title):return page.locator('section.panel').filter(has=page.get_by_role('heading',name=title,exact=True))
 def count(section):return int(re.sub(r'\D','',section.locator('.table-toolbar>span').first.inner_text()))
 def payload(button):
  with page.expect_download() as dl:button.click()
  return pathlib.Path(dl.value.path()).read_text(encoding='utf-8-sig')
 def report():return json.loads(payload(page.get_by_role('button',name='Raporti JSON',exact=True)))
 def reset():page.get_by_role('button',name='Pastro filtrat e panelit',exact=True).click()
 def year(y):page.get_by_label('Viti në gjithë panelin',exact=True).select_option(y)
 def category(c):page.get_by_label('Kategoria në gjithë panelin',exact=True).select_option(c)
 def supplier(name):
  control=page.locator('.entity-filters .multi-select');control.locator('summary').click();control.get_by_role('textbox').fill(name);control.get_by_role('checkbox',name=name,exact=True).check();control.locator('summary').click()
 try:
  page.goto(URL,wait_until='load',timeout=180000);page.get_by_label('Përdoruesi',exact=True).fill(ACCOUNT['username']);page.get_by_label('Fjalëkalimi',exact=True).fill(ACCOUNT['password']);page.get_by_role('button',name='Hyr në panel',exact=True).click();page.get_by_role('navigation').wait_for(timeout=120000)
  nav('Harta e prokurimit');assert count(panel('Regjistri i prokurimit'))==5394
  page.get_by_label('Viti',exact=True).select_option('2024');expect(page.get_by_label('Viti në gjithë panelin')).to_have_value('2024');assert count(panel('Regjistri i prokurimit'))==1781
  page.get_by_label('Muaji i prokurimit',exact=True).select_option('2024-01');year('2025');expect(page.get_by_label('Muaji i prokurimit',exact=True)).to_have_value('');assert count(panel('Regjistri i prokurimit'))==sum(r['year']=='2025' for r in M['records']);year('2024')
  category('Pajisje mjekësore');assert count(panel('Regjistri i prokurimit'))==105
  expected={r['row_key'] for r in M['records'] if r['year']=='2024' and r['category']=='Pajisje mjekësore'}
  exported=list(csv.DictReader(payload(page.get_by_role('button',name='Eksporto filtrat',exact=True)).splitlines()));assert {r['row_key'] for r in exported}==expected
  page.get_by_role('button',name='Analiza dhe lidhjet',exact=True).click();assert panel('Shpërndarja e rekordeve').locator('.bar-row').count()==1
  page.get_by_role('button',name='Raporti i përzgjedhjes',exact=True).click();r=report();assert {x['row_key'] for x in r['sections'][0]['rows']}==expected;assert r['filters']['entities']['year']=='2024' and r['filters']['entities']['categories']==['Pajisje mjekësore']
  html=payload(page.get_by_role('button',name='Shkarko raportin HTML',exact=True));assert 'Viti në panel: 2024' in html and 'Kategoria në panel: Pajisje mjekësore' in html
  page.get_by_label('Kategoria e raportit',exact=True).select_option('Barna');expected_meds={r['row_key'] for r in M['records'] if r['year']=='2024' and r['category']=='Barna'};assert {x['row_key'] for x in report()['sections'][0]['rows']}==expected_meds
  nav('Harta e prokurimit');assert count(panel('Regjistri i prokurimit'))==len(expected_meds)
  checks.append('Existing market year control and report category control update shared state; 2024 equipment has exactly 105 source rows in table, chart, CSV, HTML and JSON; navigation retains both dimensions')
  reset();nav('Markat dhe produktet');page.get_by_label('Viti',exact=True).select_option('2025');assert count(panel('Markat dhe produktet'))==3
  page.get_by_label('Kategoria',exact=True).select_option('Imunokimi');assert count(panel('Markat dhe produktet'))==1
  page.get_by_label('Marka',exact=True).select_option('Roche');supplier('Biohit MDS SH.P.K.');expect(page.get_by_label('Viti në gjithë panelin')).to_have_value('2025');assert count(panel('Markat dhe produktet'))==1
  nav('Harta e prokurimit');assert count(panel('Regjistri i prokurimit'))==3;nav('Raportet');r=report();assert len(r['sections'][0]['rows'])==3 and r['filters']['entities']=={'brand':'Roche','suppliers':['Biohit MDS SH.P.K.'],'year':'2025','categories':['Imunokimi']}
  page.get_by_role('tab',name='Produktet dhe markat',exact=True).click();assert len(report()['sections'][0]['rows'])==1
  nav('Markat');assert count(panel('Evidenca e markave'))==1;expect(page.get_by_label('Viti i evidencës',exact=True)).to_have_value('2025')
  nav('Të dhënat');page.locator('.dataset-list button').filter(has_text='Produktet dhe markat').click();assert count(panel('Produktet dhe markat'))==1;assert len(json.loads(payload(page.get_by_role('button',name='JSON i përzgjedhjes',exact=True)))['records'])==1
  nav('Përmbledhja');assert page.locator('.stats .stat strong').first.inner_text()=='3'
  nav('Prezantimi HumanPlus');page.get_by_role('tab',name='Historiku i prokurimit',exact=True).click();assert page.locator('.stats .stat strong').first.inner_text()=='3';brief=json.loads(payload(page.get_by_role('button',name='Eksporto briefin',exact=True)));assert brief['entities']['year']=='2025' and brief['entities']['categories']==['Imunokimi'] and brief['historicalRecords']==3
  checks.append('All four dimensions intersect: 2025 + Imunokimi + Roche + Biohit yields 1 product and 3 documented procedure rows, consistent across brands, data JSON, overview, presentation and both report types')
  # Missing years do not become snapshot/packaging years.
  reset();nav('Markat dhe produktet');page.get_by_label('Viti',exact=True).select_option('unknown');assert count(panel('Markat dhe produktet'))==3;page.get_by_role('button',name='Raporti i produkteve',exact=True).click();assert len(report()['sections'][0]['rows'])==3
  page.get_by_role('tab',name='Prokurimi',exact=True).click();assert report()['sections'][0]['rows']==[];expect(page.get_by_label('Viti i raportit',exact=True)).to_have_value('unknown')
  year('2024');page.get_by_role('tab',name='Buxheti dhe pagesat',exact=True).click();r=report();assert r['sections'][0]['total']==263660768 and len(r['sections'][0]['rows'])==3
  year('');r=report();assert len(r['sections'][0]['rows'])==12 and r['sections'][0]['total'] is None;assert len({x['year'] for x in r['sections'][0]['rows']})==4
  year('2024');nav('Buxhetet publike');assert count(panel('Ndarjet qendrore'))==3;page.get_by_label('Viti',exact=True).select_option('2025');nav('Markat dhe produktet');assert count(panel('Markat dhe produktet'))==3
  nav('Regjistri i barnave');assert count(panel('Regjistri i barnave'))==0;year('2026');assert count(panel('Regjistri i barnave'))==4631
  checks.append('Unknown-year products remain separate, reports preserve empty unknown-year procurement, all-year budget reports separate annual rows without combined totals, and medicine registry uses its documented snapshot year')
  nav('Sektori mjekësor');page.get_by_label('Kategoria mjekësore',exact=True).select_option('Laborator dhe diagnostikë');assert count(panel('Njoftimet'))==11
  nav('Prezantimi HumanPlus');assert page.locator('.stats .stat strong').first.inner_text()=='11';page.get_by_label('Kategoria e prezantimit',exact=True).select_option('Stomatologji');assert page.locator('.stats .stat strong').first.inner_text()=='3'
  nav('Sektori mjekësor');assert count(panel('Njoftimet'))==3;year('2024');assert count(panel('Njoftimet'))==0;year('2026');assert count(panel('Njoftimet'))==3
  checks.append('Medical and presentation category controls update each other; changing the shared year excludes and restores medical notices without dropping the category')
  reset();nav('Harta e prokurimit');year('2024');page.locator('.advanced-explorer > summary').click();multi=page.locator('.advanced-explorer .multi-select').filter(has=page.locator('summary span',has_text=re.compile('^Kategoritë$')));multi.locator('summary').click()
  for c in ['Barna','Pajisje mjekësore']:
   multi.get_by_role('textbox').fill(c);multi.get_by_role('checkbox',name=c,exact=True).check()
  multi.locator('summary').click();expected_union=expected|expected_meds;assert count(panel('Regjistri i prokurimit'))==len(expected_union)
  page.get_by_label('Emri i pamjes',exact=True).fill('Shared year and categories');page.get_by_role('button',name='Ruaj pamjen',exact=True).click();reset();assert count(panel('Regjistri i prokurimit'))==5394;page.get_by_role('button',name='Shared year and categories',exact=True).click();assert count(panel('Regjistri i prokurimit'))==len(expected_union)
  page.get_by_role('button',name='Raporti i përzgjedhjes',exact=True).click();r=report();assert set(r['filters']['entities']['categories'])=={'Barna','Pajisje mjekësore'} and {x['row_key'] for x in r['sections'][0]['rows']}==expected_union
  # Category chart drill-down promotes its chosen value globally.
  panel('Prokurimi sipas kategorisë').locator('.bar-row').filter(has=page.locator('.bar-label',has_text=re.compile('^Barna$'))).click();expect(page.get_by_label('Kategoria në gjithë panelin',exact=True)).to_have_value('Barna')
  nav('Harta e prokurimit');page.get_by_label('Popullata e prokurimit',exact=True).select_option('national2024');expected_national={r['row_key'] for r in M['nationalRecords2024'] if r['category']=='Barna'};assert count(panel('Regjistri i prokurimit'))==len(expected_national)
  year('2025');assert count(panel('Regjistri i prokurimit'))==0;page.get_by_role('button',name='Raporti i përzgjedhjes',exact=True).click();assert report()['sections'][0]['rows']==[] and report()['year']=='2025'
  reset();nav('Markat dhe produktet');assert count(panel('Markat dhe produktet'))==11;nav('Harta e prokurimit');page.get_by_label('Popullata e prokurimit',exact=True).select_option('');assert count(panel('Regjistri i prokurimit'))==5394
  checks.append('Multiple categories OR together and persist in saved views/reports; graph clicks set global category; national 2024 remains a separate population and does not override a later shared year; reset restores all rows')
  year('2024');category('Pajisje mjekësore');page.screenshot(path=str(ROOT/'artifacts/year-category-desktop.png'));page.set_viewport_size({'width':375,'height':812});page.wait_for_timeout(400);assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');page.screenshot(path=str(ROOT/'artifacts/year-category-mobile.png'));nav('Raportet');page.wait_for_timeout(400);assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');assert len(report()['sections'][0]['rows'])==105
  assert not errors,errors;assert not network,network
  result={'url':URL,'checks':checks+['Shared controls fit mobile; no uncaught browser errors or data network requests'],'errors':errors,'dataNetworkRequests':network};(ROOT/'artifacts/year-category-browser-verification.json').write_text(json.dumps(result,indent=2));print(json.dumps(result,indent=2))
 except Exception:
  page.screenshot(path=str(ROOT/'artifacts/year-category-failure.png'));print('Errors:',errors);raise
 finally:context.close();browser.close()
