"""Exercise preloaded data, report exports, product/brand evidence and mobile navigation."""
import os,json,pathlib,re,csv
from playwright.sync_api import sync_playwright
ROOT=pathlib.Path(__file__).resolve().parents[2]
DATA=ROOT/'private/budget-2024-objects/data'
URL=os.environ.get('PANEL_URL','http://127.0.0.1:62718/')
ACCOUNT=json.loads((ROOT/'artifacts/HumanPlus-Login.private.json').read_text())
checks=[];errors=[];network=[]
with sync_playwright() as p:
 env=dict(os.environ,LD_LIBRARY_PATH='/home/codex/projects/.browser-libs/root/usr/lib/x86_64-linux-gnu:/home/codex/projects/.browser-engines/deps/root/usr/lib/x86_64-linux-gnu')
 browser=p.chromium.launch(executable_path=os.environ['CHROMIUM_PATH'],headless=True,env=env)
 context=browser.new_context(viewport={'width':1500,'height':1000},accept_downloads=True);page=context.new_page();page.set_default_timeout(30000)
 page.on('pageerror',lambda e:errors.append(str(e)));page.on('request',lambda r:network.append(r.url) if r.resource_type in ['xhr','fetch'] else None)
 def nav(name):
  if page.viewport_size['width']<761:page.get_by_role('button',name='Hap menunë',exact=True).click()
  page.get_by_role('navigation').get_by_role('button',name=name,exact=True).click();page.get_by_role('heading',name=name,level=1,exact=True).wait_for();page.get_by_role('status').filter(has_text='Po ngarkohen').wait_for(state='hidden')
 def panel(title):return page.locator('section.panel').filter(has=page.get_by_role('heading',name=title,exact=True))
 def count(section):return int(re.sub(r'\D','',section.locator('.table-toolbar>span').inner_text()))
 def payload(button):
  with page.expect_download() as dl:button.click()
  return pathlib.Path(dl.value.path()).read_text(encoding='utf-8-sig')
 try:
  page.goto(URL,wait_until='load',timeout=180000);page.get_by_label('Përdoruesi',exact=True).fill(ACCOUNT['username']);page.get_by_label('Fjalëkalimi',exact=True).fill(ACCOUNT['password']);page.get_by_role('button',name='Hyr në panel',exact=True).click();page.get_by_role('navigation').wait_for(timeout=120000)
  assert not page.get_by_label('Hap paketën private HumanPlus').count()
  nav('Përmbledhja');assert page.locator('.core-areas button').count()==5;page.screenshot(path=str(ROOT/'artifacts/workspace-overview.png'))
  nav('Të dhënat');assert page.locator('.dataset-list button').count()==17;assert count(panel('Prokurimi'))==5394
  page.get_by_label('Tabela burimore',exact=True).select_option('root.nationalRecords2024');assert count(panel('Prokurimi'))==10701
  page.locator('.dataset-list button').filter(has_text='Produktet dhe markat').click();assert count(panel('Produktet dhe markat'))==11
  source=json.loads(payload(page.get_by_role('button',name='JSON i plotë',exact=True)));assert source==json.loads((DATA/'products.json').read_text())
  page.get_by_label('Kërko në tabelën burimore…',exact=True).fill('AU480');assert count(panel('Produktet dhe markat'))==1;out=list(csv.DictReader(payload(page.get_by_role('button',name='Eksporto pamjen',exact=True)).splitlines()));assert len(out)==1 and out[0]['brand']=='Beckman Coulter'
  panel('Produktet dhe markat').locator('tbody .icon-button').first.click();page.get_by_role('dialog').get_by_role('button',name='JSON burimor',exact=True).click();assert 'AU480' in page.get_by_role('dialog').inner_text();page.keyboard.press('Escape');page.screenshot(path=str(ROOT/'artifacts/workspace-data.png'))
  checks.append('All 17 datasets indexed; health 5,394 / national 10,701 populations separate; source JSON equals supplied file; search, CSV and source details reconcile')
  nav('Markat');assert count(panel('Evidenca e markave'))==11;panel('Referencat sipas markës').locator('.bar-row').filter(has=page.locator('.bar-label',has_text='Beckman Coulter')).click();assert count(panel('Evidenca e markave'))==1;page.get_by_role('button',name='Pastro filtrat',exact=True).click()
  page.get_by_role('tab',name='Emërtimet në tituj · 2024',exact=True).click();assert count(panel('Evidenca e markave'))==19;page.get_by_label('Emërtimi në titull',exact=True).select_option('Calypso');assert count(panel('Evidenca e markave'))==3;assert len(list(csv.DictReader(payload(page.get_by_role('button',name='Eksporto pamjen',exact=True)).splitlines())))==3
  page.get_by_role('button',name='Pastro filtrat',exact=True).click();page.screenshot(path=str(ROOT/'artifacts/workspace-brands.png'));checks.append('All 11 product references and 19 historical title mentions available with independent source labels, chart filters and matching CSV exports')
  nav('Raportet');page.get_by_label('Viti i raportit',exact=True).select_option('2024');report=json.loads(payload(page.get_by_role('button',name='Raporti JSON',exact=True)));assert len(report['sections'][0]['rows'])==1781
  page.get_by_label('Popullata e raportit',exact=True).select_option('national2024');report=json.loads(payload(page.get_by_role('button',name='Raporti JSON',exact=True)));assert len(report['sections'][0]['rows'])==10701
  section=panel('Prokurimi sipas kategorisë');category=section.locator('.bar-label').first.inner_text();section.locator('.bar-row').first.click();report=json.loads(payload(page.get_by_role('button',name='Raporti JSON',exact=True)));assert all(r['category']==category for r in report['sections'][0]['rows']);assert sum(r['value'] for r in report['sections'][0]['chart'])==len(report['sections'][0]['rows'])
  page.get_by_role('tab',name='Buxheti dhe pagesat',exact=True).click();page.get_by_label('Viti i raportit',exact=True).select_option('2024');report=json.loads(payload(page.get_by_role('button',name='Raporti JSON',exact=True)));assert [s['total'] for s in report['sections']]==[263660768,98801349,239722563,240403904];assert [len(s['rows']) for s in report['sections']]==[3,38,3,3];page.screenshot(path=str(ROOT/'artifacts/workspace-reports.png'))
  html=payload(page.get_by_role('button',name='Shkarko raportin HTML',exact=True));assert '263,660,768' in html and '38 rekorde' in html and 'source_document' not in html
  report_path=ROOT/'artifacts/workspace-budget-report.html';report_path.write_text(html);preview=context.new_page();preview.goto(report_path.as_uri());assert preview.locator('tbody tr').count()==47;preview.emulate_media(media='print');preview.pdf(path=str(ROOT/'artifacts/workspace-budget-report.pdf'),format='A4',landscape=True,print_background=True);preview.close()
  page.get_by_role('tab',name='Produktet dhe markat',exact=True).click();report=json.loads(payload(page.get_by_role('button',name='Raporti JSON',exact=True)));assert len(report['sections'][0]['rows'])==11
  page.get_by_label('Viti i raportit',exact=True).select_option('unknown');report=json.loads(payload(page.get_by_role('button',name='Raporti JSON',exact=True)));assert len(report['sections'][0]['rows'])==3
  checks.append('Procurement reports reconcile health/national filters and charts; budget exports preserve all four totals and 47 rows; full HTML prints to PDF; product reports retain unknown years')
  nav('Markat dhe produktet');assert count(panel('Markat dhe produktet'))==11;page.get_by_role('button',name='Raporti i produkteve',exact=True).click();page.get_by_role('heading',name='Raportet',level=1,exact=True).wait_for();assert page.get_by_role('tab',name='Produktet dhe markat',exact=True).get_attribute('aria-selected')=='true'
  page.set_viewport_size({'width':375,'height':812})
  for name in ['Raportet','Të dhënat','Markat','Përmbledhja']:
   nav(name);page.wait_for_timeout(300);assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),name;page.screenshot(path=str(ROOT/'artifacts'/('workspace-mobile-'+{'Raportet':'reports','Të dhënat':'data','Markat':'brands','Përmbledhja':'overview'}[name]+'.png')))
  checks.append('Product/report navigation and all four new/updated views fit mobile without page overflow')
  assert not errors,errors;assert not network,network
  receipt={'url':URL,'checks':checks,'uncaughtErrors':errors,'dataNetworkRequests':network};(ROOT/'artifacts/workspace-sections-browser-verification.json').write_text(json.dumps(receipt,indent=2));print(json.dumps(receipt,indent=2))
 except Exception:
  page.screenshot(path=str(ROOT/'artifacts/workspace-sections-failure.png'));print('Errors:',errors);raise
 finally:context.close();browser.close()
