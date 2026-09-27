#!/usr/bin/env python3
"""Import and independently approve consented, seat-visible human trajectories."""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from contracts import ContractError  # noqa: E402
from human_trajectory import approve_human_review, build_human_review  # noqa: E402


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def load_json(path: Path) -> dict:
    with path.open(encoding="utf-8") as source:
        return json.load(source)


def write_new(path: Path, value: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        with path.open("x", encoding="utf-8") as target:
            json.dump(value, target, ensure_ascii=False, indent=2, sort_keys=True)
            target.write("\n")
    except FileExistsError as error:
        raise ContractError(f"{path}: already exists; refusing to overwrite") from error


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(description=__doc__)
    commands = result.add_subparsers(dest="command", required=True)
    import_command = commands.add_parser("import")
    import_command.add_argument("source", type=Path)
    import_command.add_argument("output", type=Path)
    import_command.add_argument("--imported-at", default=None)
    approve_command = commands.add_parser("approve")
    approve_command.add_argument("source", type=Path)
    approve_command.add_argument("output", type=Path)
    approve_command.add_argument("--reviewer", required=True)
    approve_command.add_argument("--reviewed-at", default=None)
    approve_command.add_argument("--attest-seat-visibility", action="store_true")
    approve_command.add_argument("--attest-action-legality", action="store_true")
    approve_command.add_argument("--attest-consent", action="store_true")
    return result


def main() -> int:
    arguments = parser().parse_args()
    if arguments.command == "import":
        result = build_human_review(
            load_json(arguments.source),
            imported_at=arguments.imported_at or utc_now(),
        )
    else:
        result = approve_human_review(
            load_json(arguments.source),
            reviewer=arguments.reviewer,
            reviewed_at=arguments.reviewed_at or utc_now(),
            attestations={
                "seatVisibilityVerified": arguments.attest_seat_visibility,
                "actionLegalityVerified": arguments.attest_action_legality,
                "consentVerified": arguments.attest_consent,
            },
        )
    write_new(arguments.output, result)
    print(json.dumps({
        "status": result["status"],
        "contentHash": result["contentHash"],
        "output": str(arguments.output),
    }, sort_keys=True))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (ContractError, json.JSONDecodeError, OSError) as error:
        print(f"human trajectory rejected: {error}", file=sys.stderr)
        raise SystemExit(2)
