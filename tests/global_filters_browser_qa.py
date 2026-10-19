"""Acceptance against the encrypted production bundle and the supplied source data."""
import os,json,pathlib,re,csv
from playwright.sync_api import sync_playwright,expect
ROOT=pathlib.Path(__file__).resolve().parents[2]; URL=os.environ.get('PANEL_URL','http://127.0.0.1:62729/');ACCOUNT=json.loads((ROOT/'artifacts/HumanPlus-Login.private.json').read_text()); checks=[];errors=[];network=[]
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
 def supplier(name):
  control=page.locator('.entity-filters .multi-select');control.locator('summary').click();control.get_by_role('textbox').fill(name);control.get_by_role('checkbox',name=name,exact=True).check();control.locator('summary').click()
 try:
  page.goto(URL,wait_until='load',timeout=180000);page.get_by_label('Përdoruesi',exact=True).fill(ACCOUNT['username']);page.get_by_label('Fjalëkalimi',exact=True).fill(ACCOUNT['password']);page.get_by_role('button',name='Hyr në panel',exact=True).click();page.get_by_role('navigation').wait_for(timeout=120000)
  nav('Markat dhe produktet');assert count(panel('Markat dhe produktet'))==11
  # An existing product picker must set the shared selection, not just its own page.
  page.get_by_label('Marka',exact=True).select_option('Roche');expect(page.get_by_label('Marka në gjithë panelin')).to_have_value('Roche');assert count(panel('Markat dhe produktet'))==2
  nav('Harta e prokurimit');assert count(panel('Regjistri i prokurimit'))==28
  rows=list(csv.DictReader(payload(page.get_by_role('button',name='Eksporto filtrat',exact=True)).splitlines()));assert len(rows)==28
  page.get_by_role('button',name='Analiza dhe lidhjet',exact=True).click();assert sum(int(re.sub(r'\D','',b.inner_text())) for b in panel('Shpërndarja e rekordeve').locator('.bar-row b').all())==28
  page.get_by_role('button',name='Raporti i përzgjedhjes',exact=True).click();r=report();assert len(r['sections'][0]['rows'])==28 and r['filters']['entities']['brand']=='Roche';assert {x['row_key'] for x in r['sections'][0]['rows']}=={x['row_key'] for x in rows}
  checks.append('Selecting Roche in the product picker updates 2 products, 28 related procurement rows, chart totals, CSV and report rows with identical source IDs')
  supplier('Biohit MDS SH.P.K.');r=report();assert len(r['sections'][0]['rows'])==4 and all(x['supplier']=='Biohit MDS SH.P.K.' for x in r['sections'][0]['rows']);assert r['filters']['entities']['suppliers']==['Biohit MDS SH.P.K.']
  html=payload(page.get_by_role('button',name='Shkarko raportin HTML',exact=True));assert 'Marka në panel: Roche' in html and 'Operatori në panel: Biohit MDS SH.P.K.' in html
  page.get_by_role('tab',name='Produktet dhe markat',exact=True).click();assert len(report()['sections'][0]['rows'])==2
  nav('Markat');assert count(panel('Evidenca e markave'))==2
  nav('Të dhënat');page.locator('.dataset-list button').filter(has_text='Produktet dhe markat').click();assert count(panel('Produktet dhe markat'))==2;source=json.loads(payload(page.get_by_role('button',name='JSON i përzgjedhjes',exact=True)));assert len(source['records'])==2
  nav('Përmbledhja');assert page.locator('.stats .stat strong').first.inner_text()=='4'
  nav('Prezantimi HumanPlus');page.get_by_role('tab',name='Historiku i prokurimit',exact=True).click();assert page.locator('.stats .stat strong').first.inner_text()=='4'
  brief=json.loads(payload(page.get_by_role('button',name='Eksporto briefin',exact=True)));assert brief['historicalRecords']==4 and brief['entities']['brand']=='Roche'
  checks.append('Brand AND supplier selection persists through brands, source tables/JSON, overview, presentation, and both report types; exported HTML and brief disclose selection')
  nav('Harta e prokurimit');assert count(panel('Regjistri i prokurimit'))==4
  page.get_by_label('Popullata e prokurimit').select_option('national2024');assert count(panel('Regjistri i prokurimit'))==1
  # Clearing the shared scope preserves the distinct national population, without adding health rows.
  page.get_by_role('button',name='Pastro filtrat e panelit',exact=True).click();assert count(panel('Regjistri i prokurimit'))==10701
  page.get_by_label('Popullata e prokurimit').select_option('');assert count(panel('Regjistri i prokurimit'))==5394
  supplier('Biohit MDS SH.P.K.');assert count(panel('Regjistri i prokurimit'))==11
  page.get_by_label('Marka në gjithë panelin').select_option('Philips');assert count(panel('Regjistri i prokurimit'))==0
  page.get_by_role('button',name='Raporti i përzgjedhjes',exact=True).click();r=report();assert r['sections'][0]['rows']==[] and r['sections'][0]['chart']==[]
  page.locator('.entity-filters .active-filters').get_by_role('button',name='Operatori: Biohit MDS SH.P.K. ×',exact=True).click()
  nav('Sektori mjekësor');assert page.locator('.stats .stat strong').first.inner_text()=='1'
  nav('Regjistri i barnave');assert count(panel('Regjistri i barnave'))==0;expect(page.locator('.entity-filter-status')).to_contain_text('nuk dokumenton lidhje')
  page.get_by_role('button',name='Pastro filtrat e panelit',exact=True).click();assert count(panel('Regjistri i barnave'))==4631
  checks.append('Alternative 2024 population scopes correctly; reset restores 10,701 national / 5,394 health records; supplier-only gives 11 records; conflicting selection gives empty graphs/reports; medical joins work; unsupported medicine relationships remain explicit')
  # Supplier graph clicks must promote selection across pages as well.
  nav('Harta e prokurimit');page.get_by_role('button',name='Analiza dhe lidhjet',exact=True).click();page.get_by_label('Dimensioni i grafikut').select_option('supplier');chart=panel('Shpërndarja e rekordeve');chosen=chart.locator('.bar-label').first.inner_text();chart.locator('.bar-row').first.click()
  expect(page.locator('.entity-filters .active-filters')).to_contain_text(chosen);nav('Raportet');r=report();assert r['filters']['entities']['suppliers']==[chosen] and all(x['supplier']==chosen for x in r['sections'][0]['rows']);page.get_by_role('button',name='Pastro filtrat e panelit',exact=True).click()
  nav('Markat dhe produktet');assert count(panel('Markat dhe produktet'))==11;page.get_by_label('Marka në gjithë panelin').select_option('MINDRAY');assert count(panel('Markat dhe produktet'))==1;page.get_by_role('button',name='Raporti i produkteve',exact=True).click();assert len(report()['sections'][0]['rows'])==1
  checks.append('Supplier chart clicks propagate globally; case-normalized source brand selections stay consistent between product table and report')
  page.set_viewport_size({'width':375,'height':812});nav('Markat dhe produktet');page.wait_for_timeout(400);assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');page.screenshot(path=str(ROOT/'artifacts/global-filters-mobile.png'))
  page.set_viewport_size({'width':1500,'height':1000});nav('Harta e prokurimit');page.screenshot(path=str(ROOT/'artifacts/global-filters-desktop.png'))
  assert not errors,errors;assert not network,network
  result={'url':URL,'checks':checks+['Mobile viewport fits; no uncaught browser errors or data network requests'],'errors':errors,'dataNetworkRequests':network};(ROOT/'artifacts/global-filters-browser-verification.json').write_text(json.dumps(result,indent=2));print(json.dumps(result,indent=2))
 except Exception:
  page.screenshot(path=str(ROOT/'artifacts/global-filters-failure.png'));print('Errors:',errors);raise
 finally:context.close();browser.close()
