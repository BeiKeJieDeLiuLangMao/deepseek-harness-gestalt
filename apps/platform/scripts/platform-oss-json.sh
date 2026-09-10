#!/usr/bin/env bash

platform_extract_json_object() {
  python3 -c '
import json
import sys

text = sys.stdin.read()
start = text.find("{")
if start < 0:
    print("platform: oss cat stdout has no JSON object", file=sys.stderr)
    sys.exit(1)
try:
    obj, end = json.JSONDecoder().raw_decode(text, start)
except json.JSONDecodeError:
    print("platform: oss cat stdout is not a JSON object", file=sys.stderr)
    sys.exit(1)
if not isinstance(obj, dict):
    print("platform: oss cat stdout is not a JSON object", file=sys.stderr)
    sys.exit(1)
rest = text[end:].lstrip()
if rest.startswith("{") or rest.startswith("["):
    print("platform: oss cat stdout contains extra JSON", file=sys.stderr)
    sys.exit(1)
json.dump(obj, sys.stdout, separators=(",", ":"))
print()
'
}
