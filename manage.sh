#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"

get_pids() {
  local pids=()
  mapfile -t pids < <(pgrep -f "python3 .*no_cache_server.py")
  printf '%s\n' "${pids[@]}"
}

start() {
  if mapfile -t pids < <(get_pids) && [[ ${#pids[@]} -gt 0 && -n "${pids[0]}" ]]; then
    printf 'Server already running\n'
    return 0
  fi

  cd "$ROOT_DIR"
  python3 "no_cache_server.py" >/dev/null 2>&1 &
  printf 'Started on http://127.0.0.1:8080\n'
}

stop() {
  if ! mapfile -t pids < <(get_pids) || [[ ${#pids[@]} -eq 0 || -z "${pids[0]}" ]]; then
    printf 'Server is not running\n'
    return 0
  fi

  for pid in "${pids[@]}"; do
    kill "$pid"
  done
  printf 'Stopped server\n'
}

status() {
  if mapfile -t pids < <(get_pids) && [[ ${#pids[@]} -gt 0 && -n "${pids[0]}" ]]; then
    printf 'Running\n'
  else
    printf 'Stopped\n'
  fi
}

case "${1:-start}" in
  start)
    start
    ;;
  stop)
    stop
    ;;
  restart)
    stop
    start
    ;;
  status)
    status
    ;;
  *)
    printf 'Usage: %s {start|stop|restart|status}\n' "$0" >&2
    exit 1
    ;;
esac
