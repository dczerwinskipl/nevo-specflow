"""Fast measurement-policy checks; no repository corpus or embedding service."""

import unittest
import json
import tempfile
from pathlib import Path
from unittest.mock import patch

import benchmark
from benchmark import coverage, measure, reference


class MeasurementTests(unittest.TestCase):
    def test_utf8_bytes_and_tokenizer_are_not_character_counts(self):
        self.assertEqual(measure("ł")['bytes'], 2)
        self.assertEqual(measure("hello world")['tokens'], 2)

    def test_checklist_requires_every_anchor(self):
        invariants = [{"id": "safe-resume", "all": ["confirm stopped", "verify bytes"]}]
        documents = [{"id": "owner", "content": "CONFIRM\n stopped before resuming."}]
        result = coverage(documents, invariants)[0]
        self.assertFalse(result["covered"])
        self.assertEqual(result["missing"], ["verify bytes"])
        self.assertEqual(result["evidence"][0]["ref"], "owner")

    def test_cross_document_evidence_keeps_section_provenance(self):
        documents = [
            {"id": "operator", "content": "confirm stopped"},
            {"id": "contract", "content": "verify bytes", "section": {"sectionId": "recovery"}},
        ]
        result = coverage(documents, [{"id": "safe", "all": ["confirm stopped", "verify bytes"]}])[0]
        self.assertTrue(result["covered"])
        self.assertEqual(result["evidence"][1]["ref"], "contract#recovery")
        self.assertEqual(reference(documents[0]), "operator")


class BenchmarkFlowTests(unittest.TestCase):
    """Exercise orchestration and output; replace only the external command boundary."""

    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.directory = Path(temporary.name)
        self.checkout = self.directory / "checkout"
        (self.checkout / ".nevo").mkdir(parents=True)
        (self.checkout / ".nevo/config.yaml").write_text("docs: {}\n", encoding="utf-8")
        (self.checkout / "docs").mkdir()
        (self.checkout / "docs/docs.yaml").write_text("{}\n", encoding="utf-8")
        self.output = self.directory / "report"
        self.fixture = json.loads((benchmark.HERE / "questions.json").read_text(encoding="utf-8"))
        self.owner_content = "\n".join(
            phrase for q in self.fixture["questions"] for c in q["invariants"] for phrase in c["all"]
        )
        self.empty = False
        self.missing_read_all = False
        self.calls = []

    def command(self, root, *args):
        self.assertEqual(root, self.checkout.resolve())
        self.calls.append(args)
        if args[0] == "git":
            return "" if args[1] == "status" else "snapshot\n"
        self.assertEqual(args[0], "node")
        if args[1] == "--version":
            return "v24.20.0\n"
        self.assertEqual(args[1], "tools/docs/dist/bin.js")
        if args[2] == "search":
            if "--json" in args:
                return json.dumps({
                    "mode": "lexical", "reason": {"code": "no-endpoint"}, "skipped": [],
                    "results": [] if self.empty else [{"id": "reader", "sections": [
                        {"sectionId": "safety"}, {"sectionId": "resume"},
                    ]}],
                })
            if self.empty:
                return 'mode: lexical (no-endpoint)\n(no documents match)\n'
            if self.missing_read_all:
                return "mode: lexical (no-endpoint)\nreader\n"
            return "mode: lexical (no-endpoint)\nread all: pnpm docs:get --content 'reader#safety' reader#resume\n"
        self.assertEqual(args[2:4], ("get", "--content"))
        refs = [arg for arg in args[4:] if arg != "--json"]
        self.assertTrue(refs, "empty discovery must not invoke a bare get")
        initial = refs[0].startswith("reader#")
        if "--json" not in args:
            return "INITIAL\n" if initial else "OWNERS\n"
        documents = []
        for ref in refs:
            doc_id, separator, section = ref.partition("#")
            document = {
                "id": doc_id, "file": f"docs/{doc_id}.md",
                "content": "unrelated text" if initial else self.owner_content,
            }
            if separator:
                document["section"] = {"sectionId": section}
            documents.append(document)
        return json.dumps({"documents": documents, "skipped": []})

    def run_benchmark(self):
        argv = ["benchmark.py", "--checkout", f"baseline={self.checkout}",
                "--checkout", f"after={self.checkout}", "--output", str(self.output)]
        with patch("benchmark.command", side_effect=self.command), patch("sys.argv", argv):
            benchmark.main()
        report = json.loads(Path(str(self.output) + ".generated.json").read_text(encoding="utf-8"))
        markdown = Path(str(self.output) + ".generated.md").read_text(encoding="utf-8")
        return report, markdown

    def test_search_get_coverage_and_files(self):
        report, markdown = self.run_benchmark()
        for snapshot in report["snapshots"]:
            self.assertEqual(len(snapshot["results"]), 5)
            for row in snapshot["results"]:
                self.assertEqual(row["readAll"]["refs"], ["reader#safety", "reader#resume"])
                self.assertEqual(row["supplementalOwners"]["refs"], row["owners"])
                self.assertEqual(row["sectionReads"], 2)
                self.assertEqual(row["repeatedDocumentReads"], 1)
                self.assertFalse(any(c["covered"] for c in row["readAllCoverage"]))
                self.assertTrue(all(c["covered"] for c in row["ownerCoverage"]))
                self.assertEqual(row["totalTokens"], measure("INITIAL\n")["tokens"] + measure("OWNERS\n")["tokens"])
        self.assertIn("| baseline | create | no |", markdown)
        self.assertIn("0/25 / 25/25", markdown)

    def test_empty_search_records_regression_and_keeps_owner_reads_separate(self):
        self.empty = True
        report, markdown = self.run_benchmark()
        for snapshot in report["snapshots"]:
            for row in snapshot["results"]:
                self.assertEqual(row["search"]["results"], [])
                self.assertFalse(row["top1Owner"])
                self.assertEqual(row["ownersInTop10"], [])
                self.assertEqual(row["returnedSections"], 0)
                self.assertEqual(row["readAll"]["refs"], [])
                self.assertEqual(row["readAll"]["bytes"], 0)
                self.assertEqual(row["readAll"]["tokens"], 0)
                self.assertFalse(any(c["covered"] for c in row["readAllCoverage"]))
                self.assertTrue(all(c["covered"] for c in row["ownerCoverage"]))
                self.assertEqual(row["supplementalOwners"]["refs"], row["owners"])
                self.assertEqual(row["totalTokens"], measure("OWNERS\n")["tokens"])
        self.assertIn("| baseline | create | no | 0 |", markdown)
        self.assertIn("0/25 / 25/25", markdown)

    def test_nonempty_search_without_read_all_is_not_silently_treated_as_empty(self):
        self.missing_read_all = True
        with self.assertRaises(StopIteration):
            self.run_benchmark()
        self.assertFalse(Path(str(self.output) + ".generated.json").exists())


if __name__ == "__main__":
    unittest.main()
