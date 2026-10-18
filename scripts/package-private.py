#!/usr/bin/env python3
"""Package reviewed private objects for local browser import. Never writes in app/public."""
import argparse,base64,gzip,hashlib,json,pathlib
p=argparse.ArgumentParser();p.add_argument('--objects',required=True);p.add_argument('--output',required=True);args=p.parse_args()
app=pathlib.Path(__file__).resolve().parents[1];dest=pathlib.Path(args.output).resolve();root=pathlib.Path(args.objects).resolve()
if dest.is_relative_to(app):raise SystemExit('Private package must be outside application checkout')
manifest=json.loads((app/'lib/import-manifest.json').read_text());objects={}
for key,item in manifest.items():
 b=(root/key).read_bytes();assert len(b)==item['bytes'] and hashlib.sha256(b).hexdigest()==item['sha256'];objects[key]=base64.b64encode(b).decode()
dest.parent.mkdir(parents=True,exist_ok=True)
with gzip.open(dest,'wb') as f:f.write(json.dumps({'format':'humanplus-private-v1','sourceDate':'2026-10-18','objects':objects},separators=(',',':')).encode())
print(json.dumps({'objects':len(objects),'bytes':dest.stat().st_size,'output':str(dest)}))
