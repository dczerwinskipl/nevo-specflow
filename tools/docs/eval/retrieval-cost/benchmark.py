"""Measure real docs CLI payloads in clean historical checkouts (no ranking changes)."""

import argparse
import hashlib
import importlib.metadata
import json
import re
import shlex
import subprocess
from pathlib import Path

import tiktoken


HERE = Path(__file__).resolve().parent
ENCODING = tiktoken.get_encoding("cl100k_base")


def command(root, *args):
    result = subprocess.run(args, cwd=root, capture_output=True, check=True, timeout=120)
    if result.stderr:
        raise ValueError(result.stderr.decode("utf-8"))
    return result.stdout.decode("utf-8").replace("\r\n", "\n")


def digest(text):
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def measure(text):
    return {
        "bytes": len(text.encode("utf-8")),
        "tokens": len(ENCODING.encode(text, disallowed_special=())),
        "sha256": digest(text),
    }


def normalize(text):
    return re.sub(r"\s+", " ", text).casefold()


def coverage(documents, invariants):
    """Evidence anchors are a reproducible checklist, not a semantic correctness oracle."""
    result = []
    for invariant in invariants:
        evidence = []
        for phrase in invariant["all"]:
            for document in documents:
                text = normalize(document["content"])
                start = text.find(normalize(phrase))
                if start >= 0:
                    evidence.append({
                        "phrase": phrase,
                        "ref": reference(document),
                        "excerpt": text[max(0, start - 100):start + len(phrase) + 160],
                    })
                    break
        result.append({
            "id": invariant["id"],
            "covered": len(evidence) == len(invariant["all"]),
            "evidence": evidence,
            "missing": [p for p in invariant["all"] if p not in [e["phrase"] for e in evidence]],
        })
    return result


def reference(document):
    section = document.get("section")
    return document["id"] + ("#" + section["sectionId"] if section else "")


def fetch(root, refs):
    if not refs:
        return {"refs": [], "bytes": 0, "tokens": 0, "documents": []}, []
    args = ["get", "--content", *refs]
    text = command(root, "node", "tools/docs/dist/bin.js", *args)
    payload = json.loads(command(root, "node", "tools/docs/dist/bin.js", *args, "--json"))
    if payload["skipped"]:
        raise ValueError(payload["skipped"])
    documents = payload["documents"]
    return {
        "args": args,
        "refs": refs,
        **measure(text),
        "documents": [
            {"ref": reference(d), "file": d["file"], **measure(d["content"])}
            for d in documents
        ],
    }, documents


def run(root, label, fixture):
    root = root.resolve()
    if command(root, "git", "status", "--porcelain", "--untracked-files=all"):
        raise ValueError(f"{label}: use a clean worktree, including untracked files")
    if (root / ".nevo/local/config.yaml").exists():
        raise ValueError(f"{label}: local configuration must be absent")
    if (root / ".nevo/local/cache/docs-index").exists():
        raise ValueError(f"{label}: embedding index must be absent")
    config = (root / ".nevo/config.yaml").read_text(encoding="utf-8")
    taxonomy = (root / "docs/docs.yaml").read_text(encoding="utf-8")
    commit = command(root, "git", "rev-parse", "HEAD").strip()
    rows = []
    for question in fixture["questions"]:
        args = ["search", question["question"], "--limit", "10", "--no-refresh"]
        search = json.loads(command(root, "node", "tools/docs/dist/bin.js", *args, "--json"))
        if search["mode"] != "lexical" or search["reason"]["code"] != "no-endpoint":
            raise ValueError(f"{label}: expected lexical/no-endpoint, got {search}")
        if search["skipped"]:
            raise ValueError(search["skipped"])
        search_text = command(root, "node", "tools/docs/dist/bin.js", *args)
        # Consume the CLI's own reference selection; never reimplement its section policy.
        refs = []
        if search["results"]:
            read_all = next(line for line in search_text.splitlines() if line.startswith("read all: "))
            refs = shlex.split(read_all.split(" --content ", 1)[1])
        initial, initial_docs = fetch(root, refs)
        owners = question["owners"]["baseline" if label == "baseline" else "after"]
        extra_refs = [owner for owner in owners if owner not in refs]
        supplemental, supplemental_docs = fetch(root, extra_refs)
        all_docs = initial_docs + supplemental_docs
        owner_docs = [d for d in all_docs if d["id"] in owners]
        initial_coverage = coverage(initial_docs, question["invariants"])
        owner_coverage = coverage(owner_docs, question["invariants"])
        all_refs = refs + extra_refs
        rows.append({
            "id": question["id"],
            "question": question["question"],
            "searchArgs": args,
            "search": search,
            "searchText": measure(search_text),
            "owners": owners,
            "top1Owner": bool(search["results"]) and search["results"][0]["id"] in owners,
            "ownersInTop10": [h["id"] for h in search["results"] if h["id"] in owners],
            "unexpectedDocuments": [h["id"] for h in search["results"] if h["id"] not in owners],
            "returnedSections": sum(len(h["sections"]) for h in search["results"]),
            "readAll": initial,
            "supplementalOwners": supplemental,
            "uniqueDocumentsRead": len({d["id"] for d in all_docs}),
            "wholeReads": sum("#" not in ref for ref in all_refs),
            "sectionReads": sum("#" in ref for ref in all_refs),
            "repeatedDocumentReads": len(all_refs) - len({d["id"] for d in all_docs}),
            "duplicatePayloads": len(all_docs) - len({digest(d["content"]) for d in all_docs}),
            "readAllCoverage": initial_coverage,
            "ownerCoverage": owner_coverage,
            "totalBytes": initial["bytes"] + supplemental["bytes"],
            "totalTokens": initial["tokens"] + supplemental["tokens"],
        })
    if command(root, "git", "status", "--porcelain", "--untracked-files=all") or command(root, "git", "rev-parse", "HEAD").strip() != commit:
        raise ValueError(f"{label}: checkout changed during measurement")
    return {
        "label": label,
        "commit": commit,
        "trees": {
            path: command(root, "git", "rev-parse", f"HEAD:{path}").strip()
            for path in ["docs", "packages/specflow-docs", "packages/ai-semantic-search", "tools/docs/src"]
        },
        "node": command(root, "node", "--version").strip(),
        "configuration": {"project": config, "taxonomy": taxonomy, "local": "absent", "index": "absent"},
        "results": rows,
    }


def markdown(report):
    lines = [
        "# Documentation retrieval cost — lexical comparison", "",
        "Generated by `benchmark.py`. UTF-8/LF text CLI payloads; cl100k_base estimated tokens.",
        "Coverage is the evidence-anchor checklist (5 invariants per question), subject to semantic review.",
        "`Unexpected` means outside the declared authoritative owners, not necessarily irrelevant.",
        "Read cost includes delimiters and repeated/overlapping reads; search output is recorded separately in JSON.", "",
        "| Snapshot | Question | Top-1 owner | Sections | Read docs / full / sections | Unexpected | Read-all bytes / tokens | + owners bytes / tokens | Coverage read-all → owners |",
        "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ]
    for snapshot in report["snapshots"]:
        for row in snapshot["results"]:
            initial = row["readAll"]
            extra = row["supplementalOwners"]
            before = sum(c["covered"] for c in row["readAllCoverage"])
            after = sum(c["covered"] for c in row["ownerCoverage"])
            lines.append(
                f"| {snapshot['label']} | {row['id']} | {'yes' if row['top1Owner'] else 'no'} "
                f"| {row['returnedSections']} | {row['uniqueDocumentsRead']} / {row['wholeReads']} / {row['sectionReads']} "
                f"| {len(row['unexpectedDocuments'])} | {initial['bytes']:,} / {initial['tokens']:,} "
                f"| {extra['bytes']:,} / {extra['tokens']:,} | {before}/5 → {after}/5 |"
            )
    lines += ["", "## Aggregate", "", "| Snapshot | Read-all bytes / tokens | With owners bytes / tokens | Top-1 | Coverage read-all / owners |", "| --- | --- | --- | --- | --- |"]
    for snapshot in report["snapshots"]:
        rows = snapshot["results"]
        initial_bytes = sum(r["readAll"]["bytes"] for r in rows)
        initial_tokens = sum(r["readAll"]["tokens"] for r in rows)
        all_bytes = sum(r["totalBytes"] for r in rows)
        all_tokens = sum(r["totalTokens"] for r in rows)
        top1 = sum(r["top1Owner"] for r in rows)
        before = sum(c["covered"] for r in rows for c in r["readAllCoverage"])
        after = sum(c["covered"] for r in rows for c in r["ownerCoverage"])
        lines.append(f"| {snapshot['label']} | {initial_bytes:,} / {initial_tokens:,} | {all_bytes:,} / {all_tokens:,} | {top1}/5 | {before}/25 / {after}/25 |")
    lines += ["", "## Snapshots", ""]
    lines += [f"- {s['label']}: `{s['commit']}`" for s in report["snapshots"]]
    return "\n".join(lines) + "\n"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--checkout", action="append", required=True, help="label=clean-worktree; baseline is the pre-refactor snapshot")
    parser.add_argument("--output", type=Path, required=True, help="output file prefix (outside measured worktrees)")
    args = parser.parse_args()
    fixture_text = (HERE / "questions.json").read_text(encoding="utf-8")
    fixture = json.loads(fixture_text)
    checkouts = [entry.split("=", 1) for entry in args.checkout]
    labels = [label for label, _ in checkouts]
    if len(labels) != len(set(labels)) or "baseline" not in labels:
        parser.error("use unique labels, including baseline")
    for _, path in checkouts:
        if args.output.resolve().is_relative_to(Path(path).resolve()):
            parser.error("output must be outside measured worktrees")
    if importlib.metadata.version("tiktoken") != "0.12.0":
        parser.error("install requirements.txt: measurement pins tiktoken==0.12.0")
    report = {
        "schemaVersion": 1,
        "tokenizer": "tiktoken==0.12.0 / cl100k_base (estimated model tokens)",
        "normalization": "UTF-8, CRLF normalized to LF; text CLI stdout including delimiters and final newline",
        "fixtureSha256": digest(fixture_text),
        "snapshots": [run(Path(path), label, fixture) for label, path in checkouts],
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    Path(str(args.output) + ".generated.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
    Path(str(args.output) + ".generated.md").write_text(markdown(report), encoding="utf-8", newline="\n")


if __name__ == "__main__":
    main()
