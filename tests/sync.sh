#!/bin/sh
# package the project (without node_modules/test output) for syncing to the user's folder
cd "$(dirname "$0")/.." && tar --exclude=node_modules --exclude=tests/out --exclude='review/triage' -czf /mnt/user-data/outputs/crestline-sync.tgz . && ls -la /mnt/user-data/outputs/crestline-sync.tgz
