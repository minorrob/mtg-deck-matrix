#!/usr/bin/env bash
# verify-staging.sh <release work dir> <previous version id prefix>: wait for Workers Builds to deploy a new
# version of crankmagic-staging (CLOUDFLARE_ACCOUNT_ID and WRANGLER set; a Cloudflare API token reachable by curl), then compare its play-worker.js with wrangler's dry-run bundle of the release
# commit, and list the AI bindings. Read-only against Cloudflare.
set -u
W=$1; PREV=$2; A=${CLOUDFLARE_ACCOUNT_ID:?set CLOUDFLARE_ACCOUNT_ID}; API=https://api.cloudflare.com/client/v4/accounts/$A/workers/scripts/crankmagic-staging
cd /tmp
# Where a proxy does not add the token, CLOUDFLARE_API_TOKEN is sent (read-only use; never printed).
AUTH=(); [ -n "${CLOUDFLARE_API_TOKEN:-}" ] && AUTH=(-H "Authorization: Bearer $CLOUDFLARE_API_TOKEN")
for i in $(seq 1 60); do
  v=$(curl -sS "${AUTH[@]}" "$API/deployments" | python3 -c "import json,sys; d=json.load(sys.stdin)['result']['deployments'][0]; print(d['created_on'], d['versions'][0]['version_id'])" 2>/dev/null)
  case "$v" in *"$PREV"*|"") sleep 30;; *) echo "deployed $v"; break;; esac
done
V=$(echo "$v" | awk '{print $2}')
(cd $W/commit && node "${WRANGLER:?set WRANGLER to wrangler.js}" deploy --dry-run --outdir $W/dry > $W/dry.log 2>&1)
curl -sS "${AUTH[@]}" "$API/content/v2?version=$V" -D $W/content.h -o $W/content.bin
python3 - "$W" <<'EOF'
import sys, email, hashlib
W=sys.argv[1]
ct=[l.split(':',1)[1].strip() for l in open(f"{W}/content.h").read().splitlines() if l.lower().startswith('content-type')][-1]
msg=email.message_from_bytes(b"Content-Type: "+ct.encode()+b"\r\n\r\n"+open(f"{W}/content.bin","rb").read())
for p in msg.walk():
    if not p.is_multipart(): b=p.get_payload(decode=True); print('deployed', p.get_filename() or p.get_param('name',header='content-disposition'), len(b), hashlib.sha256(b).hexdigest()[:12])
b=open(f"{W}/dry/play-worker.js","rb").read(); print('dry-run play-worker.js', len(b), hashlib.sha256(b).hexdigest()[:12])
EOF
curl -sS "${AUTH[@]}" "$API/versions/$V" | python3 -c "
import json,sys; d=json.load(sys.stdin)['result']
print('AI bindings', [x['name'] for x in d.get('resources',{}).get('bindings',[]) if x['name'].startswith('AI_')])"
