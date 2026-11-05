#!/bin/sh
# after pass 3: two-player shots, frame sequences
until [ -f review/pass3/DONE ]; do sleep 20; done
node tests/shot.mjs review/twoplayer_3440x1440.png 3440x1440 "race=QQLOOQSVP20&players=2&bot&manual" 3000 200 > review/twoplayer.log 2>&1
node tests/shot.mjs review/twoplayer_1920x1080.png 1920x1080 "race=PPLONQSOP14&players=2&bot&manual" 3000 200 >> review/twoplayer.log 2>&1
mkdir -p review/seq
node tests/frames.mjs review/seq/forest_ 1280x720 "race=PPLNOPSKO12&bot&manual" 3000 12 2 > review/seq/log.txt 2>&1
node tests/frames.mjs review/seq/night_ 1280x720 "race=UUOQSTVJS02&bot&manual" 3000 12 2 >> review/seq/log.txt 2>&1
echo done > review/EXTRAS_DONE
