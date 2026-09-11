#!/usr/bin/env bash

_platform_extract_json_object_python() {
  "$1" -c '
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

_platform_extract_json_object_node() {
  node -e '
const fs = require("fs");
const text = fs.readFileSync(0, "utf8");
const start = text.indexOf("{");
if (start < 0) {
  console.error("platform: oss cat stdout has no JSON object");
  process.exit(1);
}
let obj;
let end;
for (let i = start + 1; i <= text.length; i++) {
  try {
    obj = JSON.parse(text.slice(start, i));
    end = i;
    break;
  } catch (error) {
    if (error instanceof SyntaxError) continue;
    throw error;
  }
}
if (obj === undefined || typeof obj !== "object" || obj === null || Array.isArray(obj)) {
  console.error("platform: oss cat stdout is not a JSON object");
  process.exit(1);
}
const rest = text.slice(end).replace(/^\s+/, "");
if (rest.startsWith("{") || rest.startsWith("[")) {
  console.error("platform: oss cat stdout contains extra JSON");
  process.exit(1);
}
process.stdout.write(JSON.stringify(obj) + "\n");
'
}

platform_extract_json_object() {
  if command -v python3 >/dev/null 2>&1; then
    _platform_extract_json_object_python python3
  elif command -v python >/dev/null 2>&1; then
    _platform_extract_json_object_python python
  elif command -v node >/dev/null 2>&1; then
    _platform_extract_json_object_node
  else
    echo 'platform: python3, python, or node is required to extract oss cat JSON' >&2
    return 1
  fi
}
