"""Real-browser checks for durable private data, restart, errors and removal."""
import os,json,pathlib,tempfile,hashlib
from playwright.sync_api import sync_playwright
ROOT=pathlib.Path(__file__).resolve().parents[2];BASE=os.environ.get('HUMANPLUS_PREVIEW_URL','http://127.0.0.1:4187/');PACKAGE=ROOT/'artifacts/HumanPlus-Private-2026-10-18.humanplus'
checks=[];errors=[];data_requests=[]
def mark(message):
 checks.append(message);print(message,flush=True)
with tempfile.TemporaryDirectory(prefix='humanplus-browser-') as profile,sync_playwright() as p:
 env=dict(os.environ,LD_LIBRARY_PATH='/home/codex/projects/.browser-libs/root/usr/lib/x86_64-linux-gnu:/home/codex/projects/.browser-engines/deps/root/usr/lib/x86_64-linux-gnu')
 def launch():
  c=p.chromium.launch_persistent_context(profile,executable_path=os.environ['CHROMIUM_PATH'],headless=True,env=env,viewport={'width':1440,'height':1000},accept_downloads=True,downloads_path=str(pathlib.Path(profile)/'downloads'))
  c.on('page',observe)
  for page in c.pages:observe(page)
  return c
 def observe(page):
  page.on('pageerror',lambda e:errors.append(str(e)));page.on('request',lambda r:data_requests.append(r.url) if r.resource_type in ['fetch','xhr'] or '/api/' in r.url else None)
 def visit(page):page.goto(BASE,wait_until='networkidle')
 def wait_open(page):page.get_by_role('navigation').wait_for(timeout=60000)
 def import_package(page):
  page.get_by_role('heading',name='Hap panelin HumanPlus',exact=True).wait_for();page.get_by_label('Hap paketën private HumanPlus').set_input_files(str(PACKAGE));wait_open(page)
 def connections(page):page.get_by_role('navigation').get_by_role('button',name='Lidhjet e të dhënave',exact=True).click();page.get_by_text('Hapje automatike aktive',exact=True).wait_for()
 context=launch();page=context.pages[0];visit(page);import_package(page);connections(page)
 assert page.locator('.connection-card').get_by_text('Lidhur',exact=True).count()==17
 with page.expect_download() as dl:page.get_by_role('button',name='Shkarko kopjen e të dhënave',exact=True).click()
 assert hashlib.sha256(pathlib.Path(dl.value.path()).read_bytes()).digest()==hashlib.sha256(PACKAGE.read_bytes()).digest()
 checks+=['all 17 datasets saved; entire private package backup byte-identical']
 page.reload(wait_until='networkidle');wait_open(page);connections(page);assert not page.get_by_label('Hap paketën private HumanPlus').count();checks+=['refresh restores automatically without file selection']
 # Open another tab, then close the entire browser and launch a fresh process.
 tab=context.new_page();visit(tab);wait_open(tab);checks+=['new tab restores automatically'];context.close()
 context=launch();page=context.pages[0];visit(page);wait_open(page);connections(page);mark('full browser process restart restores all data')
 # Download an original document after restart and compare it against the source.
 page.get_by_role('navigation').get_by_role('button',name='Dokumentet dhe burimet',exact=True).click();page.get_by_label('Formati',exact=True).select_option('xlsx');link=page.locator('tbody a[download]').first
 name=link.get_attribute('aria-label').removeprefix('Shkarko ');source=json.loads((ROOT/'private/expanded-objects/data/documents.json').read_text());doc=next(d for d in source['records'] if d['name']==name)
 with page.expect_download() as dl:link.click()
 dl.value.save_as(str(pathlib.Path(profile)/'qa-original.xlsx'))
 assert hashlib.sha256((pathlib.Path(profile)/'qa-original.xlsx').read_bytes()).hexdigest()==doc['sha256'];checks+=['original document SHA-256 matches after browser restart']
 # Simulate an outdated package signature; do not silently use it or delete drafts.
 page.evaluate("""async()=>{localStorage.setItem('humanplus-test-draft','keep');const db=await new Promise((ok,no)=>{const r=indexedDB.open('humanplus-private-vault',1);r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error)});await new Promise((ok,no)=>{const tx=db.transaction('packages','readwrite'),s=tx.objectStore('packages'),r=s.get('current');r.onsuccess=()=>s.put({...r.result,fingerprint:'old-version'},'current');tx.oncomplete=ok;tx.onerror=no});db.close()}""")
 page.reload(wait_until='networkidle');page.get_by_role('heading',name='Hap panelin HumanPlus',exact=True).wait_for();assert not page.get_by_role('navigation').count();assert page.evaluate("localStorage.getItem('humanplus-test-draft')")=='keep';assert 'pakete tjetër' in page.get_by_role('alert').inner_text();checks+=['incompatible saved package does not load; drafts retained']
 import_package(page);connections(page)
 # Failure while storing keeps the app usable and tells the truth; retry repairs it.
 mark('mismatch recovery succeeded');context.close();context=launch();page=context.pages[0]
 page.add_init_script("""window.__openDatabase=IDBFactory.prototype.open;IDBFactory.prototype.open=function(){throw new DOMException('Storage unavailable','SecurityError')}""")
 visit(page);import_package(page);page.get_by_role('navigation').get_by_role('button',name='Lidhjet e të dhënave',exact=True).click();page.get_by_text('Kopje vetëm për këtë sesion',exact=True).wait_for();assert page.get_by_role('alert').filter(has_text='shfletuesi nuk lejoi ruajtjen').count()==1
 page.evaluate('()=>{IDBFactory.prototype.open=window.__openDatabase}');page.get_by_role('button',name='Riprovo ruajtjen automatike',exact=True).click();page.get_by_text('Hapje automatike aktive',exact=True).wait_for();assert page.get_by_role('alert').filter(has_text='shfletuesi nuk lejoi ruajtjen').count()==0;checks+=['storage failure is visible; retry saves and clears temporary warning']
 tab=context.new_page();visit(tab);wait_open(tab);page.on('dialog',lambda d:d.accept());page.get_by_role('button',name='Fshi të dhënat lokale dhe mbyll',exact=True).click();page.get_by_role('heading',name='Hap panelin HumanPlus',exact=True).wait_for();tab.get_by_role('heading',name='Hap panelin HumanPlus',exact=True).wait_for();assert page.evaluate("Object.keys(localStorage).filter(k=>k.startsWith('humanplus-')).length")==0
 context.close();context=launch();page=context.pages[0];visit(page);page.get_by_role('heading',name='Hap panelin HumanPlus',exact=True).wait_for();assert not page.get_by_role('navigation').count();checks+=['explicit removal clears package and drafts across tabs and restart']
 assert not errors,errors;assert not data_requests,data_requests;checks+=['no data network requests; no uncaught browser errors'];context.close()
 receipt={'origin':BASE,'checks':checks,'uncaughtErrors':errors,'dataNetworkRequests':data_requests};(ROOT/'artifacts/vault-persistence-verification.json').write_text(json.dumps(receipt,indent=2));print(json.dumps(receipt),flush=True)
