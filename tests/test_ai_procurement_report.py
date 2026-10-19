import copy
import datetime as dt
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec=importlib.util.spec_from_file_location('ai_report',Path(__file__).resolve().parents[1]/'scripts/ai_procurement_report.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
NOW=dt.datetime(2026,10,19,8,0,tzinfo=dt.timezone.utc)
ROW={'notice_id':'1','fingerprint':'one','procedure_key':'2026/220-26-1234-1-1-1','title':'Lab supplies','buyer':'Hospital','category_sq':'Lab','published_iso':'2026-10-19','deadline_displayed':'25.10.2026 12:00','evidence_classification':'tender_notice','match_reasons':['CPV 33'],'match_confidence':'Përputhje e dokumentuar','source_url':'https://e-prokurimi.rks-gov.net/notice?id=1'}
PROFILE={'timezone':'Europe/Belgrade','name':'HumanPlus healthcare','sectors':[{'category':'Lab'}]}

def response(ids=['1']):
    return {'status':'completed','output':[{'type':'message','content':[{'type':'output_text','text':json.dumps({'entries':[{'notice_id':id,'why_match':'Sektori laboratorik i interesit.','next_step':'Lexo dosjen zyrtare.','evidence_gaps':['Kualifikimi nuk është verifikuar.']} for id in ids]})}]}],'usage':{'input_tokens':1500,'output_tokens':300,'total_tokens':1800}}

class AIReportTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.output=Path(self.temp.name)/'report.json';self.feed={'notices':[ROW],'last_successful_check':NOW.isoformat(),'run':{'status':'ok'}}
    def tearDown(self):self.temp.cleanup()
    def test_no_key_or_stale_source_never_calls_api(self):
        def deny(*a):raise AssertionError('Unexpected API call')
        self.assertEqual(m.run(self.feed,PROFILE,self.output,'',NOW,deny),0)
        self.assertEqual(json.loads(self.output.read_text())['status'],'not_configured')
        stale={**self.feed,'last_successful_check':'2026-10-16T08:00:00+00:00'}
        self.assertEqual(m.run(stale,PROFILE,self.output,'test-only',NOW,deny),1)
        self.assertEqual(json.loads(self.output.read_text())['status'],'source_unavailable')
    def test_closed_and_unknown_deadline_procedures_not_sent(self):
        cancelled={**ROW,'notice_id':'2','published_iso':'2026-10-20','evidence_classification':'cancellation_notice'}
        other={**ROW,'notice_id':'3','procedure_key':'2026/999/220-26-1234-1-1-1'}
        feed={'notices':[ROW,cancelled,other]}
        self.assertEqual([r['notice_id'] for r in m.candidates(feed,NOW.date())],['3'])
        self.assertEqual(m.candidates({'notices':[{**ROW,'deadline_displayed':'31.02.2026'}]},NOW.date()),[])
    def test_one_attempt_per_local_day_and_usage_saved_without_credentials(self):
        calls=[]
        def client(payload,key):calls.append(payload);return response()
        self.assertEqual(m.run(self.feed,PROFILE,self.output,'test-only',NOW,client),0)
        saved=json.loads(self.output.read_text());self.assertEqual(saved['status'],'ready')
        self.assertEqual(saved['entries'][0]['context_fingerprints'],{'1':'one'})
        self.assertEqual(saved['usage']['total_tokens'],1800)
        self.assertEqual(m.run(self.feed,PROFILE,self.output,'test-only',NOW,client),0)
        self.assertEqual(len(calls),1);self.assertNotIn('test-only',self.output.read_text())
        self.assertFalse(calls[0]['store']);self.assertNotIn('tools',calls[0])
    def test_api_failures_do_not_retry_or_publish_partial_ai(self):
        calls=[]
        def fail(*a):calls.append(1);raise TimeoutError()
        self.assertEqual(m.run(self.feed,PROFILE,self.output,'test-only',NOW,fail),1)
        saved=json.loads(self.output.read_text());self.assertEqual(saved['status'],'failed');self.assertEqual(saved['entries'],[])
        self.assertEqual(m.run(self.feed,PROFILE,self.output,'test-only',NOW,fail),1);self.assertEqual(len(calls),1)
    def test_unknown_duplicate_missing_ids_and_incomplete_responses_rejected(self):
        rows=m.candidates(self.feed,NOW.date())
        for data in [response(['999']),response([]),response(['1','1']),{**response(),'status':'incomplete'}]:
            with self.assertRaises(ValueError):m.validate_response(data,rows)
    def test_only_public_allowlisted_fields_enter_model_and_input_is_bounded(self):
        rows=m.candidates(self.feed,NOW.date());rows[0]['private_contacts']='do not send'
        payload=m.request_payload(rows,PROFILE)
        self.assertNotIn('private_contacts',json.dumps(payload));self.assertNotIn('do not send',json.dumps(payload))
        rows[0]['title']='x'*40000
        with self.assertRaises(ValueError):m.request_payload(rows,PROFILE)

if __name__=='__main__':unittest.main()
