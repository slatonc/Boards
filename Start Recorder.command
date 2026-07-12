#!/bin/zsh

cd "$(dirname "$0")"

PORT=8765
URL="http://127.0.0.1:${PORT}/recorder.html"
LOG="/tmp/for-the-boards-recorder.log"

if ! curl --silent --max-time 1 "$URL" >/dev/null 2>&1; then
    python3 -m http.server "$PORT" --bind 127.0.0.1 >"$LOG" 2>&1 &
    SERVER_PID=$!
    sleep 1
fi

open "$URL"

if [[ -n "$SERVER_PID" ]]; then
    echo "For The Boards recorder is running."
    echo "Keep this window open while recording. Press Control-C when finished."
    wait "$SERVER_PID"
fi
