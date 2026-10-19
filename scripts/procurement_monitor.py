"""Read-only KRPP publication collector. Standard library + curl; no portal login.

The official listing exposes ten publication dates, not an unlimited archive.
All listed titles AND every new notice's metadata are checked. A missed window,
schema change or failed detail is visible; none is reported as 'no matches'.
"""
import argparse
import concurrent.futures
import hashlib
from html.parser import HTMLParser
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time
import unicodedata
from datetime import datetime, timezone, timedelta

BASE = 'https://e-prokurimi.rks-gov.net/SPIN_PROD/application/ipn/DocumentManagement/'
LISTING = BASE + 'NewPreglediDokumenataFrm.aspx'
ROOT = Path(__file__).resolve().parents[1]
STAGES = {'B05': 'tender_notice', 'B08': 'award_notice', 'B52': 'signing_notice',
          'B10': 'cancellation_notice', 'B54': 'correction_notice', 'B58': 'decision_notice'}


def norm(s):
    return ''.join(c for c in unicodedata.normalize('NFKD', str(s)).lower() if not unicodedata.combining(c))


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False).encode()).hexdigest()


def iso_date(value):
    m = re.search(r'\b(\d{2})\.(\d{2})\.(\d{4})', value)
    if not m:
        raise ValueError('Missing publication date')
    return datetime.strptime(m.group(), '%d.%m.%Y').date().isoformat()


class PortalHTML(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack, self.items, self.fields = [], [], {}

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'input':
            self.fields[attrs.get('id', '')] = attrs.get('value', '')
        if tag not in ('input', 'br', 'img', 'meta', 'link', 'hr'):
            self.stack.append([tag, attrs, []])

    def handle_data(self, value):
        for node in self.stack:
            if node[0] in ('h1', 'h2', 'a', 'span'):
                node[2].append(value)

    def handle_endtag(self, tag):
        indices = [i for i, node in enumerate(self.stack) if node[0] == tag]
        if not indices:
            return
        index = indices[-1]
        for kind, attrs, parts in self.stack[index:]:
            value = ' '.join(' '.join(parts).split())
            if kind == 'span' and attrs.get('id'):
                self.fields[attrs['id']] = value
            if kind in ('h1', 'h2', 'a'):
                self.items.append((kind, attrs, value))
        del self.stack[index:]


def parse_listing(html):
    parser = PortalHTML(); parser.feed(html)
    date, kind, records, dates = '', '', {}, []
    for tag, attrs, text in parser.items:
        if tag == 'h1' and 'On-line' in text:
            date = iso_date(text); dates.append(date)
        elif tag == 'h2':
            kind = text.replace('PlusMinus', '').strip()
        elif tag == 'a' and text:
            m = re.fullmatch(r'DokumentPodaciFrm\.aspx\?id=(\d+)', attrs.get('href', ''), re.I)
            if m:
                if not date or not re.match(r'B\d+', kind):
                    raise ValueError('Notice appeared outside a dated publication group')
                records[m[1]] = {'notice_id': m[1], 'listed_date': date,
                    'listed_title': re.sub(r'^\d+\.\s*', '', text), 'listed_type': kind}
    if not records or not dates:
        raise ValueError('Publication listing is empty or its schema changed')
    return records, sorted(set(dates))


def parse_notice(html, listed):
    parser = PortalHTML(); parser.feed(html)
    field = lambda suffix: parser.fields.get('uiDokumentPodaci_ui' + suffix, '')
    if not all(field(k) for k in ('Naslov', 'BrojObjave', 'Narucitelj', 'VrstaObjave')):
        raise ValueError('Notice metadata missing; login/error page or schema change')
    notice_date = field('DatumObjave_textBox')
    date = iso_date(notice_date)
    code = field('BrojObjave')
    attachments = sorted(set(v for k, v in parser.fields.items() if k.endswith('lblDocumentFileName') and v))
    return {**listed, 'title': field('Naslov'), 'buyer': field('Narucitelj'),
        'procurement_code': code, 'procedure_key': re.split(r'/B\d', code)[0],
        'notice_date': notice_date, 'published_iso': date, 'year': int(date[:4]),
        'notice_type': field('VrstaObjave'), 'evidence_classification': STAGES.get(field('VrstaObjave')[:3], 'other_notice'),
        'cpv_as_published': field('Cpv'), 'contract_type': field('VrstaUgovora'),
        'estimated_value_displayed': field('ProcijenjenaVrijednost') or None,
        'estimated_value_currency': None, 'supplier': None,
        'deadline_displayed': field('RokZaDostavuVrijeme') or None,
        'deadline_timezone': 'Not stated on portal metadata; verify in tender dossier',
        'attachments': attachments, 'source_url': BASE + 'DokumentPodaciFrm.aspx?id=' + listed['notice_id'],
        'source': 'krpp_daily_monitor', 'source_label': 'KRPP · monitori ditor',
        'gaps': 'Metadata only. Currency, supplier, requirements and current eligibility are not inferred. Check the official dossier.'}


def classify(row, profile):
    title = norm(row.get('title', '') + ' ' + row.get('listed_title', ''))
    buyer = norm(row.get('buyer', ''))
    health_buyer = [t for t in profile['health_buyers'] if norm(t) in buyer]
    cpv = re.match(r'\d{8}', row.get('cpv_as_published', ''))
    cpv_match = bool(cpv and any(cpv.group().startswith(p) for p in profile['cpv_prefixes']))
    sectors = [s for s in profile['sectors'] if any(norm(t) in title for t in s['terms'])]
    extra = [t for t in profile.get('extra_keywords', []) if norm(t) in title]
    excluded = [t for t in profile.get('excluded_keywords', []) if norm(t) in title]
    non_health = [t for t in profile['non_health_context'] if norm(t) in title + ' ' + buyer]
    reasons = []
    if cpv_match: reasons.append('FPP/CPV: ' + cpv.group())
    if health_buyer: reasons.append('Institucion shëndetësor: ' + row.get('buyer', ''))
    for sector in sectors: reasons.append('Terma në titull: ' + sector['category'])
    if extra: reasons.append('Fjalë të profilit: ' + ', '.join(extra))
    relevant = bool(reasons) and not excluded
    review = bool(non_health and not health_buyer) or bool(sectors and not cpv_match and not health_buyer)
    category = sectors[0]['category'] if sectors else ('Mbështetje e institucioneve shëndetësore' if health_buyer and not cpv_match else 'Shëndetësi · kategori për shqyrtim')
    return {'matched': relevant, 'match_reasons': reasons,
        'match_confidence': 'Për shqyrtim' if review else 'Përputhje e dokumentuar',
        'category_sq': category, 'scope': 'institutional_support' if health_buyer and not sectors and not cpv_match else 'medical_goods_services',
        'classification_basis': 'humanplus_healthcare_rules_v1; classification is not a bidding recommendation',
        'review_context': non_health, 'excluded_by': excluded}


def classify_records(records, profile):
    for row in records.values(): row.update(classify(row, profile))
    def procedure(row):
        value = re.sub(r'^(?:19|20)\d{2}/', '', row.get('procedure_key', ''))
        return value if re.fullmatch(r'[\d/-]+', value) else ''
    anchors = {}
    for row in sorted(records.values(), key=lambda r: (r.get('published_iso', ''), r['notice_id'])):
        key = procedure(row)
        if row['matched'] and key: anchors.setdefault(key, row)
    for row in records.values():
        anchor = anchors.get(procedure(row))
        if not row['matched'] and not row['excluded_by'] and anchor and row['evidence_classification'] in ('correction_notice','cancellation_notice','decision_notice','award_notice','signing_notice'):
            row.update(matched=True, category_sq=anchor['category_sq'], scope=anchor['scope'],
                match_confidence=anchor['match_confidence'],
                match_reasons=['Procedurë e njëjtë me njoftimin ' + anchor['notice_id']],
                classification_basis='exact_full_procedure_link_to_healthcare_notice')


def fetch(url):
    # Only a fixed public host and validated numeric notice IDs are requested.
    result = subprocess.run(['curl', '--fail', '--silent', '--show-error', '--location',
        '--proto', '=https', '--proto-redir', '=https', '--connect-timeout', '10', '--max-time', '40',
        '--max-filesize', '12000000', '--retry', '2', '--retry-delay', '2',
        '--user-agent', 'HumanPlus-PublicProcurementMonitor/1.0', url], capture_output=True, timeout=140)
    if result.returncode:
        raise RuntimeError('Official portal request failed (curl ' + str(result.returncode) + ')')
    return result.stdout.decode('utf-8-sig')


def update_record(old, new, now):
    semantic = {k: v for k, v in new.items() if k not in ('listed_type', 'listed_date')}
    fingerprint = digest(semantic)
    changed = old is not None and old.get('fingerprint') != fingerprint
    row = {**new, 'fingerprint': fingerprint, 'first_seen_at': (old or {}).get('first_seen_at', now),
           'last_checked_at': now, 'changed_at': now if changed else (old or {}).get('changed_at')}
    fields = [k for k in semantic if old is not None and old.get(k) != new.get(k)]
    return row, fields


def atomic_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix('.tmp'); tmp.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n'); tmp.replace(path)


def run(out, profile_path, cache=None):
    profile = json.loads(profile_path.read_text())
    state_path, feed_path = out / 'state.json', out / 'feed.json'
    state = json.loads(state_path.read_text()) if state_path.exists() else {'records': {}, 'events': [], 'runs': []}
    now = datetime.now(timezone.utc).isoformat(timespec='seconds')
    records, events, errors = state['records'], state['events'], []
    previous_success = state.get('last_successful_check')
    previous_matches = {key for key, row in records.items() if row.get('matched')}
    dates, listed, checked, new_ids, changed_ids, changed_fields = [], {}, 0, [], [], {}
    try:
        listing_html = fetch(LISTING)
        listed, dates = parse_listing(listing_html)
        if previous_success and previous_success[:10] < dates[0]:
            errors.append({'kind': 'coverage_gap', 'message': 'Last complete check predates the oldest visible publication date; archive backfill required.'})
        # Check every new publication, plus matched recent/open notices for edits.
        cutoff = (datetime.now(timezone.utc) - timedelta(days=30)).date().isoformat()
        targets = dict(listed)
        for key, r in records.items():
            deadline = r.get('deadline_displayed') or ''
            try: upcoming = iso_date(deadline) >= now[:10]
            except ValueError: upcoming = False
            if r.get('matched') and (r.get('published_iso', '') >= cutoff or upcoming):
                targets.setdefault(key, {k: r[k] for k in ('notice_id', 'listed_date', 'listed_title', 'listed_type')})
        pending = [(k, r) for k, r in targets.items() if k not in records or records[k].get('matched') or records[k].get('listed_title') != r['listed_title']]

        def read(item):
            key, listing = item
            cached = cache / (key + '.html') if cache else None
            # Cache is only an explicit local bootstrap aid, never used by schedule.
            from_cache = cached and cached.exists()
            html = cached.read_text() if from_cache else fetch(BASE + 'DokumentPodaciFrm.aspx?id=' + key)
            row = parse_notice(html, listing)
            if cached and not cached.exists(): cached.write_text(html)
            if not from_cache: time.sleep(0.2)
            fetched_at = datetime.fromtimestamp(cached.stat().st_mtime, timezone.utc).isoformat(timespec='seconds') if from_cache else datetime.now(timezone.utc).isoformat(timespec='seconds')
            return key, row, hashlib.sha256(html.encode()).hexdigest(), fetched_at

        if cache: cache.mkdir(parents=True, exist_ok=True)
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            futures = {pool.submit(read, item): item[0] for item in pending}
            for future in concurrent.futures.as_completed(futures):
                key = futures[future]
                try:
                    key, raw, source_hash, fetched_at = future.result()
                    old = records.get(key); row, fields = update_record(old, raw, now)
                    row.update(classify(row, profile)); row.update(source_sha256=source_hash, retrieved_date=fetched_at[:10], last_checked_at=fetched_at)
                    records[key] = row; checked += 1
                    if old is None: new_ids.append(key)
                    elif fields: changed_ids.append(key)
                    changed_fields[key] = fields
                except Exception as exc:
                    errors.append({'kind': 'detail_failure', 'notice_id': key, 'message': str(exc)[:180]})
                if (checked + len(errors)) % 50 == 0:
                    print(json.dumps({'processed': checked, 'pending_total': len(pending), 'errors': len(errors)}), flush=True)
        state['listing_sha256'] = hashlib.sha256(listing_html.encode()).hexdigest()
    except Exception as exc:
        errors.append({'kind': 'listing_failure', 'message': str(exc)[:180]})
    # Reapply the saved profile to accumulated records when interests change.
    classify_records(records, profile)
    for key, r in records.items():
        if r['matched'] and (key in new_ids or key in changed_ids or key not in previous_matches):
            kind = 'new' if key in new_ids else 'changed' if key in changed_ids else 'new_match'
            event_id = digest([key, r['fingerprint']] + ([digest(profile)] if kind == 'new_match' else []))
            if not any(e['id'] == event_id for e in events):
                events.append({'id': event_id, 'notice_id': key, 'kind': kind, 'at': now,
                    'fields': ['interest_profile'] if kind == 'new_match' else changed_fields.get(key, [])})
    run_info = {'at': now, 'status': 'partial' if errors and checked else 'failed' if errors else 'ok',
        'listed': len(listed), 'checked': checked, 'new': len(new_ids), 'changed': len(changed_ids),
        'publication_dates': dates, 'errors': errors}
    state.update(last_attempt=now, last_successful_check=previous_success if errors else now,
        records=records, events=events, runs=(state.get('runs', []) + [run_info])[-30:])
    matched = sorted([r for r in records.values() if r['matched']], key=lambda r: (r['published_iso'], r['notice_id']), reverse=True)
    for r in matched: r['latest_verified_note_sq'] = 'Metadata e kontrolluar më ' + r['last_checked_at'] + '; verifiko dosjen para ofertimit.'
    feed = {'schema_version': 1, 'profile': profile, 'source_url': LISTING,
        'last_attempt': now, 'last_successful_check': state['last_successful_check'],
        'run': run_info, 'runs': state['runs'], 'notices': matched,
        'events': [e for e in events if records.get(e['notice_id'], {}).get('matched')],
        'codex_notifications': 'not_connected',
        'coverage_note': 'All notices in the portal’s visible publication list are checked. The list currently exposes ten publication dates. Older history and document-body-only matches are outside this collector’s verified coverage.'}
    atomic_json(state_path, state); atomic_json(feed_path, feed)
    print(json.dumps({**{k: run_info[k] for k in ('status', 'listed', 'checked', 'new', 'changed')}, 'matched': len(matched), 'errors': len(errors)}, ensure_ascii=False))
    if os.environ.get('GITHUB_STEP_SUMMARY'):
        with open(os.environ['GITHUB_STEP_SUMMARY'], 'a') as f:
            f.write(f"HumanPlus monitor: **{run_info['status']}**. Checked {checked} notices; {len(matched)} accumulated healthcare matches; {len(errors)} errors. See monitor/feed.json for provenance and coverage.\n")
    return 1 if errors else 0


if __name__ == '__main__':
    parser = argparse.ArgumentParser(); parser.add_argument('--output', type=Path, default=ROOT / 'monitor')
    parser.add_argument('--profile', type=Path, default=ROOT / 'monitor/profile.json'); parser.add_argument('--bootstrap-cache', type=Path)
    args = parser.parse_args(); sys.exit(run(args.output, args.profile, args.bootstrap_cache))
