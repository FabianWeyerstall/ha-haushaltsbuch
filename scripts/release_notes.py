"""Release notes for one version: the CHANGELOG.md section plus a restart hint.

Whether Home Assistant has to be restarted is not written by hand but read
from git: a restart is needed when Python code or translations changed since
the previous release. Panel files (frontend/), the icon (brand/) and the
version number alone only need a page reload.

    python scripts/release_notes.py 0.10.0rc9            # notes for the release
    python scripts/release_notes.py 0.10.0rc9 --check    # only: is there a CHANGELOG entry?
"""
from __future__ import annotations

import argparse
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CHANGELOG = ROOT / "CHANGELOG.md"
INTEGRATION = "custom_components/haushaltsbuch/"

# Changes here never need a restart.
NO_RESTART_PREFIXES = (INTEGRATION + "frontend/", INTEGRATION + "brand/")
NO_RESTART_FILES = {INTEGRATION + "manifest.json"}
VERSION_LINE = re.compile(r'^VERSION\s*=\s*"[^"]*"\s*$')

PRE_RELEASE = re.compile(r"(a|b|rc)\d+$")


# ------------------------------------------------------------------ changelog
def changelog_section(version: str, text: str | None = None) -> str | None:
    """The body under '## <version>' up to the next '## ' heading, or None."""
    text = CHANGELOG.read_text(encoding="utf-8") if text is None else text
    lines = text.splitlines()
    head = re.compile(rf"^##\s+v?{re.escape(version)}(\s|$)")
    for i, line in enumerate(lines):
        if head.match(line):
            body = []
            for rest in lines[i + 1:]:
                if rest.startswith("## "):
                    break
                body.append(rest)
            return "\n".join(body).strip()
    return None


# ------------------------------------------------------------------ versions
def version_key(tag: str) -> tuple:
    """Sort key for v0.10.0, v0.10.0rc9, v0.9.2 … (a < b < rc < final)."""
    m = re.match(r"^v?(\d+)\.(\d+)\.(\d+)(?:(a|b|rc)(\d+))?$", tag)
    if not m:
        return (-1,)
    major, minor, patch, pre, num = m.groups()
    stage = {"a": 0, "b": 1, "rc": 2, None: 3}[pre]
    return (int(major), int(minor), int(patch), stage, int(num or 0))


def is_pre_release(version: str) -> bool:
    return bool(PRE_RELEASE.search(version))


def previous_tag(version: str, tags: list[str]) -> str | None:
    """The release users update from.

    A beta compares with the release right before it (beta or not). A normal
    release compares with the last normal release, because people without
    "show beta versions" skip all betas.
    """
    current = version_key(version)
    older = [t for t in tags if version_key(t) != (-1,) and version_key(t) < current]
    if not is_pre_release(version):
        older = [t for t in older if not is_pre_release(t)]
    return max(older, key=version_key) if older else None


# ------------------------------------------------------------------ restart
def needs_restart(changed: dict[str, list[str]]) -> list[str]:
    """Files that need a restart. `changed` maps path → changed lines (+/-)."""
    reasons = []
    for path, lines in sorted(changed.items()):
        if not path.startswith(INTEGRATION):
            continue
        if path in NO_RESTART_FILES or path.startswith(NO_RESTART_PREFIXES):
            continue
        if path == INTEGRATION + "const.py" and lines and all(VERSION_LINE.match(l[1:]) for l in lines):
            continue
        reasons.append(path)
    return reasons


def git(*args: str) -> str:
    return subprocess.run(["git", *args], cwd=ROOT, check=True, capture_output=True, text=True).stdout


def changed_since(tag: str) -> dict[str, list[str]]:
    changed: dict[str, list[str]] = {}
    for path in git("diff", "--name-only", tag, "HEAD", "--", INTEGRATION).split():
        diff = git("diff", "-U0", tag, "HEAD", "--", path)
        changed[path] = [
            l for l in diff.splitlines()
            if l[:1] in "+-" and not l.startswith(("+++", "---"))
        ]
    return changed


def restart_hint(version: str, tags: list[str], changed: dict[str, list[str]] | None) -> str:
    before = previous_tag(version, tags)
    if before is None or changed is None:
        return "**Nach dem Update Home Assistant neu starten.**"
    files = needs_restart(changed)
    if files:
        names = ", ".join(f"`{f.removeprefix(INTEGRATION)}`" for f in files[:5])
        more = " …" if len(files) > 5 else ""
        return f"**Nach dem Update Home Assistant neu starten** (geändert seit {before}: {names}{more})."
    return (
        f"**Kein Neustart nötig** (seit {before} hat sich nur das Panel geändert): "
        "nach dem Update die Haushaltsbuch-Seite neu laden. "
        "HACS schlägt trotzdem einen Neustart vor, der schadet nicht."
    )


# ------------------------------------------------------------------ main
def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("version")
    parser.add_argument("--check", action="store_true", help="only check the CHANGELOG entry")
    args = parser.parse_args()

    section = changelog_section(args.version)
    if not section:
        print(f"CHANGELOG.md has no entry '## {args.version}'", file=sys.stderr)
        return 1
    if args.check:
        print(f"CHANGELOG.md: entry for {args.version} found")
        return 0

    tags = git("tag", "--list", "v*").split()
    before = previous_tag(args.version, tags)
    changed = changed_since(before) if before else None
    print(restart_hint(args.version, tags, changed))
    print()
    print(section)
    return 0


if __name__ == "__main__":
    sys.exit(main())
