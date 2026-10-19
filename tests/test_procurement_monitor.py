import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('monitor', ROOT / 'scripts/procurement_monitor.py')
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
PROFILE = json.loads((ROOT / 'monitor/profile.json').read_text())


def listing(ids=('100',)):
    return '<h1>On-line njoftimet 19.10.2026</h1><h2>PlusMinusB05 Njoftim per Kontrat</h2>' + ''.join(
        f'<a class="DetailsBtn" href="DokumentPodaciFrm.aspx?id={i}"></a><a href="DokumentPodaciFrm.aspx?id={i}">1. Test notice</a>' for i in ids)


def detail(deadline='12.11.2026 13:00'):
    fields = {'Naslov': 'Test notice', 'BrojObjave': '2026/220/70100-26-1234-1-1-1/B05-1',
        'Narucitelj': 'QENDRA KLINIKE UNIVERSITARE E KOSOVES', 'VrstaObjave': 'B05 Njoftim per Kontrat',
        'Cpv': '33000000-0 Medical equipment', 'ProcijenjenaVrijednost': '10,000.00',
        'RokZaDostavuVrijeme': deadline}
    return ''.join(f'<span id="uiDokumentPodaci_ui{k}">{v}</span>' for k,v in fields.items()) + '<input id="uiDokumentPodaci_uiDatumObjave_textBox" value="19.10.2026">'


class MonitorTests(unittest.TestCase):
    def test_listing_is_deduplicated_and_requires_dated_groups(self):
        rows, dates = m.parse_listing(listing(('100', '101')))
        self.assertEqual(len(rows), 2); self.assertEqual(dates, ['2026-10-19'])
        self.assertEqual(rows['100']['listed_title'], 'Test notice')
        with self.assertRaises(ValueError): m.parse_listing('<h1>Sign in</h1>')
        with self.assertRaises(ValueError): m.parse_listing('<a href="DokumentPodaciFrm.aspx?id=1">Title</a>')

    def test_detail_preserves_full_id_unknown_currency_and_stages(self):
        r = m.parse_notice(detail(), m.parse_listing(listing())[0]['100'])
        self.assertEqual(r['procedure_key'], '2026/220/70100-26-1234-1-1-1')
        self.assertIsNone(r['estimated_value_currency']); self.assertIsNone(r['supplier'])
        self.assertEqual(r['published_iso'], '2026-10-19')
        self.assertEqual(r['evidence_classification'], 'tender_notice')
        self.assertEqual(m.parse_notice(detail().replace('B05 Njoftim per Kontrat','B10 Cancellation'),r)['evidence_classification'], 'cancellation_notice')
        with self.assertRaises(ValueError): m.parse_notice('<html>Service unavailable</html>',r)

    def test_matching_catches_healthcare_buyers_and_exposes_uncertain_labs(self):
        r={'title':'Cleaning service','buyer':'SHSKUK','cpv_as_published':'90910000-9'}
        c=m.classify(r,PROFILE); self.assertTrue(c['matched']); self.assertEqual(c['scope'],'institutional_support')
        self.assertTrue(m.classify({'title':'Furnizim me barna','buyer':'Komuna'},PROFILE)['matched'])
        lab=m.classify({'title':'Pajisje laboratorike','buyer':'Fakulteti i inxhinierise'},PROFILE)
        self.assertTrue(lab['matched']); self.assertEqual(lab['match_confidence'],'Për shqyrtim')
        self.assertFalse(m.classify({'title':'Construction of road','buyer':'Komuna'},PROFILE)['matched'])
        self.assertFalse(m.classify(r,{**PROFILE,'excluded_keywords':['cleaning']})['matched'])

    def test_retry_is_idempotent_deadline_changes_create_one_event_failure_keeps_data(self):
        with tempfile.TemporaryDirectory() as tmp:
            out=Path(tmp)
            def source(url): return listing() if url==m.LISTING else detail()
            with patch.object(m,'fetch',side_effect=source), patch.object(m.time,'sleep'):
                self.assertEqual(m.run(out,ROOT/'monitor/profile.json'),0)
                self.assertEqual(m.run(out,ROOT/'monitor/profile.json'),0)
            d=json.loads((out/'feed.json').read_text()); self.assertEqual(len(d['notices']),1); self.assertEqual(len(d['events']),1)
            with patch.object(m,'fetch',side_effect=lambda url: listing() if url==m.LISTING else detail('20.11.2026 13:00')),patch.object(m.time,'sleep'):
                self.assertEqual(m.run(out,ROOT/'monitor/profile.json'),0)
                self.assertEqual(m.run(out,ROOT/'monitor/profile.json'),0)
            d=json.loads((out/'feed.json').read_text()); self.assertEqual(len(d['events']),2)
            self.assertIn('deadline_displayed',d['events'][-1]['fields']); last=d['last_successful_check']
            with patch.object(m,'fetch',side_effect=RuntimeError('source unavailable')):
                self.assertEqual(m.run(out,ROOT/'monitor/profile.json'),1)
            d=json.loads((out/'feed.json').read_text());self.assertEqual(d['run']['status'],'failed')
            self.assertEqual(d['last_successful_check'],last);self.assertEqual(len(d['notices']),1)

    def test_failed_detail_does_not_mark_complete_or_drop_previous_notices(self):
        with tempfile.TemporaryDirectory() as tmp:
            out=Path(tmp)
            def source(url):
                if url==m.LISTING:return listing(('100','101'))
                if url.endswith('101'):raise RuntimeError('down')
                return detail()
            with patch.object(m,'fetch',side_effect=source),patch.object(m.time,'sleep'):
                self.assertEqual(m.run(out,ROOT/'monitor/profile.json'),1)
            d=json.loads((out/'feed.json').read_text());self.assertIsNone(d['last_successful_check']);self.assertEqual(d['run']['status'],'partial')
            self.assertEqual(d['run']['listed'],2);self.assertEqual(len(d['notices']),1)

    def test_profile_changes_reclassify_previous_records_and_emit_one_new_match(self):
        with tempfile.TemporaryDirectory() as tmp:
            out=Path(tmp); profile=out/'profile.json'
            profile.write_text(json.dumps({**PROFILE,'excluded_keywords':['test notice']}))
            with patch.object(m,'fetch',side_effect=lambda url: listing() if url==m.LISTING else detail()),patch.object(m.time,'sleep'):
                m.run(out,profile)
                self.assertEqual(len(json.loads((out/'feed.json').read_text())['notices']),0)
                profile.write_text(json.dumps(PROFILE));m.run(out,profile);m.run(out,profile)
            d=json.loads((out/'feed.json').read_text());self.assertEqual(len(d['notices']),1)
            self.assertEqual([e['kind'] for e in d['events']],['new_match'])

    def test_missing_publication_window_is_reported_without_advancing_success(self):
        with tempfile.TemporaryDirectory() as tmp:
            out=Path(tmp);old='2026-09-01T10:00:00+00:00'
            (out/'state.json').write_text(json.dumps({'records':{},'events':[],'runs':[],'last_successful_check':old}))
            with patch.object(m,'fetch',side_effect=lambda url: listing() if url==m.LISTING else detail()),patch.object(m.time,'sleep'):
                self.assertEqual(m.run(out,ROOT/'monitor/profile.json'),1)
            d=json.loads((out/'feed.json').read_text());self.assertEqual(d['last_successful_check'],old)
            self.assertEqual(d['run']['errors'][0]['kind'],'coverage_gap');self.assertEqual(len(d['notices']),1)

    def test_related_cancellation_inherits_only_an_exact_full_procedure(self):
        base={'notice_id':'1','title':'Barna','buyer':'Komuna','procedure_key':'2026/220/70100-26-1234-1-1-1','published_iso':'2026-10-19','evidence_classification':'tender_notice'}
        change={**base,'notice_id':'2','title':'Cancellation','evidence_classification':'cancellation_notice'}
        unrelated={**change,'notice_id':'3','procedure_key':'2026/999/70100-26-1234-1-1-1'}
        rows={r['notice_id']:r for r in (base,change,unrelated)};m.classify_records(rows,PROFILE)
        self.assertTrue(rows['2']['matched']);self.assertIn('njoftimin 1',rows['2']['match_reasons'][0]);self.assertFalse(rows['3']['matched'])


if __name__ == '__main__': unittest.main()
