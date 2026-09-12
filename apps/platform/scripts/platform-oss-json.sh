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
let depth = 0;
let inString = false;
let escape = false;
let end = -1;
for (let i = start; i < text.length; i++) {
  const ch = text[i];
  if (inString) {
    if (escape) escape = false;
    else if (ch === "\\") escape = true;
    else if (ch === "\"") inString = false;
    continue;
  }
  if (ch === "\"") {
    inString = true;
    continue;
  }
  if (ch === "{") depth++;
  else if (ch === "}") {
    depth--;
    if (depth === 0) {
      end = i + 1;
      break;
    }
  }
}
let obj;
try {
  obj = end < 0 ? undefined : JSON.parse(text.slice(start, end));
} catch {
  // JSON.parse throws SyntaxError for a brace-balanced but invalid object.
  obj = undefined;
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
