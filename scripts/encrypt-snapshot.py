#!/usr/bin/env python3
"""Encrypt a fully verified source package. Credentials must remain outside the checkout."""
import argparse,base64,gzip,hashlib,json,pathlib,secrets
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

p=argparse.ArgumentParser();p.add_argument('--package',required=True);p.add_argument('--credentials',required=True);p.add_argument('--output',required=True);args=p.parse_args()
app=pathlib.Path(__file__).resolve().parents[1];credentials=pathlib.Path(args.credentials).resolve()
if credentials.is_relative_to(app):raise SystemExit('Credentials must stay outside the source checkout.')
account=json.loads(credentials.read_text());username=account['username'].strip().lower();password=account['password']
if not username or len(password)<24:raise SystemExit('A username and a generated password of at least 24 characters are required.')
package=pathlib.Path(args.package).read_bytes();bundle=json.loads(gzip.decompress(package));manifest=json.loads((app/'lib/import-manifest.json').read_text())
assert bundle['format']=='humanplus-private-v1' and set(bundle['objects'])==set(manifest)
for key,item in manifest.items():
 raw=base64.b64decode(bundle['objects'][key],validate=True)
 assert len(raw)==item['bytes'] and hashlib.sha256(raw).hexdigest()==item['sha256'],key
salt=secrets.token_bytes(16);iv=secrets.token_bytes(12);iterations=600000;format='humanplus-encrypted-v1'
key=hashlib.pbkdf2_hmac('sha256',(username+'\0'+password).encode(),salt,iterations,32)
encrypted=AESGCM(key).encrypt(iv,package,format.encode())
envelope={'format':format,'kdf':'PBKDF2-SHA256','iterations':iterations,'salt':base64.b64encode(salt).decode(),'iv':base64.b64encode(iv).decode(),'ciphertext':base64.b64encode(encrypted).decode()}
output=pathlib.Path(args.output);output.parent.mkdir(parents=True,exist_ok=True);output.write_text(json.dumps(envelope,separators=(',',':')))
print(json.dumps({'output':str(output),'objectsVerified':len(manifest),'bytes':output.stat().st_size,'sha256':hashlib.sha256(output.read_bytes()).hexdigest()}))
