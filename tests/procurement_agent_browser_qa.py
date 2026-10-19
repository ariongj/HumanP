"""Browser acceptance of the real public feed plus the encrypted historical package."""
import csv
import json
import os
import pathlib
import re
from playwright.sync_api import sync_playwright, expect

ROOT=pathlib.Path(__file__).resolve().parents[2]
URL=os.environ.get('PANEL_URL','http://127.0.0.1:62729/#agent')
ACCOUNT=json.loads((ROOT/'artifacts/HumanPlus-Login.private.json').read_text())
FEED=json.loads((ROOT/'app/monitor/feed.json').read_text())
AI_REPORT=json.loads((ROOT/'app/monitor/ai-report.json').read_text())
ARCHIVE=json.loads((ROOT/'private/budget-2024-objects/data/medical.json').read_text())['notices']
merged={str(r['notice_id']):r for r in ARCHIVE}
for r in FEED['notices']:
    old=merged.get(str(r['notice_id']),{})
    merged[str(r['notice_id'])]={**old,**r,'category_sq':old.get('category_sq') or r['category_sq']}
checks=[];errors=[];network=[]
with sync_playwright() as p:
    env=dict(os.environ,LD_LIBRARY_PATH='/home/codex/projects/.browser-libs/root/usr/lib/x86_64-linux-gnu:/home/codex/projects/.browser-engines/deps/root/usr/lib/x86_64-linux-gnu')
    browser=p.chromium.launch(executable_path=os.environ['CHROMIUM_PATH'],headless=True,env=env)
    context=browser.new_context(viewport={'width':1500,'height':1000},accept_downloads=True)
    page=context.new_page();page.set_default_timeout(30000)
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.on('request',lambda r:network.append(r.url) if r.resource_type in ['xhr','fetch'] else None)
    def nav(title):
        if page.viewport_size['width']<761:page.get_by_role('button',name='Hap menunë',exact=True).click()
        page.get_by_role('navigation').get_by_role('button',name=title,exact=True).click()
        page.get_by_role('heading',name=title,level=1,exact=True).wait_for()
        page.locator('.empty[role=status]').wait_for(state='hidden')
    def panel(title):return page.locator('section.panel').filter(has=page.get_by_role('heading',name=title,exact=True))
    def count(section):return int(re.sub(r'\D','',section.locator('.table-toolbar>span').first.inner_text()))
    def payload(button):
        with page.expect_download() as dl:button.click()
        return pathlib.Path(dl.value.path()).read_text(encoding='utf-8-sig')
    try:
        assert FEED['notices'] and FEED['run']['status']=='ok', 'Bootstrap must complete before acceptance'
        page.goto(URL,wait_until='load',timeout=180000)
        page.get_by_label('Përdoruesi',exact=True).fill(ACCOUNT['username'])
        page.get_by_label('Fjalëkalimi',exact=True).fill(ACCOUNT['password'])
        page.get_by_role('button',name='Hyr në panel',exact=True).click()
        page.get_by_role('navigation').wait_for(timeout=120000)
        nav('Agjenti i prokurimit')
        if AI_REPORT['status']=='ready':
            expect(page.get_by_text('Raporti ditor AI është gati',exact=True)).to_be_visible()
            page.get_by_role('button',name='Lexo raportin ditor',exact=True).click()
            expect(page.get_by_role('tab',name='Raporti ditor',exact=True)).to_have_attribute('aria-selected','true')
            expect(page.locator('.agent-report-notice')).to_have_count(0)
            complete=json.loads(payload(page.get_by_role('button',name='Raporti ditor JSON',exact=True)))
            interpreted=[r['ai_interpretation'] for r in complete['procedures'] if r['ai_interpretation']]
            assert {r['notice_id'] for r in interpreted}=={r['notice_id'] for r in AI_REPORT['entries']}
            assert page.locator('.agent-report-cards .agent-ai-action').count()==len(interpreted)
            for entry in interpreted:
                expect(page.get_by_text(entry['why_match'],exact=True)).to_be_visible()
                expect(page.get_by_text(entry['next_step'],exact=True)).to_be_visible()
            assert page.evaluate("localStorage.getItem('humanplus-daily-report-read-v1')")==AI_REPORT['generated_at']
            nav('Përmbledhja')
            expect(page.locator('.agent-report-notice')).to_have_count(0)
            nav('Agjenti i prokurimit')
            checks.append('New daily AI report alert opens the report, persists read state, and all generated analyses render and export with matching source IDs')
        inbox=panel('Radha e mundësive dhe ndryshimeve')
        page.get_by_role('tab',name='Agjenti dhe burimet',exact=True).click()
        expect(page.get_by_text('Njoftimet automatike në Codex ende nuk janë lidhur.',exact=False)).to_be_visible()
        page.get_by_role('tab',name='Përmbledhja',exact=True).click()
        cards=page.locator('.agent-priorities .agent-tender')
        assert cards.count()>0
        first_card=cards.first
        first_card.locator('.agent-requirements>summary').click()
        expect(first_card.locator('.agent-requirements')).to_have_attribute('open','')
        assert first_card.locator('.agent-requirements section').count()>0
        first_card.locator('.agent-requirements>summary').click()
        assert count(inbox)==len(FEED['notices'])
        export=list(csv.DictReader(payload(page.get_by_role('button',name='Eksporto pamjen',exact=True)).splitlines()))
        assert {r['notice_id'] for r in export}=={r['notice_id'] for r in FEED['notices']}
        assert all(r['source_url'].startswith('https://e-prokurimi.rks-gov.net/') for r in export)
        checks.append('Real feed notice IDs reconcile with the inbox and CSV; Codex notification status is honest')
        first=page.get_by_label(re.compile('^Vlerëso njoftimin ')).first
        notice_id=first.get_attribute('aria-label').split()[-1]
        before=len(FEED['notices']);first.select_option('Për ndjekje')
        expect(page.get_by_role('button',name=f'Njoftimet e agentit: {before-1} të palexuara',exact=True)).to_be_visible()
        page.get_by_label('Radha e agentit',exact=True).select_option('watch');assert count(inbox)==1
        feedback=json.loads(payload(page.get_by_role('button',name='Eksporto vlerësimet',exact=True)))
        assert feedback['decisions'][notice_id]['verdict']=='Për ndjekje'
        page.get_by_label('Radha e agentit',exact=True).select_option('unread');assert count(inbox)==before-1
        page.get_by_label('Radha e agentit',exact=True).select_option('')
        checks.append('Review decisions update the global unread indicator, watch/unread queues and exported feedback')
        page.get_by_label('Faza e monitoruar',exact=True).select_option('tender_notice')
        assert count(inbox)==sum(r['evidence_classification']=='tender_notice' for r in FEED['notices'])
        page.get_by_label('Faza e monitoruar',exact=True).select_option('')
        page.get_by_label('Viti në gjithë panelin',exact=True).select_option('2024');assert count(inbox)==0
        page.get_by_label('Viti në gjithë panelin',exact=True).select_option('2026')
        category=next(r['category_sq'] for r in FEED['notices'] if r['notice_id'] not in {str(a['notice_id']) for a in ARCHIVE})
        page.get_by_label('Kategoria në gjithë panelin',exact=True).select_option(category)
        expected_live=[merged[str(r['notice_id'])] for r in FEED['notices'] if merged[str(r['notice_id'])]['category_sq']==category]
        expected_all=[r for r in merged.values() if r['category_sq']==category and int(r['year'])==2026]
        assert count(inbox)==len(expected_live)
        page.get_by_role('tab',name='Analitika',exact=True).click()
        assert sum(int(re.sub(r'\D','',x)) for x in panel('Përputhjet sipas kategorisë').locator('.bar-row b').all_text_contents()) ==len(expected_live)
        page.get_by_role('tab',name='Raporti ditor',exact=True).click()
        daily=json.loads(payload(page.get_by_role('button',name='Raporti ditor JSON',exact=True)))
        assert all(r['category']==category for r in daily['procedures'])
        assert daily['ai_status']==AI_REPORT['status']
        assert all(r['source_notice_id']==r['ai_interpretation']['notice_id'] for r in daily['procedures'] if r['ai_interpretation'])
        assert daily['filters']['year']=='2026'
        daily_html=payload(page.get_by_role('button',name='Raporti ditor HTML',exact=True))
        assert 'Raporti i prokurimit' in daily_html and AI_REPORT['status'] in daily_html
        checks.append('Daily briefing HTML and JSON exports respect global scope and include only matching, source-validated AI analyses')
        nav('Sektori mjekësor');assert count(panel('Njoftimet'))==len(expected_all)
        nav('Raportet');page.get_by_role('tab',name='Njoftimet mjekësore',exact=True).click()
        report=json.loads(payload(page.get_by_role('button',name='Raporti JSON',exact=True)))
        assert {str(r['notice_id']) for r in report['sections'][0]['rows']}=={str(r['notice_id']) for r in expected_all}
        assert sum(r['value'] for r in report['sections'][0]['chart'])==len(expected_all)
        html=payload(page.get_by_role('button',name='Shkarko raportin HTML',exact=True))
        assert category in html and 'Kontrolli i fundit i monitorit' in html
        checks.append('Shared year/category filters reconcile live inbox, merged medical table, report charts and HTML/JSON exports')
        page.get_by_role('button',name='Pastro filtrat e panelit',exact=True).click()
        nav('Sektori mjekësor')
        expect(page.get_by_role('heading',name='Inventari i të dhënave shëndetësore',exact=True)).to_be_visible()
        for title,key in [('Përshkrimet e loteve','lotDescriptions'),('Statusi i loteve','statusUpdates'),('Boshllëqet e dokumenteve','downloadGaps'),('Burimet mjekësore','sourceMap')]:
            page.locator('.tabs button').filter(has_text=re.compile('^'+re.escape(title))).click()
            assert count(panel(title))==len(json.loads((ROOT/'private/budget-2024-objects/data/medical.json').read_text())[key])
        checks.append('All supplied lot descriptions, lot status updates, 15 access gaps and source-map records are accessible in the medical section')
        nav('Harta e prokurimit');assert count(panel('Regjistri i prokurimit'))==5394
        checks.append('Historical awards remain 5394; live tenders are not mixed into award totals')
        nav('Agjenti i prokurimit')
        page.get_by_role('textbox',name='Kërko njoftim, institucion, FPP ose arsye…',exact=True).fill('Aparate të Anestezionit')
        assert count(inbox)>=1
        inbox.get_by_role('button',name=re.compile('^Shiko detajet:')).first.click();expect(page.get_by_role('dialog')).to_be_visible()
        assert page.get_by_role('dialog').locator('a[href^="https://e-prokurimi.rks-gov.net/"]').count()>=1
        page.get_by_role('button',name='Mbyll detajet',exact=True).click()
        page.get_by_role('textbox',name='Kërko njoftim, institucion, FPP ose arsye…',exact=True).fill('')
        page.evaluate('window.scrollTo(0,0)')
        page.screenshot(path=str(ROOT/'artifacts/procurement-agent-desktop.png'))
        page.get_by_role('tab',name='Raporti ditor',exact=True).click()
        page.locator('.agent-report-heading').scroll_into_view_if_needed()
        page.screenshot(path=str(ROOT/'artifacts/procurement-agent-daily-report.png'))
        page.get_by_role('tab',name='Përmbledhja',exact=True).click()
        page.set_viewport_size({'width':375,'height':812});page.wait_for_timeout(500)
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'), 'Mobile page overflow'
        assert page.locator('.agent-workspace .search').bounding_box()['width']>280, 'Mobile search must not collapse'
        page.locator('.agent-priorities').scroll_into_view_if_needed()
        page.screenshot(path=str(ROOT/'artifacts/procurement-agent-mobile.png'))
        assert not errors,errors;assert not network,network
        result={'url':URL,'feed_notices':len(FEED['notices']),'merged_medical_notices':len(merged),'checks':checks+['Source inspection works; mobile fits; no runtime errors or data network calls'],'errors':errors,'dataNetworkRequests':network}
        (ROOT/'artifacts/procurement-agent-browser-verification.json').write_text(json.dumps(result,indent=2));print(json.dumps(result,indent=2))
    except Exception:
        page.screenshot(path=str(ROOT/'artifacts/procurement-agent-failure.png'));print('Errors:',errors);raise
    finally:context.close();browser.close()
