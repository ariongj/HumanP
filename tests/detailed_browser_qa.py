import os,json,pathlib,csv,re
from playwright.sync_api import sync_playwright
ROOT=pathlib.Path(__file__).resolve().parents[2];BASE=os.environ.get('HUMANPLUS_PREVIEW_URL','http://127.0.0.1:4186')
with sync_playwright() as p:
 env=dict(os.environ,LD_LIBRARY_PATH='/home/codex/projects/.browser-libs/root/usr/lib/x86_64-linux-gnu:/home/codex/projects/.browser-engines/deps/root/usr/lib/x86_64-linux-gnu')
 browser=p.chromium.launch(executable_path=os.environ['CHROMIUM_PATH'],headless=True,env=env)
 ctx=browser.new_context(viewport={'width':1440,'height':1050});ctx.add_cookies([{'name':'__sites_local_auth','value':'1','url':BASE}]);page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 def go(name):
  if page.viewport_size['width']<761:page.get_by_role('button',name='Hap menunë',exact=True).click()
  page.get_by_role('navigation').get_by_role('button',name=name,exact=True).click();page.wait_for_function("!document.body.innerText.includes('Po ngarkohen burimet private')")
 def shot(name):
  page.evaluate('window.scrollTo(0,0)');page.wait_for_timeout(150);page.screenshot(path=str(ROOT/'artifacts'/name),full_page=True)
 try:
  page.goto(BASE,wait_until='domcontentloaded');page.get_by_text('Eksploro evidencën',exact=True).wait_for();assert page.get_by_role('button',name='Shfaq vitin 2024').is_disabled();shot('overview-detailed-desktop.png')
  go('Harta e prokurimit');facet=page.locator('.multi-select').first;facet.locator('summary').click();facet.locator('input[type=checkbox]').nth(0).check();facet.locator('input[type=checkbox]').nth(1).check();facet.locator('summary').click()
  page.get_by_label('Shuma EUR minimum',exact=True).fill('100');page.get_by_label('Shuma EUR maksimum',exact=True).fill('100000');assert page.get_by_label('Monedha',exact=True).input_value()=='EUR'
  page.get_by_label('Emri i pamjes').fill('QA kategori EUR');page.get_by_role('button',name='Ruaj pamjen',exact=True).click();saved=page.evaluate("JSON.parse(localStorage.getItem('humanplus-market-views-v1'))[0].filters")
  cats=json.loads(saved['categoryAny']);source=json.loads((ROOT/'private/objects/data/market.json').read_text())['records'];expected=[r for r in source if r['year']=='2025' and r['category'] in cats and r['value_unit']=='EUR' and r['reported_value'] not in [None,''] and 100<=float(r['reported_value'])<=100000]
  count=int(re.sub(r'\D','',page.locator('.stats .stat strong').first.inner_text()));assert count==len(expected),(count,len(expected))
  with page.expect_download() as dl:page.get_by_role('button',name='Eksporto filtrat',exact=True).click()
  with pathlib.Path(dl.value.path()).open(encoding='utf-8-sig',newline='') as f:export=list(csv.DictReader(f))
  assert len(export)==len(expected);assert all(r['category'] in cats and r['value_unit']=='EUR' for r in export)
  page.get_by_role('button',name='Pastro',exact=True).click();page.get_by_role('button',name='QA kategori EUR',exact=True).click();assert page.get_by_label('Shuma EUR minimum',exact=True).input_value()=='100'
  page.reload(wait_until='domcontentloaded');page.get_by_role('button',name='QA kategori EUR',exact=True).click();assert page.get_by_label('Shuma EUR maksimum',exact=True).input_value()=='100000'
  table=page.locator('.data-table');table.get_by_label('Rreshta për faqe').select_option('25');assert table.locator('tbody tr').count()==min(25,len(expected))
  table.get_by_role('button',name='Rendit sipas Vlera burimore',exact=True).click();assert table.locator('th[aria-sort=ascending]').count()==1;table.get_by_role('button',name='Rendit sipas Vlera burimore',exact=True).click();assert table.locator('th[aria-sort=descending]').count()==1
  table.locator('.column-picker summary').click();table.locator('.column-picker').get_by_role('checkbox',name='Shfaq kolonën Kategoria',exact=True).uncheck();table.locator('.column-picker summary').click();assert table.get_by_role('button',name='Rendit sipas Kategoria',exact=True).count()==0
  table.get_by_role('button',name='Pamje kompakte').click();assert 'dense' in table.get_attribute('class')
  for i in range(3):table.locator('tbody input[type=checkbox]').nth(i).check()
  assert table.locator('tbody input[type=checkbox]').nth(3).is_disabled();assert page.locator('.comparison-table thead th').count()==4
  page.locator('.comparison-table thead button').first.click();page.get_by_role('button',name='Të gjitha fushat',exact=True).click();assert page.locator('dialog .record-fields>div').count()>30;page.get_by_role('button',name='JSON burimor',exact=True).click()
  with page.expect_download() as dl:page.get_by_role('button',name='Eksporto rekordin',exact=True).click()
  assert json.loads(pathlib.Path(dl.value.path()).read_text())['row_key'];page.keyboard.press('Escape');shot('market-advanced-desktop.png')
  page.keyboard.press('Control+k');page.get_by_role('textbox',name='Kërko në gjithë HumanPlus').fill('CA 15');group=page.locator('.global-results section').filter(has=page.get_by_role('heading',name=re.compile('Katalogu')));group.locator('.global-result').first.wait_for();group.locator('.global-result').first.click();page.get_by_role('heading',name='Katalogu për shqyrtim',exact=True).wait_for();assert page.get_by_placeholder('Kërko analizë, panel ose paketë…').input_value()
  page.get_by_role('button',name='Kartat',exact=True).click();assert page.locator('.catalogue-card').count()>0;page.get_by_role('button',name='Detajet dhe burimi').first.click();assert page.locator('dialog .record-fields').is_visible();page.keyboard.press('Escape');shot('catalogue-detailed-cards.png')
  go('Partnerët dhe institucionet');page.get_by_label('Kontakti i publikuar',exact=True).select_option('email');assert page.locator('tbody tr').count()>0;page.locator('.grid.two .bar-row').first.click();assert page.get_by_label('Qyteti',exact=True).input_value()
  go('Dokumentet dhe burimet');page.get_by_label('Formati',exact=True).select_option('pdf');page.get_by_label('Tekst i kërkueshëm',exact=True).select_option('yes');assert page.locator('tbody tr').count()>0;assert all('.pdf' in t.lower() for t in page.locator('tbody .cell-title strong').all_inner_texts());shot('documents-detailed-desktop.png')
  go('Cilësia dhe mbulimi');page.get_by_role('button',name='I pashqyrtuar',exact=True).first.click();page.get_by_label('Statusi i shqyrtimit',exact=True).select_option('Në shqyrtim');page.get_by_label('Shënimi i verifikimit',exact=True).fill('QA local review; no source changes');page.get_by_role('button',name='Ruaj shqyrtimin lokal',exact=True).click();page.get_by_label('Shqyrtimi lokal',exact=True).select_option('Në shqyrtim');assert page.locator('.data-table').first.locator('tbody tr').count()==1;page.reload(wait_until='domcontentloaded');page.get_by_role('button',name='Në shqyrtim',exact=True).first.wait_for()
  for name in ['Përmbledhja','Harta e prokurimit','Katalogu për shqyrtim','Dokumentet dhe burimet','Cilësia dhe mbulimi']:
   page.set_viewport_size({'width':320,'height':780});go(name);page.wait_for_timeout(200);assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),name
  go('Harta e prokurimit');page.locator('.multi-select').first.locator('summary').click();assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');shot('market-advanced-mobile.png');page.locator('.multi-select').first.locator('summary').click();page.keyboard.press('Control+k');page.get_by_role('textbox',name='Kërko në gjithë HumanPlus').fill('laborator');page.wait_for_timeout(200);assert page.locator('.global-search-dialog').bounding_box()['width']<=320;page.keyboard.press('Escape')
  assert not errors,errors
  (ROOT/'artifacts/detailed-browser-verification.json').write_text(json.dumps({'checks':['overview evidence and missing-year display','multi-category EUR interval filters','KPI and server CSV match independently filtered source','saved views restore across reload','numeric sorting and column visibility','page size and density','three-record comparison limit','readable full record and JSON download','keyboard global search and destination context','catalogue cards and source inspector','contact filter and city drill-down','document format and text filters','local quality review persists without changing source flags','320px layouts and filter popovers'],'uncaughtErrors':errors},indent=2))
  print('Detailed browser checks passed',flush=True)
 finally:ctx.close();browser.close()
