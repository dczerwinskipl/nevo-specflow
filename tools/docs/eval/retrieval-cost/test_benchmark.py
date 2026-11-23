"""Fast measurement-policy checks; no repository corpus or embedding service."""

import unittest

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


if __name__ == "__main__":
    unittest.main()
