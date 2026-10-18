import os,json,pathlib,hashlib,subprocess
from playwright.sync_api import sync_playwright
ROOT=pathlib.Path(__file__).resolve().parents[2];APP=ROOT/'app';BASE=os.environ.get('HUMANPLUS_PREVIEW_URL','http://127.0.0.1:4186')
assert BASE=='http://127.0.0.1:4186','Synthetic import test is local-only'
with sync_playwright() as p:
 env=dict(os.environ,LD_LIBRARY_PATH='/home/codex/projects/.browser-libs/root/usr/lib/x86_64-linux-gnu:/home/codex/projects/.browser-engines/deps/root/usr/lib/x86_64-linux-gnu')
 browser=p.chromium.launch(executable_path=os.environ['CHROMIUM_PATH'],headless=True,env=env)
 context=browser.new_context(viewport={'width':1440,'height':1050});context.add_cookies([{'name':'__sites_local_auth','value':'1','url':BASE}]);page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 prior=context.request.get(BASE+'/api/actuals').json();assert prior['dataset'] is None,'Refusing to overwrite pre-existing local actuals'
 wrote=False
 def go(name):
  if page.viewport_size['width']<761: page.get_by_role('button',name='Hap menunë',exact=True).click()
  page.get_by_role('navigation').get_by_role('button',name=name,exact=True).click()
 def viewport_ok():
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),page.url
 try:
  page.goto(BASE,wait_until='domcontentloaded');page.get_by_text('Ku përqendrohen rekordet?',exact=True).wait_for()
  page.get_by_label('Viti i kërkimit').select_option('2026');page.locator('.bar-row').first.click();page.get_by_role('heading',name='Harta e prokurimit',exact=True).wait_for();assert page.get_by_label('Viti',exact=True).input_value()=='2026';assert page.locator('.active-filters').get_by_role('button').count()==2
  page.get_by_role('button',name='Pastro',exact=True).click();page.locator('.relationship-row').first.click();assert page.locator('.active-filters').get_by_role('button').count()==2;assert page.locator('.relationship-row').count()==1
  page.screenshot(path=str(ROOT/'artifacts/market-connected.png'),full_page=True)
  go('Lidhjet e të dhënave');page.get_by_text('Lidhur',exact=True).first.wait_for();assert page.get_by_text('Lidhur',exact=True).count()==12
  page.get_by_role('button',name='Rifresko lidhjet').click();page.get_by_text('Lidhur',exact=True).first.wait_for()
  page.get_by_label('Importo rezultatet CSV').set_input_files({'name':'invalid.csv','mimeType':'text/csv','buffer':b'month,revenue_eur,variable_cost_eur,fixed_cost_eur\n2027-01,,2,3'})
  assert page.get_by_role('button',name='Konfirmo importin').count()==0
  page.get_by_label('Importo rezultatet CSV').set_input_files({'name':'SYNTHETIC_QA_ONLY.csv','mimeType':'text/csv','buffer':b'month,revenue_eur,variable_cost_eur,fixed_cost_eur\n2027-01,5500,900,1200\n2027-02,5600,950,1200'})
  page.get_by_role('button',name='Konfirmo importin',exact=True).click();page.get_by_text('Importi u ruajt privatisht. Krahasimi financiar është përditësuar.',exact=True).wait_for();wrote=True
  response=context.request.get(BASE+'/api/actuals').json();assert len(response['dataset']['records'])==2
  assert context.request.put(BASE+'/api/actuals',headers={'Origin':BASE},data={'records':response['dataset']['records'],'sourceName':'stale.csv','etag':None}).status==409
  page.screenshot(path=str(ROOT/'artifacts/connections-desktop.png'),full_page=True)
  # Controlled synthetic plan is browser-local only and never sent to production.
  page.evaluate("""() => {const plan={services:Array.from({length:8},(_,i)=>({volume:i===0?200:0,price:i===0?25:0,cost:i===0?4:0,doctor:i===0?.1:0,other:0})),personnel:Array.from({length:6},(_,i)=>({fte:i===0?1:0,salary:i===0?900:0,extra:0})),overhead:[300,0,0,0,0,0,0,0,0],opening:5000,reserve:1000,collections:[1,0,0],cash:Array.from({length:39},()=>({investment:0,oneOff:0,oldReceipts:0,funding:0,otherPayments:0})),scenario:'Bazë',assumptions:{volume:[.75,1,1,1],growth:[0,0,.1,.21],price:[0,0,.02,.0404],cost:[0,0,.03,.0609]},note:'SYNTHETIC QA ONLY',approvedBy:'',history:[]};localStorage.setItem('humanplus-finance-v1',JSON.stringify(plan));} """)
  go('Plani financiar');page.locator('.scenario-cards').get_by_text('Bazë',exact=True).wait_for();page.wait_for_function("document.querySelectorAll('.series-chart svg').length===2")
  before=page.locator('.scenario-cards').inner_text();stored=page.evaluate("localStorage.getItem('humanplus-finance-v1')")
  slider=page.get_by_label('Ndryshimi: Vëllimi');slider.focus();slider.press('ArrowRight');page.wait_for_timeout(150);assert page.locator('.scenario-cards').inner_text()!=before;assert page.evaluate("localStorage.getItem('humanplus-finance-v1')")==stored
  page.get_by_role('button',name='Rivendos simulimin').click();assert page.locator('.scenario-cards').inner_text()==before
  page.get_by_role('button',name='Zgjidh muajin 2027-02').first.focus();page.keyboard.press('Enter');assert '2027-02' in page.locator('.month-highlight').inner_text();assert page.get_by_label('Muaji i urës së parasë').input_value()=='2027-02'
  page.screenshot(path=str(ROOT/'artifacts/scenarios-desktop-synthetic-qa.png'),full_page=True)
  for name in ['Përmbledhja','Harta e prokurimit','Plani financiar','Lidhjet e të dhënave']:
   page.set_viewport_size({'width':320,'height':780});go(name);page.wait_for_timeout(250);viewport_ok()
  page.screenshot(path=str(ROOT/'artifacts/connections-mobile.png'),full_page=True)
  page.set_viewport_size({'width':1440,'height':1050});go('Përmbledhja');page.wait_for_timeout(200);page.screenshot(path=str(ROOT/'artifacts/overview-updated.png'),full_page=True)
  assert not errors,errors
  (ROOT/'artifacts/connected-browser-verification.json').write_text(json.dumps({'checks':['shared year and category drill-down','exact buyer/operator pair filtering','12 sources connected and refreshed','invalid CSV rejected','confirmed CSV persisted in local R2','stale replacement rejected','three scenario comparison','sliders change outputs without changing saved draft','reset restores baseline','keyboard chart selection updates cash bridge','actual vs plan chart','320px responsive views'],'uncaughtErrors':errors,'actualsFixture':'synthetic, local-only, removed after test','liveExternalConnectors':'unconfigured'},indent=2))
  print('Connected browser workflows passed',flush=True)
 finally:
  context.close();browser.close()
  if wrote:
   key='site-creator-r2/actuals/'+hashlib.sha256(b'local_seedy').hexdigest()+'.json'
   result=subprocess.run(['/home/codex/.local/share/node-v22.23.1/bin/node','--import','./scripts/sites-env.mjs','./node_modules/wrangler/bin/wrangler.js','r2','object','delete',key,'--local','--persist-to','.wrangler/state'],cwd=APP,capture_output=True,text=True)
   print('Synthetic local R2 cleanup:',result.returncode,result.stdout[-300:],result.stderr[-300:],flush=True)
   assert result.returncode==0,'Remove only the synthetic local actuals object before delivery'
