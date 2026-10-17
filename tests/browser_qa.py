import os,json,pathlib
from playwright.sync_api import sync_playwright
ROOT=pathlib.Path(__file__).resolve().parents[2]; BASE=os.environ.get('HUMANPLUS_PREVIEW_URL','http://127.0.0.1:4186')
with sync_playwright() as p:
 env=dict(os.environ,LD_LIBRARY_PATH='/home/codex/projects/.browser-libs/root/usr/lib/x86_64-linux-gnu:/home/codex/projects/.browser-engines/deps/root/usr/lib/x86_64-linux-gnu')
 browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/home/codex/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell'),headless=True,env=env)
 ctx=browser.new_context(viewport={'width':1440,'height':1050});page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 for route in ['/api/data/market','/api/documents/001.xlsx','/api/export/market']:
  assert ctx.request.get(BASE+route).status==401,route
 assert ctx.request.get(BASE+'/private/objects/data/market.json').status==404
 page.goto(BASE,wait_until='domcontentloaded');page.get_by_role('link',name='Hyr me ChatGPT').click();page.get_by_role('heading',name='Përmbledhja',exact=True).wait_for();page.get_by_text('Ku përqendrohen rekordet?',exact=True).wait_for();page.wait_for_timeout(600)
 page.screenshot(path=str(ROOT/'artifacts/overview-desktop.png'),full_page=True)
 modules=['Harta e prokurimit','Buxhetet publike','Plani financiar','Partnerët dhe institucionet','Katalogu për shqyrtim','Plani dhe veprimet','Dokumentet dhe burimet','Cilësia dhe mbulimi']
 for name in modules:
  page.get_by_role('navigation').get_by_role('button',name=name,exact=True).click();page.get_by_role('heading',name=name,exact=True).wait_for();page.wait_for_function("!document.body.innerText.includes('Po ngarkohen burimet private')");assert page.locator('[role=alert]').count()==0,name
  assert page.locator('main table').count()>0 or name=='Plani dhe veprimet',name
  print('Module OK',name,flush=True)
 page.get_by_role('navigation').get_by_role('button',name='Harta e prokurimit',exact=True).click();page.get_by_label('Viti',exact=True).select_option('2026');page.get_by_label('Monedha',exact=True).select_option('source_registry_numeric_unit_unverified');page.wait_for_timeout(200)
 print('Filters applied',flush=True);assert '415' in page.locator('.stats').inner_text();assert 'Pa vlera EUR' in page.locator('.stats').inner_text()
 with page.expect_download() as pending: page.get_by_role('button',name='Eksporto filtrat').click()
 f=pending.value.path(); assert len(pathlib.Path(f).read_text().splitlines())>415
 page.get_by_role('button',name='Pastro',exact=True).click();page.wait_for_timeout(200);assert '3' in page.locator('.stats').inner_text()
 page.locator('tbody .icon-button').first.click();assert page.locator('dialog').is_visible();page.keyboard.press('Escape');assert not page.locator('dialog').is_visible()
 page.screenshot(path=str(ROOT/'artifacts/market-desktop.png'),full_page=True)
 page.get_by_role('navigation').get_by_role('button',name='Plani financiar',exact=True).click();page.get_by_role('button',name='Shërbimet',exact=True).click();page.get_by_label('Biokimi volume',exact=True).fill('100');page.get_by_label('Biokimi price',exact=True).fill('25');page.get_by_role('button',name='Ruaj draftin',exact=True).click();page.reload(wait_until='domcontentloaded');page.get_by_role('button',name='Shërbimet',exact=True).click();assert page.get_by_label('Biokimi volume',exact=True).input_value()=='100';page.get_by_role('button',name='Rezultatet',exact=True).click();assert 'Mungojnë hyrjet' in page.locator('.stats').inner_text()
 page.get_by_role('navigation').get_by_role('button',name='Katalogu për shqyrtim',exact=True).click();page.get_by_placeholder('Kërko analizë, panel ose paketë…').fill('CA 15');page.wait_for_timeout(200);assert page.locator('tbody tr').count()>0;page.screenshot(path=str(ROOT/'artifacts/catalogue-desktop.png'),full_page=True)
 page.get_by_role('navigation').get_by_role('button',name='Dokumentet dhe burimet',exact=True).click();page.get_by_placeholder('Kërko titull ose tekst brenda dokumenteve…').fill('Kushti për kalimin në 2028');page.wait_for_timeout(200);assert page.locator('tbody tr').count()>0
 with page.expect_download() as pending:page.locator('tbody a[download]').first.click()
 assert pathlib.Path(pending.value.path()).stat().st_size>0
 page.get_by_role('navigation').get_by_role('button',name='Përmbledhja',exact=True).click();page.set_viewport_size({'width':320,'height':780});page.wait_for_timeout(200)
 assert page.evaluate('document.documentElement.scrollWidth<=window.innerWidth'), 'Mobile horizontal overflow'
 page.screenshot(path=str(ROOT/'artifacts/overview-mobile.png'),full_page=True)
 page.get_by_role('button',name='Hap menunë',exact=True).click();page.get_by_role('navigation').get_by_role('button',name='Plani financiar',exact=True).click();page.wait_for_timeout(200);assert page.evaluate('document.documentElement.scrollWidth<=window.innerWidth');page.screenshot(path=str(ROOT/'artifacts/finance-mobile.png'),full_page=True)
 assert not errors,errors
 (ROOT/'artifacts/browser-verification.json').write_text(json.dumps({'modules':9,'desktopWidth':1440,'mobileWidth':320,'uncaughtErrors':errors,'checks':['anonymous denied','all modules load','currency filters','filtered export','source drawer keyboard escape','local finance persistence','catalogue search','document full text search and download','mobile navigation and overflow']},indent=2))
 print('Browser checks passed',flush=True);browser.close()
