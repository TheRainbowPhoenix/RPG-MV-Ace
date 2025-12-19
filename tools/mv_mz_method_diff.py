#!/usr/bin/env python3
import os
import re
import json
import hashlib
from pathlib import Path
from typing import Dict, Tuple, List

# ---------
# Heuristic JS "method extractor"
# ---------
# We extract blocks starting at a signature and then track braces to end of function/method.
# This is not a full parser, but works well on RPG Maker engine sources.

RE_FUNC_DECL = re.compile(r'(^|\n)\s*function\s+([A-Za-z_$][\w$]*)\s*\(', re.M)
RE_PROTO_FUNC = re.compile(
    r'(^|\n)\s*([A-Za-z_$][\w$]*)\.prototype\.([A-Za-z_$][\w$]*)\s*=\s*function\s*\(',
    re.M,
)
RE_ASSIGN_FUNC = re.compile(
    r'(^|\n)\s*([A-Za-z_$][\w$]*)\.([A-Za-z_$][\w$]*)\s*=\s*function\s*\(',
    re.M,
)

# ES6 class: class X { methodName(...) { ... } }
RE_CLASS_DECL = re.compile(r'(^|\n)\s*class\s+([A-Za-z_$][\w$]*)\s*(extends\s+[A-Za-z_$][\w$]*)?\s*\{', re.M)
RE_CLASS_METHOD = re.compile(
    r'(^|\n)\s*(?:async\s+)?([A-Za-z_$][\w$]*)\s*\(([^)]*)\)\s*\{',
    re.M,
)

# Skip obvious non-methods inside class blocks
CLASS_METHOD_BLACKLIST = {
    "constructor", "get", "set", "static"
}

def find_block(text: str, start_index: int) -> Tuple[int, int]:
    """Given index pointing at start of 'function' or method header, return (block_start, block_end) inclusive."""
    # Find first '{' after start_index
    brace_start = text.find('{', start_index)
    if brace_start == -1:
        return start_index, start_index

    i = brace_start
    depth = 0
    in_str = None
    in_line_comment = False
    in_block_comment = False
    escape = False

    while i < len(text):
        ch = text[i]
        nxt = text[i+1] if i+1 < len(text) else ''

        # handle comments
        if in_line_comment:
            if ch == '\n':
                in_line_comment = False
            i += 1
            continue
        if in_block_comment:
            if ch == '*' and nxt == '/':
                in_block_comment = False
                i += 2
                continue
            i += 1
            continue

        # handle strings
        if in_str:
            if escape:
                escape = False
            elif ch == '\\':
                escape = True
            elif ch == in_str:
                in_str = None
            i += 1
            continue

        # start comments
        if ch == '/' and nxt == '/':
            in_line_comment = True
            i += 2
            continue
        if ch == '/' and nxt == '*':
            in_block_comment = True
            i += 2
            continue

        # start strings
        if ch in ('"', "'", '`'):
            in_str = ch
            i += 1
            continue

        # braces
        if ch == '{':
            depth += 1
        elif ch == '}':
            depth -= 1
            if depth == 0:
                return start_index, i + 1
        i += 1

    return start_index, len(text)

def sha1(s: str) -> str:
    return hashlib.sha1(s.encode('utf-8', errors='ignore')).hexdigest()

def normalize_body(s: str) -> str:
    # remove whitespace-only differences to reduce noise
    s = re.sub(r'\s+', ' ', s).strip()
    return s

def extract_methods(text: str) -> Dict[str, Dict]:
    methods: Dict[str, Dict] = {}

    # 1) function declarations (global)
    for m in RE_FUNC_DECL.finditer(text):
        name = m.group(2)
        start = m.start(0) + (1 if m.group(1) == '\n' else 0)
        b0, b1 = find_block(text, start)
        body = text[b0:b1]
        key = f"function:{name}"
        methods[key] = {
            "kind": "function",
            "name": name,
            "sig": f"function {name}(...)",
            "hash": sha1(normalize_body(body)),
        }

    # 2) prototype methods
    for m in RE_PROTO_FUNC.finditer(text):
        cls, meth = m.group(2), m.group(3)
        start = m.start(0) + (1 if m.group(1) == '\n' else 0)
        b0, b1 = find_block(text, start)
        body = text[b0:b1]
        key = f"proto:{cls}.{meth}"
        methods[key] = {
            "kind": "prototype",
            "class": cls,
            "name": meth,
            "sig": f"{cls}.prototype.{meth} = function(...)",
            "hash": sha1(normalize_body(body)),
        }

    # 3) assignment funcs (e.g. Graphics.foo = function(){})
    for m in RE_ASSIGN_FUNC.finditer(text):
        obj, meth = m.group(2), m.group(3)
        start = m.start(0) + (1 if m.group(1) == '\n' else 0)
        b0, b1 = find_block(text, start)
        body = text[b0:b1]
        key = f"assign:{obj}.{meth}"
        methods[key] = {
            "kind": "assign",
            "object": obj,
            "name": meth,
            "sig": f"{obj}.{meth} = function(...)",
            "hash": sha1(normalize_body(body)),
        }

    # 4) ES6 class methods (best-effort)
    # Find each class block, then scan for methods inside it.
    for cm in RE_CLASS_DECL.finditer(text):
        class_name = cm.group(2)
        class_start = cm.start(0) + (1 if cm.group(1) == '\n' else 0)
        b0, b1 = find_block(text, class_start)
        class_block = text[b0:b1]

        # strip outer "class ... { ... }" to scan method bodies
        # We’ll scan methods and take their blocks.
        for mm in RE_CLASS_METHOD.finditer(class_block):
            meth = mm.group(2)
            # crude skip for "get x()" / "set x()" etc; also avoid parsing "static" wrong
            if meth in CLASS_METHOD_BLACKLIST:
                continue
            # exclude common control words that appear at start of lines
            if meth in ("if", "for", "while", "switch", "catch", "function", "return"):
                continue

            # locate method start in original text
            abs_start = b0 + mm.start(0)
            mb0, mb1 = find_block(text, abs_start)
            body = text[mb0:mb1]
            key = f"class:{class_name}.{meth}"
            methods[key] = {
                "kind": "class",
                "class": class_name,
                "name": meth,
                "sig": f"class {class_name} {{ {meth}(...) {{...}} }}",
                "hash": sha1(normalize_body(body)),
            }

    return methods

def diff_methods(a: Dict[str, Dict], b: Dict[str, Dict]) -> Dict[str, List]:
    a_keys = set(a.keys())
    b_keys = set(b.keys())
    added = sorted(list(b_keys - a_keys))
    removed = sorted(list(a_keys - b_keys))
    changed = sorted([k for k in (a_keys & b_keys) if a[k]["hash"] != b[k]["hash"]])
    unchanged = sorted([k for k in (a_keys & b_keys) if a[k]["hash"] == b[k]["hash"]])
    return {
        "added": added,
        "removed": removed,
        "changed": changed,
        "unchanged": unchanged,
    }

def file_pair_map(mv_dir: Path, mz_dir: Path) -> List[Tuple[Path, Path, str]]:
    # Map MV -> MZ names
    mapping = [
        ("rpg_core.js", "rmmz_core.js", "core"),
        ("rpg_managers.js", "rmmz_managers.js", "managers"),
        ("rpg_objects.js", "rmmz_objects.js", "objects"),
        ("rpg_scenes.js", "rmmz_scenes.js", "scenes"),
        ("rpg_sprites.js", "rmmz_sprites.js", "sprites"),
        ("rpg_windows.js", "rmmz_windows.js", "windows"),
    ]
    pairs = []
    for mv_name, mz_name, tag in mapping:
        mv_path = mv_dir / mv_name
        mz_path = mz_dir / mz_name
        pairs.append((mv_path, mz_path, tag))
    return pairs

def main():
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--mv", default="mv", help="path to MV js folder (contains rpg_*.js)")
    ap.add_argument("--mz", default="mz", help="path to MZ js folder (contains rmmz_*.js)")
    ap.add_argument("--out", default="diff_reports", help="output folder")
    args = ap.parse_args()

    mv_dir = Path(args.mv)
    mz_dir = Path(args.mz)
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    summary = {}

    for mv_path, mz_path, tag in file_pair_map(mv_dir, mz_dir):
        if not mv_path.exists():
            print(f"[warn] missing MV file: {mv_path}")
            continue
        if not mz_path.exists():
            print(f"[warn] missing MZ file: {mz_path}")
            continue

        mv_text = mv_path.read_text(encoding="utf-8", errors="ignore")
        mz_text = mz_path.read_text(encoding="utf-8", errors="ignore")

        mv_methods = extract_methods(mv_text)
        mz_methods = extract_methods(mz_text)
        d = diff_methods(mv_methods, mz_methods)

        # LLM-friendly payload: include signatures + hashes for changed/added
        patch = {
            "pair": {
                "mv": str(mv_path),
                "mz": str(mz_path),
                "tag": tag,
            },
            "counts": {k: len(v) for k, v in d.items()},
            "added": [{ "key": k, **mz_methods[k]} for k in d["added"]],
            "removed": [{ "key": k, **mv_methods[k]} for k in d["removed"]],
            "changed": [{
                "key": k,
                "mv": mv_methods[k],
                "mz": mz_methods[k],
            } for k in d["changed"]],
        }

        json_path = out_dir / f"{tag}_patch.json"
        json_path.write_text(json.dumps(patch, indent=2), encoding="utf-8")

        # Markdown “brief” for humans/LLMs
        md_lines = []
        md_lines.append(f"# {tag}: {mv_path.name} ↔ {mz_path.name}\n")
        md_lines.append(f"- Added in MZ: **{len(d['added'])}**")
        md_lines.append(f"- Removed from MV: **{len(d['removed'])}**")
        md_lines.append(f"- Changed: **{len(d['changed'])}**\n")

        LIM = 20000

        if d["added"]:
            md_lines.append("## Added in MZ\n")
            for k in d["added"][:LIM]:
                md_lines.append(f"- `{k}` — {mz_methods[k]['sig']}")
            if len(d["added"]) > LIM:
                md_lines.append(f"- … (+{len(d['added'])-LIM} more)")
            md_lines.append("")

        if d["removed"]:
            md_lines.append("## Removed from MV\n")
            for k in d["removed"][:LIM]:
                md_lines.append(f"- `{k}` — {mv_methods[k]['sig']}")
            if len(d["removed"]) > LIM:
                md_lines.append(f"- … (+{len(d['removed'])-LIM} more)")
            md_lines.append("")

        if d["changed"]:
            md_lines.append("## Changed\n")
            for k in d["changed"][:LIM]:
                md_lines.append(f"- `{k}`")
            if len(d["changed"]) > LIM:
                md_lines.append(f"- … (+{len(d['changed'])-LIM} more)")
            md_lines.append("")

        md_path = out_dir / f"{tag}_patch.md"
        md_path.write_text("\n".join(md_lines), encoding="utf-8")

        summary[tag] = patch["counts"]
        print(f"[ok] {tag}: wrote {json_path} and {md_path}")

    (out_dir / "summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(f"[ok] wrote {out_dir / 'summary.json'}")

if __name__ == "__main__":
    main()
