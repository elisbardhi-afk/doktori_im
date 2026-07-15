#!/bin/bash
# Kill orphaned node processes and clean .next cache
# Useful when npm run dev hangs or takes too long to start

pkill -9 node 2>/dev/null || true
sleep 1
rm -rf .next 2>/dev/null || true
npm run dev
