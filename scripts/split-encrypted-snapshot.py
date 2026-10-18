#!/usr/bin/env python3
"""Store encrypted ciphertext in upload-sized parts; no plaintext or credentials."""
import argparse,hashlib,json,pathlib
p=argparse.ArgumentParser();p.add_argument('--input',required=True);args=p.parse_args()
app=pathlib.Path(__file__).resolve().parents[1];raw=pathlib.Path(args.input).read_bytes()
assert json.loads(raw)['format']=='humanplus-encrypted-v1'
manifest=json.loads((app/'snapshots/publication.json').read_text());parts=[];size=32*1024*1024
for i,start in enumerate(range(0,len(raw),size),1):
 key=f'snapshots/humanplus-2026-10-18.encrypted.part-{i:02d}.chunk';chunk=raw[start:start+size];(app/key).write_bytes(chunk)
 parts.append({'path':key,'bytes':len(chunk),'sha256':hashlib.sha256(chunk).hexdigest()})
manifest.pop('path',None);manifest.update(parts=parts,bytes=len(raw),sha256=hashlib.sha256(raw).hexdigest())
(app/'snapshots/publication.json').write_text(json.dumps(manifest,indent=2)+'\n');print(json.dumps({'parts':len(parts),'bytes':len(raw)}))
