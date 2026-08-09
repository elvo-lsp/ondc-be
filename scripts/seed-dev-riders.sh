#!/usr/bin/env bash
#
# Populates the dev database with riders across every status, so the admin
# panel's verification queue and rider list have something in them.
#
# Everything goes through the real HTTP API rather than direct inserts: that way
# Aadhaar encryption, the PROFILE_PENDING -> UNDER_REVIEW transition and all the
# validation run for real, and this can't drift from the application's own
# behaviour. OTPs are read straight out of Redis (see docs/infra/redis.md).
#
# Requires: the backend running, Postgres + Redis up, `npx prisma db seed` done.
#
#   ./scripts/seed-dev-riders.sh
#
# Re-running is safe but not idempotent - riders already registered keep their
# existing status, since register/verify won't reset one.

set -euo pipefail

API="${API_URL:-http://localhost:3000}"
ADMIN_EMAIL="${SEED_ADMIN_EMAIL:-admin@elvo.local}"
ADMIN_PASSWORD="${SEED_ADMIN_PASSWORD:-change-me}"
REDIS_CONTAINER="${REDIS_CONTAINER:-ondc-be-redis-1}"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# Multer keys the stored extension off the uploaded filename, and the admin
# endpoint only serves an inline image for allowlisted types - so use .png.
printf 'fake-document-bytes' > "$TMP/doc.png"

# Every python3 -c below stays on ONE line. A multi-line -c argument is mangled
# by Windows shims (pyenv-win wraps python in a .bat), which fails with a
# confusing IndentationError rather than anything that points here.
json() { python3 -c "import sys,json;print(json.load(sys.stdin)$1)"; }

admin_token() {
  curl -sS -X POST "$API/admin/auth/login" \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}" \
    | json '["accessToken"]'
}

# Reading the OTP from Redis instead of the server log avoids log-buffering
# races entirely - the key exists the moment register/login returns.
rider_token() {
  local name="$1" email="$2" phone="$3"

  curl -sS -o /dev/null -X POST "$API/rider/auth/register" \
    -H 'Content-Type: application/json' \
    -d "{\"name\":\"$name\",\"email\":\"$email\",\"phone\":\"$phone\"}"

  local otp
  otp=$(docker exec "$REDIS_CONTAINER" redis-cli --no-raw GET "rider-otp:$email" \
    | python3 -c 'import sys,json;print(json.loads(json.loads(sys.stdin.read().strip()))["code"])')

  curl -sS -X POST "$API/rider/auth/verify-otp" \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"$email\",\"code\":\"$otp\"}" \
    | json '["accessToken"]'
}

submit_profile() {
  local token="$1" dob="$2" temp="$3" perm="$4" aadhaar="$5"

  curl -sS -o /dev/null -X POST "$API/rider/profile" \
    -H "Authorization: Bearer $token" -H 'Content-Type: application/json' \
    -d "{\"dateOfBirth\":\"$dob\",\"temporaryAddress\":\"$temp\",\"permanentAddress\":\"$perm\",\"aadharNumber\":\"$aadhaar\"}"

  # These must match REQUIRED_DOCUMENT_TYPES exactly - the upload DTO validates
  # against that allowlist, and a rider is only complete once all three are in.
  for type in AADHAAR PAN DRIVING_LICENSE; do
    curl -sS -o /dev/null -X POST "$API/rider/profile/documents" \
      -H "Authorization: Bearer $token" \
      -F "type=$type" -F "file=@$TMP/doc.png"
  done
}

# Rejects one of a rider's documents, leaving them UNDER_REVIEW with an
# outstanding re-upload - the state the onboarding app shows a comment for.
reject_document() {
  local rider_id="$1" type="$2" comment="$3" doc_id

  doc_id=$(curl -sS "$API/admin/riders/$rider_id" -H "Authorization: Bearer $TOKEN" \
    | python3 -c "import sys,json;want=sys.argv[1];docs=json.load(sys.stdin)['documents'];print(next((d['id'] for d in docs if d['type']==want and not d['supersededAt']), ''))" "$type")

  curl -sS -o /dev/null -X POST "$API/admin/riders/$rider_id/documents/$doc_id/review" \
    -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
    -d "{\"action\":\"reject\",\"comment\":\"$comment\"}"
}

# -G with --data-urlencode, not string interpolation: a phone starts with '+',
# which in a raw query string decodes to a space and matches nothing.
rider_id_by_phone() {
  curl -sS -G "$API/admin/riders" --data-urlencode "search=$1" \
    -H "Authorization: Bearer $TOKEN" \
    | json '["riders"][0]["id"]'
}

vendor_id_by_name() {
  curl -sS "$API/admin/vendors?includeInactive=true" -H "Authorization: Bearer $TOKEN" \
    | python3 -c "import sys,json;name=sys.argv[1];print(next((v['id'] for v in json.load(sys.stdin) if v['name']==name), ''))" "$1"
}

ensure_vendor() {
  local name="$1" contact="$2" phone="$3" address="$4"
  local existing
  existing=$(vendor_id_by_name "$name")

  if [ -n "$existing" ]; then
    echo "$existing"
    return
  fi

  curl -sS -X POST "$API/admin/vendors" \
    -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
    -d "{\"name\":\"$name\",\"contactName\":\"$contact\",\"contactPhone\":\"$phone\",\"address\":\"$address\"}" \
    | json '["id"]'
}

echo "==> signing in as $ADMIN_EMAIL"
TOKEN=$(admin_token)

echo "==> ensuring vendors exist"
V1=$(ensure_vendor 'Reliance Fresh Powai' 'Suresh Iyer' '+919812345678' 'Powai, Mumbai 400076')
V2=$(ensure_vendor 'DMart Thane West' 'Anita Deshmukh' '+919823456789' 'Thane West, Mumbai 400601')
V3=$(ensure_vendor 'More Supermarket Andheri' 'Rakesh Gupta' '+919834567890' 'Andheri East, Mumbai 400069')
echo "    $V1 / $V2 / $V3"

# name|email|phone|dob|temp address|permanent address|aadhaar|target status|vendor|reason
#
# "target status" is a scenario, not only a RiderStatus: DOC_REJECTED leaves the
# rider UNDER_REVIEW with one document bounced. For that row the vendor column
# carries the document type to reject and reason carries the comment shown to
# the rider.
RIDERS=$(cat <<'ROWS'
Rahul Kumar|rahul.kumar@example.com|+919810000001|1995-01-12|A-123 Krishna Nagar, Delhi|Village Rampur, Bihar|234512340001|UNDER_REVIEW||
Imran Sheikh|imran.sheikh@example.com|+919810000002|1998-03-22|12 Nehru Colony, Bhopal|12 Nehru Colony, Bhopal|234512340002|UNDER_REVIEW||
Priya Nair|priya.nair@example.com|+919810000003|1996-07-08|44 MG Road, Kochi|44 MG Road, Kochi|234512340003|UNDER_REVIEW||
Vikram Rathore|vikram.rathore@example.com|+919810000004|1992-11-30|7 Civil Lines, Jaipur|Sikar, Rajasthan|234512340004|UNDER_REVIEW||
Neha Bansal|neha.bansal@example.com|+919810000005|1997-06-14|18 Sector 22, Chandigarh|Ludhiana, Punjab|234512340011|DOC_REJECTED|PAN|PAN photo is blurred - please upload a clearer one
Farhan Qureshi|farhan.qureshi@example.com|+919810000006|1995-12-01|3 Banjara Hills, Hyderabad|Warangal, Telangana|234512340012|DOC_REJECTED|DRIVING_LICENSE|Driving licence has expired - upload a valid one
Aman Singh|aman.singh@example.com|+919820000001|1997-05-15|B-45 Malviya Nagar, Jaipur|Sikar, Rajasthan|234512340005|APPROVED|V1|
Ravi Patel|ravi.patel@example.com|+919820000002|1993-08-05|C-89 SG Highway, Ahmedabad|Anand, Gujarat|234512340006|APPROVED|V1|
Sunita Devi|sunita.devi@example.com|+919820000003|1999-02-18|22 Gomti Nagar, Lucknow|Barabanki, UP|234512340007|APPROVED|V2|
Arjun Mehta|arjun.mehta@example.com|+919820000004|1994-09-27|9 Koregaon Park, Pune|Nashik, Maharashtra|234512340008|APPROVED|V3|
Suresh Yadav|suresh.yadav@example.com|+919830000001|1990-11-22|D-12 Gomti Nagar, Lucknow|Gonda, UP|234512340009|REJECTED||Driving licence has expired
Deepak Verma|deepak.verma@example.com|+919830000002|1991-04-03|55 Vaishali, Ghaziabad|Meerut, UP|234512340010|REJECTED||Aadhaar scan is unreadable - please re-upload
Kavita Joshi|kavita.joshi@example.com|+919840000001|||||PROFILE_PENDING||
Manoj Kumar|manoj.kumar@example.com|+919840000002|||||PROFILE_PENDING||
ROWS
)

while IFS='|' read -r name email phone dob temp perm aadhaar status vendor reason; do
  [ -z "$name" ] && continue
  printf '==> %-16s %s\n' "$status" "$name"

  RT=$(rider_token "$name" "$email" "$phone")

  # PROFILE_PENDING riders stop here: verified, nothing submitted. Riders already
  # APPROVED/REJECTED from an earlier run refuse these writes (400) - harmless,
  # since curl doesn't fail the script on an HTTP error status.
  if [ "$status" != "PROFILE_PENDING" ]; then
    submit_profile "$RT" "$dob" "$temp" "$perm" "$aadhaar"
  fi

  case "$status" in
    APPROVED)
      case "$vendor" in
        V1) VID=$V1 ;; V2) VID=$V2 ;; *) VID=$V3 ;;
      esac
      curl -sS -o /dev/null -X POST "$API/admin/riders/$(rider_id_by_phone "$phone")/approve" \
        -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
        -d "{\"vendorId\":\"$VID\"}"
      ;;
    REJECTED)
      curl -sS -o /dev/null -X POST "$API/admin/riders/$(rider_id_by_phone "$phone")/reject" \
        -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
        -d "{\"reason\":\"$reason\"}"
      ;;
    DOC_REJECTED)
      reject_document "$(rider_id_by_phone "$phone")" "$vendor" "$reason"
      ;;
  esac
done <<< "$RIDERS"

echo
echo "==> done. counts by status:"
for s in PROFILE_PENDING UNDER_REVIEW APPROVED REJECTED; do
  n=$(curl -sS "$API/admin/riders?status=$s&limit=1" -H "Authorization: Bearer $TOKEN" | json '["total"]')
  printf '    %-16s %s\n' "$s" "$n"
done

d=$(curl -sS "$API/admin/riders?status=UNDER_REVIEW&limit=100" -H "Authorization: Bearer $TOKEN" \
  | python3 -c "import sys,json;print(sum(1 for r in json.load(sys.stdin)['riders'] if r['hasRejectedDocs']))")
printf '    %-16s %s\n' "of which doc-rejected" "$d"
