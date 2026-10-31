"""Check committed bytes/hashes against the RFC-linked Python reference.

No downloads, DB, credentials or production configuration. Supply a separate
checkout of https://github.com/cyberphone/json-canonicalization at the pinned
commit in tests/fixtures/registry-jcs-vectors.json.
"""
import argparse
import hashlib
import importlib
import json
import math
from pathlib import Path
import struct
import subprocess
import sys


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--reference-root", required=True, type=Path)
    args = parser.parse_args()
    root = Path(__file__).resolve().parent.parent
    vectors = json.loads((root / "tests/fixtures/registry-jcs-vectors.json").read_text(encoding="utf-8"))
    reference = args.reference_root.resolve()
    commit = subprocess.check_output(["git", "-C", str(reference), "rev-parse", "HEAD"], text=True).strip()
    if commit != vectors["referenceCommit"]:
        raise ValueError("Python reference commit does not match pinned reference")
    tracked = subprocess.check_output(["git", "-C", str(reference), "status", "--porcelain", "--untracked-files=no"], text=True)
    if tracked.strip():
        raise ValueError("Python reference contains modified tracked files")
    sys.path.insert(0, str(reference / "python3/src"))
    canonicalize = importlib.import_module("org.webpki.json.Canonicalize").canonicalize
    count = 0
    for vector in vectors["vectors"]:
        # Parsing numbers as binary64 is the declared JCS data model.
        value = json.loads(vector["inputText"], parse_float=float, parse_int=float)
        actual = canonicalize(value)
        expected = vector["canonical"].encode("utf-8")
        if actual != expected or hashlib.sha256(actual).hexdigest() != vector["sha256"]:
            raise AssertionError("Cross-language bytes/hash mismatch: " + vector["id"])
        count += 1
    for vector in vectors["numbers"]:
        number = struct.unpack(">d", bytes.fromhex(vector["hex"]))[0]
        if vector["canonical"] is None:
            if math.isfinite(number):
                raise AssertionError("Invalid nonfinite fixture")
            try:
                canonicalize(number)
            except ValueError:
                pass
            else:
                raise AssertionError("Python reference accepted nonfinite number")
        elif canonicalize(number) != vector["canonical"].encode("utf-8"):
            raise AssertionError("Binary64 reference mismatch: " + vector["hex"])
        count += 1
    print(f"Python RFC-linked reference passed: {count} vectors; commit={commit}")


if __name__ == "__main__":
    main()
