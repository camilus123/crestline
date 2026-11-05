#!/bin/sh
# One formal review pass: all 13 scenarios at 1920x1080 and 3440x1440. Usage: tests/reviewpass.sh review/pass1
OUT=${1:-review/pass1}
mkdir -p "$OUT"
node tests/review.mjs "$OUT" 1920x1080 "" 3000 > "$OUT/log_1080.txt" 2>&1
node tests/review.mjs "$OUT" 3440x1440 "" 3000 > "$OUT/log_1440.txt" 2>&1
echo done > "$OUT/DONE"
