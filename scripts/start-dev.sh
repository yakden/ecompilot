#!/bin/bash
# Start all EcomPilot PL services for local development
cd /c/SaaS-PL/ecompilot

# Read .env and export variables, handling multiline JWT keys
eval "$(
  awk '
    /^#/ { next }
    /^$/ { next }
    /^[A-Z_]+=/ {
      # Check if value starts with a double-quoted multiline
      if (match($0, /^([A-Z_]+)="(.*)/, arr)) {
        key = arr[1]
        val = arr[2]
        # If line does not end with closing quote, accumulate
        if (val !~ /"$/) {
          while ((getline line) > 0) {
            val = val "\n" line
            if (line ~ /"$/) break
          }
        }
        gsub(/"$/, "", val)
        gsub(/'\''/, "'\''\\'\'''\''", val)
        printf "export %s='\''%s'\''\n", key, val
      } else {
        # Simple key=value
        match($0, /^([A-Z_]+)=(.*)/, arr)
        key = arr[1]
        val = arr[2]
        gsub(/'\''/, "'\''\\'\'''\''", val)
        printf "export %s='\''%s'\''\n", key, val
      }
    }
  ' .env
)"

# Service port mapping
declare -A PORTS=(
  [api-gateway]=3001
  [auth-service]=3002
  [suppliers-service]=3003
  [calc-service]=3004
  [analytics-service]=3005
  [ai-service]=3006
  [content-service]=3007
  [community-service]=3008
  [legal-service]=3009
  [ksef-service]=3010
  [inventory-service]=3011
  [marketplace-hub]=3012
  [billing-service]=3013
  [notification-service]=3014
  [logistics-engine]=3015
  [academy-service]=3016
  [payment-reconciliation]=3017
  [scraper-service]=3018
)

for svc in "${!PORTS[@]}"; do
  port=${PORTS[$svc]}
  export PORT=$port
  export HOST=0.0.0.0
  export RESEND_API_KEY="${RESEND_API_KEY:-re_stub_key}"
  cd /c/SaaS-PL/ecompilot/services/$svc
  npx tsx src/index.ts > /tmp/${svc}.log 2>&1 &
  echo "Started $svc on port $port (PID $!)"
done
