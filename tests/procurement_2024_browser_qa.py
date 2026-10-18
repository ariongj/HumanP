"""Verify 2024 drives the live presentation, overview, filters, exports, and source library."""
import os,json,pathlib,re,csv,hashlib
from playwright.sync_api import sync_playwright
ROOT=pathlib.Path(__file__).resolve().parents[2];DATA=ROOT/'private/procurement-2024-objects/data'
URL=os.environ.get('PANEL_URL',(ROOT/'app/dist-pages/index.html').as_uri());account=json.loads((ROOT/'artifacts/HumanPlus-Login.private.json').read_text())
records=json.loads((DATA/'market.json').read_text())['records'];y2024=[r for r in records if r['year']=='2024'];checks=[];errors=[];network=[]
with sync_playwright() as p:
 env=dict(os.environ,LD_LIBRARY_PATH='/home/codex/projects/.browser-libs/root/usr/lib/x86_64-linux-gnu:/home/codex/projects/.browser-engines/deps/root/usr/lib/x86_64-linux-gnu')
 browser=p.chromium.launch(executable_path=os.environ['CHROMIUM_PATH'],headless=True,env=env)
 context=browser.new_context(viewport={'width':1500,'height':1000},accept_downloads=True);page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)));page.on('request',lambda r:network.append(r.url) if r.resource_type in ['xhr','fetch'] else None)
 def nav(name):page.get_by_role('navigation').get_by_role('button',name=name,exact=True).click();page.get_by_role('heading',name=name,exact=True,level=1).wait_for();page.get_by_role('status').filter(has_text='Po ngarkohen').wait_for(state='hidden')
 def count():return int(re.sub(r'\D','',page.locator('.stats .stat strong').first.inner_text()))
 def panel(name):return page.locator('section.panel').filter(has=page.get_by_role('heading',name=name,exact=True))
 try:
  page.goto(URL,wait_until='load',timeout=120000);page.get_by_label('Përdoruesi',exact=True).fill(account['username']);page.get_by_label('Fjalëkalimi',exact=True).fill(account['password']);page.get_by_role('button',name='Hyr në panel',exact=True).click();page.get_by_role('heading',name='Prezantimi HumanPlus',exact=True).wait_for(timeout=60000)
  page.get_by_role('tab',name='Historiku i prokurimit',exact=True).click();page.get_by_label('Viti i prezantimit',exact=True).select_option('2024');assert count()==len(y2024);assert page.locator('.stats .stat strong').nth(3).inner_text()=='12'
  months=panel('Rekordet sipas muajit');months.locator('details.chart-data>summary').click();assert months.locator('tbody tr').count()==12;page.wait_for_timeout(1500);heights=months.locator('.recharts-bar-rectangle').evaluate_all('(els)=>els.map(el=>el.getBBox().height)');assert len(heights)==12 and max(heights)>180;assert abs(heights[4]/heights[0]-237/61)<0.02
  page.screenshot(path=str(ROOT/'artifacts/procurement-2024-desktop.png'));months.get_by_role('button',name='Filtro 2024-02',exact=True).click();page.get_by_role('heading',name='Harta e prokurimit',exact=True,level=1).wait_for();assert page.get_by_label('Viti',exact=True).input_value()=='2024';assert page.get_by_label('Muaji i prokurimit',exact=True).input_value()=='2024-02';assert count()==90
  with page.expect_download() as dl:page.get_by_role('button',name='Eksporto filtrat',exact=True).click()
  with pathlib.Path(dl.value.path()).open(encoding='utf-8-sig',newline='') as f:export=list(csv.DictReader(f))
  assert {r['row_key'] for r in export}=={r['row_key'] for r in y2024 if r['source_date'].startswith('2024-02')};assert all(r['provenance'] and r['award_id'] for r in export)
  checks.append('2024 historical KPIs and 12 monthly chart bars reconcile; February drill-down and CSV match all 90 source award IDs')
  page.get_by_label('Muaji i prokurimit',exact=True).select_option('');assert count()==1773
  panel('Shpërndarja e rekordeve').get_by_role('button').filter(has_text=re.compile(r'^Barna')).click();assert count()==len([r for r in y2024 if r['category']=='Barna'])
  panel('Regjistri i prokurimit').locator('tbody .icon-button').first.click();page.get_by_role('dialog').get_by_text('Prejardhja dhe metoda',exact=True).wait_for();page.keyboard.press('Escape')
  page.get_by_role('button',name='Pastro',exact=True).click();assert count()==5386
  checks.append('category chart, record provenance and reset to all 5,386 rows remain connected')
  nav('Përmbledhja');page.get_by_role('button',name='Shfaq vitin 2024',exact=True).click();assert count()==1773;assert page.get_by_label('Viti i kërkimit',exact=True).input_value()=='2024';assert page.locator('.stats .stat strong').nth(1).inner_text()=='Pa burim buxhetor'
  nav('Buxhetet publike');assert page.get_by_label('Viti',exact=True).input_value()=='2024';assert page.locator('.stats .stat strong').first.inner_text()=='Pa të dhëna';checks.append('overview year chart updates shared filters; missing 2024 budget remains unknown, not zero')
  nav('Cilësia dhe mbulimi');page.get_by_role('heading',name='2024 · Historiku i rikuperuar',exact=True).wait_for();page.get_by_label('Sinjali',exact=True).select_option('classification_text_inferred_2024');assert int(re.sub(r'\D','',panel('Radha e verifikimit').locator('.table-toolbar>span').inner_text()))==1773
  page.get_by_role('button',name='Hap burimet dhe metodën',exact=True).click();page.get_by_label('Kategoria',exact=True).select_option('procurement_2024');assert panel('Dokumentet dhe burimet').locator('tbody tr').count()==2
  document=json.loads((DATA/'documents.json').read_text())['records'][-1]
  with page.expect_download() as dl:page.get_by_role('link',name='Shkarko '+document['name'],exact=True).click()
  assert hashlib.sha256(pathlib.Path(dl.value.path()).read_bytes()).hexdigest()==document['sha256'];checks.append('2024 quality flags and both archived source files are searchable; methodology download hash matches')
  nav('Prezantimi HumanPlus');page.get_by_role('tab',name='Historiku i prokurimit',exact=True).click();page.get_by_label('Viti i prezantimit',exact=True).select_option('2024');page.set_viewport_size({'width':320,'height':780});page.wait_for_timeout(350);assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');page.screenshot(path=str(ROOT/'artifacts/procurement-2024-mobile.png'));panel('Rekordet sipas muajit').scroll_into_view_if_needed();page.wait_for_timeout(1500);panel('Rekordet sipas muajit').screenshot(path=str(ROOT/'artifacts/procurement-2024-monthly-mobile.png'));checks.append('2024 presentation and monthly chart fit a 320px viewport')
  assert not errors,errors;assert not network,network
  receipt={'url':URL,'checks':checks,'uncaughtErrors':errors,'dataNetworkRequests':network};(ROOT/'artifacts/procurement-2024-browser-verification.json').write_text(json.dumps(receipt,indent=2));print(json.dumps(receipt),flush=True)
 except Exception:
  page.screenshot(path=str(ROOT/'artifacts/procurement-2024-failure.png'));print('Errors:',errors,flush=True);raise
 finally:context.close();browser.close()
