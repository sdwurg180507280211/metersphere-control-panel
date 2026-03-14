#!/usr/bin/env bash

set -euo pipefail

CC_SCRIPT="${CC_SCRIPT:-$HOME/cc.sh}"
XX_SCRIPT="${XX_SCRIPT:-$HOME/xx.sh}"
ITERATIONS="${ITERATIONS:-5}"
TIMEOUT_SECONDS="${TIMEOUT_SECONDS:-90}"
MAX_TOKENS="${MAX_TOKENS:-64}"
PROMPT="${PROMPT:-Reply with exactly OK.}"
PROVIDER_FILTER=""
LIST_ONLY=0
DRY_RUN=0
VERBOSE=0
OPENAI_MODEL_OVERRIDE="${OPENAI_MODEL_OVERRIDE:-}"
ANTHROPIC_MODEL_OVERRIDE="${ANTHROPIC_MODEL_OVERRIDE:-}"
CSV_OUTPUT="${CSV_OUTPUT:-}"
SUMMARY_FILE=""

RED=$'\033[0;31m'
GREEN=$'\033[0;32m'
YELLOW=$'\033[1;33m'
BLUE=$'\033[0;34m'
CYAN=$'\033[0;36m'
NC=$'\033[0m'

usage() {
  cat <<'EOF'
Usage:
  scripts/benchmark-model-providers.sh [options]

Options:
  --list                       List providers parsed from ~/cc.sh and ~/xx.sh
  --dry-run                    Resolve providers without sending network requests
  -n, --iterations N           Number of requests per provider (default: 5)
  --timeout SECONDS            Curl max time per request (default: 90)
  --max-tokens N               Max output tokens per request (default: 64)
  --prompt TEXT                Prompt used for all benchmark requests
  --provider PATTERN           Only run providers whose names match PATTERN
  --openai-model MODEL         Override model used for xx.sh-derived providers
  --anthropic-model MODEL      Override model used for cc.sh-derived providers
  --csv PATH                   Write benchmark summary rows to CSV
  --cc-script PATH             Override cc.sh path (default: ~/cc.sh)
  --xx-script PATH             Override xx.sh path (default: ~/xx.sh)
  -v, --verbose                Print per-request timing lines
  -h, --help                   Show help

Examples:
  scripts/benchmark-model-providers.sh --list
  scripts/benchmark-model-providers.sh --provider "Kimi" -n 10
  scripts/benchmark-model-providers.sh -n 10 --csv /tmp/provider-bench.csv
  OPENAI_MODEL_OVERRIDE=gpt-4.1-mini scripts/benchmark-model-providers.sh --provider "vpsairobot"
EOF
}

print_color() {
  printf '%b%s%b\n' "$1" "$2" "$NC"
}

mask_value() {
  local value="${1:-}"
  local length=${#value}

  if [[ $length -le 10 ]]; then
    printf '%s\n' "$value"
    return
  fi

  printf '%s...%s\n' "${value:0:6}" "${value: -4}"
}

json_escape() {
  printf '%s' "$1" | tr '\n' ' ' | sed 's/\\/\\\\/g; s/"/\\"/g'
}

require_file() {
  local path="$1"
  if [[ ! -f "$path" ]]; then
    print_color "$RED" "Missing file: $path"
    exit 1
  fi
}

extract_function_body() {
  local file="$1"
  local function_name="$2"

  awk -v fn="$function_name" '
    $0 ~ "^[[:space:]]*" fn "\\(\\)[[:space:]]*\\{" {
      in_function = 1
      start_line = NR
    }

    in_function && NR > start_line && $0 ~ "^[[:space:]]*[A-Za-z_][A-Za-z0-9_]*\\(\\)[[:space:]]*\\{" {
      exit
    }

    in_function {
      print
    }
  ' "$file"
}

extract_numbered_name() {
  local body="$1"
  local provider_id="$2"

  printf '%s\n' "$body" | sed -n "s/^[[:space:]]*${provider_id})[[:space:]]*echo \"\\([^\"]*\\)\"[[:space:]]*;;[[:space:]]*$/\\1/p" | head -1
}

extract_cc_provider_ids() {
  local body
  body="$(extract_function_body "$CC_SCRIPT" "get_provider_name")"
  printf '%s\n' "$body" | sed -n 's/^[[:space:]]*\([0-9][0-9]*\))[[:space:]]*echo.*/\1/p'
}

extract_xx_provider_ids() {
  local body
  body="$(extract_function_body "$XX_SCRIPT" "get_provider_name")"
  printf '%s\n' "$body" | sed -n 's/^[[:space:]]*\([0-9][0-9]*\))[[:space:]]*echo.*/\1/p'
}

extract_cc_config_block() {
  local provider_id="$1"
  local body
  body="$(extract_function_body "$CC_SCRIPT" "get_provider_config")"

  printf '%s\n' "$body" | awk -v id="$provider_id" '
    $0 ~ "^[[:space:]]*" id "\\)[[:space:]]*$" {
      in_case = 1
      next
    }

    in_case && /cat <<'\''JSONEOF'\''/ {
      capture = 1
      next
    }

    capture && /^JSONEOF$/ {
      exit
    }

    capture {
      print
    }
  '
}

extract_json_field() {
  local payload="$1"
  local field="$2"

  printf '%s\n' "$payload" | sed -n "s/.*\"${field}\"[[:space:]]*:[[:space:]]*\"\\([^\"]*\\)\".*/\\1/p" | head -1
}

extract_xx_scalar() {
  local variable_name="$1"
  sed -n "s/^${variable_name}=\"\\([^\"]*\\)\".*/\\1/p" "$XX_SCRIPT" | head -1
}

expand_known_path() {
  local raw="$1"
  local code_dir

  code_dir="${CODEX_DIR_OVERRIDE:-$(extract_xx_scalar "CODEX_DIR")}"
  code_dir="${code_dir:-\$HOME/.codex}"
  raw="${raw//\$HOME/$HOME}"
  raw="${raw//\$\{HOME\}/$HOME}"
  raw="${raw//\$CODEX_DIR/$code_dir}"
  raw="${raw//\$\{CODEX_DIR\}/$code_dir}"
  raw="${raw//\$HOME/$HOME}"
  raw="${raw//\$\{HOME\}/$HOME}"

  printf '%s\n' "$raw"
}

extract_xx_base_url() {
  local provider_id="$1"
  local body
  body="$(extract_function_body "$XX_SCRIPT" "get_provider_base_url")"

  printf '%s\n' "$body" | sed -n "s/^[[:space:]]*${provider_id})[[:space:]]*echo \"\\([^\"]*\\)\"[[:space:]]*;;[[:space:]]*$/\\1/p" | head -1
}

extract_openai_api_key() {
  local auth_file="$1"

  if [[ ! -f "$auth_file" ]]; then
    return 1
  fi

  sed -n 's/.*"OPENAI_API_KEY"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$auth_file" | head -1
}

resolve_xx_api_key() {
  local provider_id="$1"
  local code_auth raw_backup backup_path

  code_auth="$(expand_known_path "$(extract_xx_scalar "CODEX_AUTH")")"
  raw_backup="$(extract_xx_scalar "NEWCLI_AUTH_BACKUP")"
  backup_path="$(expand_known_path "$raw_backup")"

  case "$provider_id" in
    1)
      extract_openai_api_key "$code_auth"
      ;;
    2)
      if [[ -n "${CODEX_PROVIDER_2_API_KEY:-}" ]]; then
        printf '%s\n' "$CODEX_PROVIDER_2_API_KEY"
      else
        extract_openai_api_key "$backup_path"
      fi
      ;;
    *)
      return 1
      ;;
  esac
}

extract_default_openai_model() {
  sed -n 's/^[[:space:]]*model[[:space:]]*=[[:space:]]*"\([^"]*\)".*/\1/p' "$XX_SCRIPT" | head -1
}

provider_matches_filter() {
  local name="$1"

  if [[ -z "$PROVIDER_FILTER" ]]; then
    return 0
  fi

  printf '%s\n' "$name" | grep -qi -- "$PROVIDER_FILTER"
}

join_url() {
  local base_url="$1"
  local suffix="$2"

  base_url="${base_url%/}"
  printf '%s%s\n' "$base_url" "$suffix"
}

build_anthropic_payload() {
  local model="$1"
  local prompt

  prompt="$(json_escape "$PROMPT")"
  printf '{"model":"%s","max_tokens":%s,"stream":true,"temperature":0,"messages":[{"role":"user","content":"%s"}]}' \
    "$model" "$MAX_TOKENS" "$prompt"
}

build_openai_payload() {
  local style="$1"
  local model="$2"
  local prompt

  prompt="$(json_escape "$PROMPT")"

  if [[ "$style" == "responses" ]]; then
    printf '{"model":"%s","input":"%s","max_output_tokens":%s,"stream":true}' \
      "$model" "$prompt" "$MAX_TOKENS"
  else
    printf '{"model":"%s","messages":[{"role":"user","content":"%s"}],"max_tokens":%s,"temperature":0,"stream":true}' \
      "$model" "$prompt" "$MAX_TOKENS"
  fi
}

perform_request() {
  local provider_type="$1"
  local url="$2"
  local api_key="$3"
  local model="$4"
  local request_style="$5"
  local body_file metrics status error_summary http_code
  local payload

  body_file="$(mktemp /tmp/provider-bench.XXXXXX)"

  if [[ "$provider_type" == "anthropic" ]]; then
    payload="$(build_anthropic_payload "$model")"
    set +e
    metrics="$(curl -sS -N -X POST "$url" \
      -H "content-type: application/json" \
      -H "x-api-key: $api_key" \
      -H "anthropic-version: 2023-06-01" \
      --max-time "$TIMEOUT_SECONDS" \
      -o "$body_file" \
      -w 'http_code=%{http_code} dns=%{time_namelookup} connect=%{time_connect} tls=%{time_appconnect} ttfb=%{time_starttransfer} total=%{time_total} size=%{size_download}' \
      --data "$payload" 2>&1)"
    status=$?
    set -e
  else
    payload="$(build_openai_payload "$request_style" "$model")"
    set +e
    metrics="$(curl -sS -N -X POST "$url" \
      -H "content-type: application/json" \
      -H "authorization: Bearer $api_key" \
      --max-time "$TIMEOUT_SECONDS" \
      -o "$body_file" \
      -w 'http_code=%{http_code} dns=%{time_namelookup} connect=%{time_connect} tls=%{time_appconnect} ttfb=%{time_starttransfer} total=%{time_total} size=%{size_download}' \
      --data "$payload" 2>&1)"
    status=$?
    set -e
  fi

  http_code="$(printf '%s\n' "$metrics" | sed -n 's/.*http_code=\([0-9][0-9][0-9]\).*/\1/p' | head -1)"

  if [[ $status -ne 0 || ! "$http_code" =~ ^2 ]]; then
    error_summary="$(tr '\n' ' ' < "$body_file" | sed 's/[[:space:]]\+/ /g' | cut -c1-220)"
    if [[ -z "$error_summary" ]]; then
      error_summary="$metrics"
    fi
    rm -f "$body_file"
    printf 'FAIL\t%s\t%s\t%s\n' "${http_code:-curl_error}" "$status" "$error_summary"
    return 0
  fi

  rm -f "$body_file"
  printf 'OK\t%s\n' "$metrics"
}

probe_endpoint() {
  local provider_type="$1"
  local base_url="$2"
  local api_key="$3"
  local model="$4"
  local candidate_suffix="$5"
  local candidate_style="$6"
  local url result

  url="$(join_url "$base_url" "$candidate_suffix")"
  result="$(perform_request "$provider_type" "$url" "$api_key" "$model" "$candidate_style")"

  if printf '%s\n' "$result" | grep -q '^OK'; then
    printf '%s\t%s\n' "$candidate_suffix" "$candidate_style"
    return 0
  fi

  return 1
}

resolve_endpoint() {
  local provider_type="$1"
  local base_url="$2"
  local api_key="$3"
  local model="$4"
  local suffix style probe

  if [[ "$provider_type" == "anthropic" ]]; then
    for suffix in "/v1/messages" "/messages"; do
      if probe="$(probe_endpoint "$provider_type" "$base_url" "$api_key" "$model" "$suffix" "messages")"; then
        printf '%s\n' "$probe"
        return 0
      fi
    done
  else
    while IFS='|' read -r suffix style; do
      if probe="$(probe_endpoint "$provider_type" "$base_url" "$api_key" "$model" "$suffix" "$style")"; then
        printf '%s\n' "$probe"
        return 0
      fi
    done <<'EOF'
/v1/responses|responses
/responses|responses
/v1/chat/completions|chat
/chat/completions|chat
EOF
  fi

  return 1
}

stats_line() {
  local values="$1"

  printf '%s\n' "$values" | tr ' ' '\n' | awk 'NF > 0 { print $1 }' | sort -n | awk '
    {
      values[NR] = $1
      sum += $1
    }

    END {
      if (NR == 0) {
        exit 1
      }

      p50 = int((NR * 50 + 99) / 100)
      p95 = int((NR * 95 + 99) / 100)

      if (p50 < 1) p50 = 1
      if (p95 < 1) p95 = 1
      if (p50 > NR) p50 = NR
      if (p95 > NR) p95 = NR

      printf "count=%d avg=%.3fs p50=%.3fs p95=%.3fs fastest=%.3fs slowest=%.3fs", NR, sum / NR, values[p50], values[p95], values[1], values[NR]
    }
  '
}

stats_fields() {
  local values="$1"

  printf '%s\n' "$values" | tr ' ' '\n' | awk 'NF > 0 { print $1 }' | sort -n | awk '
    {
      values[NR] = $1
      sum += $1
    }

    END {
      if (NR == 0) {
        exit 1
      }

      p50 = int((NR * 50 + 99) / 100)
      p95 = int((NR * 95 + 99) / 100)

      if (p50 < 1) p50 = 1
      if (p95 < 1) p95 = 1
      if (p50 > NR) p50 = NR
      if (p95 > NR) p95 = NR

      printf "%.6f|%.6f|%.6f|%.6f|%.6f", sum / NR, values[p50], values[p95], values[1], values[NR]
    }
  '
}

append_summary_row() {
  local provider_type="$1"
  local name="$2"
  local base_url="$3"
  local endpoint="$4"
  local model="$5"
  local success="$6"
  local failed="$7"
  local ttfb_stats="$8"
  local total_stats="$9"

  [[ -n "$SUMMARY_FILE" ]] || return 0

  printf '%s|%s|%s|%s|%s|%s|%s|%s|%s\n' \
    "$provider_type" "$name" "$base_url" "$endpoint" "$model" "$success" "$failed" "$ttfb_stats" "$total_stats" >> "$SUMMARY_FILE"
}

write_csv_output() {
  [[ -n "$CSV_OUTPUT" ]] || return 0
  [[ -n "$SUMMARY_FILE" ]] || return 0

  {
    printf 'provider_type,name,base_url,endpoint,model,success,failed,avg_ttfb,p50_ttfb,p95_ttfb,fastest_ttfb,slowest_ttfb,avg_total,p50_total,p95_total,fastest_total,slowest_total\n'
    awk -F'|' 'NF >= 17 {
      for (i = 1; i <= NF; i++) {
        gsub(/"/, "\"\"", $i)
        printf "\"%s\"", $i
        if (i < NF) {
          printf ","
        } else {
          printf "\n"
        }
      }
    }' "$SUMMARY_FILE"
  } > "$CSV_OUTPUT"
}

print_summary_table() {
  [[ -n "$SUMMARY_FILE" ]] || return 0
  [[ -s "$SUMMARY_FILE" ]] || return 0

  printf '\n'
  print_color "$BLUE" "Summary By Avg TTFB"
  awk -F'|' '
    BEGIN {
      format = "%-11s %-28s %-7s %-7s %-10s %-10s\n"
      printf format, "type", "provider", "ok", "fail", "avg_ttfb", "avg_total"
    }

    NF >= 17 {
      printf "%s|%s|%s|%s|%s|%s\n", $8, $1, $2, $6, $7, $13
    }
  ' "$SUMMARY_FILE" | sort -t'|' -k1,1n | awk -F'|' '
    BEGIN {
      format = "%-11s %-28s %-7s %-7s %-10s %-10s\n"
    }

    {
      printf format, $2, substr($3, 1, 28), $4, $5, sprintf("%.3fs", $1), sprintf("%.3fs", $6)
    }
  '
}

collect_providers() {
  local cc_name_body xx_name_body cc_id xx_id name config base_url api_key model

  cc_name_body="$(extract_function_body "$CC_SCRIPT" "get_provider_name")"
  for cc_id in $(extract_cc_provider_ids); do
    name="$(extract_numbered_name "$cc_name_body" "$cc_id")"
    provider_matches_filter "$name" || continue

    config="$(extract_cc_config_block "$cc_id")"
    base_url="$(extract_json_field "$config" "ANTHROPIC_BASE_URL")"
    api_key="$(extract_json_field "$config" "ANTHROPIC_AUTH_TOKEN")"
    model="$(extract_json_field "$config" "ANTHROPIC_MODEL")"

    if [[ -n "$ANTHROPIC_MODEL_OVERRIDE" ]]; then
      model="$ANTHROPIC_MODEL_OVERRIDE"
    fi

    printf 'anthropic|%s|%s|%s|%s\n' "$name" "$base_url" "$api_key" "$model"
  done

  xx_name_body="$(extract_function_body "$XX_SCRIPT" "get_provider_name")"
  for xx_id in $(extract_xx_provider_ids); do
    name="$(extract_numbered_name "$xx_name_body" "$xx_id")"
    provider_matches_filter "$name" || continue

    base_url="$(extract_xx_base_url "$xx_id")"
    api_key="$(resolve_xx_api_key "$xx_id" || true)"
    model="$(extract_default_openai_model)"

    if [[ -n "$OPENAI_MODEL_OVERRIDE" ]]; then
      model="$OPENAI_MODEL_OVERRIDE"
    fi

    printf 'openai|%s|%s|%s|%s\n' "$name" "$base_url" "$api_key" "$model"
  done
}

list_providers() {
  local provider_type name base_url api_key model

  collect_providers | while IFS='|' read -r provider_type name base_url api_key model; do
    printf '[%s] %s\n' "$provider_type" "$name"
    printf '  base_url: %s\n' "$base_url"
    printf '  model:    %s\n' "$model"
    printf '  key:      %s\n' "$(mask_value "${api_key:-missing}")"
  done
}

benchmark_provider() {
  local provider_type="$1"
  local name="$2"
  local base_url="$3"
  local api_key="$4"
  local model="$5"
  local resolved request_suffix request_style run result ok_count fail_count
  local ttfb_values="" total_values=""
  local endpoint_url=""
  local ttfb_stats total_stats
  local http_code dns connect tls ttfb total size

  if [[ -z "$api_key" ]]; then
    print_color "$YELLOW" "Skipping $name: missing API key"
    return 0
  fi

  if [[ $DRY_RUN -eq 1 ]]; then
    printf '\n'
    print_color "$CYAN" "Provider: $name"
    printf '  type:     %s\n' "$provider_type"
    printf '  base_url: %s\n' "$base_url"
    printf '  model:    %s\n' "$model"
    printf '  key:      %s\n' "$(mask_value "$api_key")"
    if [[ "$provider_type" == "anthropic" ]]; then
      printf '  candidates:%s\n' " $(join_url "$base_url" "/v1/messages"), $(join_url "$base_url" "/messages")"
    else
      printf '  candidates:%s\n' " $(join_url "$base_url" "/v1/responses"), $(join_url "$base_url" "/responses"), $(join_url "$base_url" "/v1/chat/completions"), $(join_url "$base_url" "/chat/completions")"
    fi
    printf '  mode:     dry-run\n'
    return 0
  fi

  if ! resolved="$(resolve_endpoint "$provider_type" "$base_url" "$api_key" "$model")"; then
    print_color "$RED" "Skipping $name: failed to resolve a working endpoint"
    return 0
  fi

  request_suffix="$(printf '%s\n' "$resolved" | awk -F '\t' '{print $1}')"
  request_style="$(printf '%s\n' "$resolved" | awk -F '\t' '{print $2}')"
  endpoint_url="$(join_url "$base_url" "$request_suffix")"

  printf '\n'
  print_color "$CYAN" "Provider: $name"
  printf '  type:     %s\n' "$provider_type"
  printf '  base_url: %s\n' "$base_url"
  printf '  endpoint: %s\n' "$endpoint_url"
  printf '  model:    %s\n' "$model"
  printf '  key:      %s\n' "$(mask_value "$api_key")"

  ok_count=0
  fail_count=0

  for run in $(seq 1 "$ITERATIONS"); do
    result="$(perform_request "$provider_type" "$endpoint_url" "$api_key" "$model" "$request_style")"

    if printf '%s\n' "$result" | grep -q '^FAIL'; then
      fail_count=$((fail_count + 1))
      if [[ $VERBOSE -eq 1 ]]; then
        printf '  run %s: %s\n' "$run" "$result"
      fi
      continue
    fi

    ok_count=$((ok_count + 1))
    http_code="$(printf '%s\n' "$result" | sed -n 's/.*http_code=\([0-9][0-9][0-9]\).*/\1/p' | head -1)"
    dns="$(printf '%s\n' "$result" | sed -n 's/.*dns=\([0-9.]*\).*/\1/p' | head -1)"
    connect="$(printf '%s\n' "$result" | sed -n 's/.*connect=\([0-9.]*\).*/\1/p' | head -1)"
    tls="$(printf '%s\n' "$result" | sed -n 's/.*tls=\([0-9.]*\).*/\1/p' | head -1)"
    ttfb="$(printf '%s\n' "$result" | sed -n 's/.*ttfb=\([0-9.]*\).*/\1/p' | head -1)"
    total="$(printf '%s\n' "$result" | sed -n 's/.*total=\([0-9.]*\).*/\1/p' | head -1)"
    size="$(printf '%s\n' "$result" | sed -n 's/.*size=\([0-9.]*\).*/\1/p' | head -1)"

    ttfb_values="${ttfb_values}${ttfb} "
    total_values="${total_values}${total} "

    if [[ $VERBOSE -eq 1 ]]; then
      printf '  run %s: http=%s dns=%ss connect=%ss tls=%ss ttfb=%ss total=%ss size=%sB\n' \
        "$run" "$http_code" "$dns" "$connect" "$tls" "$ttfb" "$total" "$size"
    fi
  done

  printf '  success:  %s/%s\n' "$ok_count" "$ITERATIONS"
  printf '  failed:   %s\n' "$fail_count"

  if [[ $ok_count -gt 0 ]]; then
    ttfb_stats="$(stats_fields "$ttfb_values")"
    total_stats="$(stats_fields "$total_values")"
    printf '  ttfb:     %s\n' "$(stats_line "$ttfb_values")"
    printf '  total:    %s\n' "$(stats_line "$total_values")"
    append_summary_row "$provider_type" "$name" "$base_url" "$endpoint_url" "$model" "$ok_count" "$fail_count" "$ttfb_stats" "$total_stats"
  else
    append_summary_row "$provider_type" "$name" "$base_url" "$endpoint_url" "$model" "$ok_count" "$fail_count" "999999.000000|999999.000000|999999.000000|999999.000000|999999.000000" "999999.000000|999999.000000|999999.000000|999999.000000|999999.000000"
  fi
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --list)
        LIST_ONLY=1
        shift
        ;;
      --dry-run)
        DRY_RUN=1
        shift
        ;;
      -n|--iterations)
        ITERATIONS="$2"
        shift 2
        ;;
      --timeout)
        TIMEOUT_SECONDS="$2"
        shift 2
        ;;
      --max-tokens)
        MAX_TOKENS="$2"
        shift 2
        ;;
      --prompt)
        PROMPT="$2"
        shift 2
        ;;
      --provider)
        PROVIDER_FILTER="$2"
        shift 2
        ;;
      --openai-model)
        OPENAI_MODEL_OVERRIDE="$2"
        shift 2
        ;;
      --anthropic-model)
        ANTHROPIC_MODEL_OVERRIDE="$2"
        shift 2
        ;;
      --csv)
        CSV_OUTPUT="$2"
        shift 2
        ;;
      --cc-script)
        CC_SCRIPT="$2"
        shift 2
        ;;
      --xx-script)
        XX_SCRIPT="$2"
        shift 2
        ;;
      -v|--verbose)
        VERBOSE=1
        shift
        ;;
      -h|--help)
        usage
        exit 0
        ;;
      *)
        print_color "$RED" "Unknown option: $1"
        usage
        exit 1
        ;;
    esac
  done
}

main() {
  local provider_type name base_url api_key model matched

  parse_args "$@"
  require_file "$CC_SCRIPT"
  require_file "$XX_SCRIPT"

  if [[ $LIST_ONLY -eq 1 ]]; then
    list_providers
    exit 0
  fi

  SUMMARY_FILE="$(mktemp /tmp/provider-summary.XXXXXX)"
  matched=0
  while IFS='|' read -r provider_type name base_url api_key model; do
    matched=1
    benchmark_provider "$provider_type" "$name" "$base_url" "$api_key" "$model"
  done < <(collect_providers)

  if [[ $matched -eq 0 ]]; then
    print_color "$YELLOW" "No providers matched the current filter."
  else
    print_summary_table
    write_csv_output
    if [[ -n "$CSV_OUTPUT" ]]; then
      printf '\n'
      print_color "$GREEN" "CSV written to: $CSV_OUTPUT"
    fi
  fi

  rm -f "$SUMMARY_FILE"
}

main "$@"
