#!/usr/bin/env python3
"""Create a private, ready-to-open HTML panel outside the public source checkout."""
import argparse,base64,gzip,hashlib,json,pathlib

parser=argparse.ArgumentParser()
parser.add_argument('--package',required=True)
parser.add_argument('--output',required=True)
args=parser.parse_args()
app=pathlib.Path(__file__).resolve().parents[1]
output=pathlib.Path(args.output).resolve()
if output.is_relative_to(app):raise SystemExit('The complete private panel must stay outside the public application checkout.')
package=pathlib.Path(args.package).read_bytes()
bundle=json.loads(gzip.decompress(package))
manifest=json.loads((app/'lib/import-manifest.json').read_text())
assert bundle['format']=='humanplus-private-v1' and set(bundle['objects'])==set(manifest)
for key,item in manifest.items():
 raw=base64.b64decode(bundle['objects'][key],validate=True)
 assert len(raw)==item['bytes'] and hashlib.sha256(raw).hexdigest()==item['sha256'],key
script=(app/'dist-portable/humanplus.js').read_text().replace('</script','<\\/script')
style=(app/'dist-portable/humanplus.css').read_text().replace('</style','<\\/style')
script_hash=base64.b64encode(hashlib.sha256(script.encode()).digest()).decode()
policy=f"default-src 'none'; script-src 'sha256-{script_hash}'; style-src 'unsafe-inline'; img-src data: blob:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"
html=f'''<!doctype html><html lang="sq" data-host="portable"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="{policy}"><title>HumanPlus · Paneli i plotë</title><style>{style}</style></head><body><div id="root"></div><noscript>Aktivizo JavaScript për të hapur panelin me të dhënat e përfshira.</noscript><script id="humanplus-private-package" type="application/octet-stream">{base64.b64encode(package).decode()}</script><script>{script}</script></body></html>'''
output.parent.mkdir(parents=True,exist_ok=True)
output.write_text(html)
print(json.dumps({'output':str(output),'bytes':output.stat().st_size,'verifiedObjects':len(manifest),'packageSHA256':hashlib.sha256(package).hexdigest()}))
