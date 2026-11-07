"""Release notes: CHANGELOG entry and automatic restart hint (scripts/release_notes.py)."""
import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
_spec = importlib.util.spec_from_file_location("release_notes", ROOT / "scripts" / "release_notes.py")
rn = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(rn)

I = "custom_components/haushaltsbuch/"


def test_current_version_has_changelog_entry():
    version = json.loads((ROOT / I / "manifest.json").read_text())["version"]
    assert rn.changelog_section(version), f"CHANGELOG.md needs a section '## {version}'"


def test_changelog_section():
    text = "# Changelog\n\n## 1.1.0 – heute\n- neu\n\n## 1.0.0\n- alt\n"
    assert rn.changelog_section("1.1.0", text) == "- neu"
    assert rn.changelog_section("1.0.0", text) == "- alt"
    assert rn.changelog_section("1.0", text) is None


def test_previous_tag():
    tags = ["v0.9.1", "v0.9.2", "v0.10.0rc1", "v0.10.0rc2", "v0.10.0rc10"]
    assert rn.previous_tag("0.10.0rc3", tags) == "v0.10.0rc2"
    assert rn.previous_tag("0.10.0rc11", tags) == "v0.10.0rc10"
    # A normal release compares with the last normal release.
    assert rn.previous_tag("0.10.0", tags) == "v0.9.2"
    assert rn.previous_tag("0.9.0", tags) is None


def test_panel_only_needs_no_restart():
    changed = {
        I + "frontend/view-items.js": ["+x"],
        I + "manifest.json": ['-  "version": "1"', '+  "version": "2"'],
        I + "const.py": ['-VERSION = "0.10.0rc8"', '+VERSION = "0.10.0rc9"'],
        "tests/browser/smoke.mjs": ["+y"],
    }
    assert rn.needs_restart(changed) == []
    assert "Kein Neustart" in rn.restart_hint("0.10.0rc9", ["v0.10.0rc8"], changed)


def test_python_or_translations_need_restart():
    changed = {
        I + "const.py": ['+VERSION = "2"', '+CATEGORIES = ["Haus"]'],
        I + "translations/de.json": ["+z"],
        I + "frontend/x.js": ["+x"],
    }
    assert rn.needs_restart(changed) == [I + "const.py", I + "translations/de.json"]
    assert "neu starten" in rn.restart_hint("0.10.0rc9", ["v0.10.0rc8"], changed)


def test_without_previous_release_always_restart():
    assert "neu starten" in rn.restart_hint("0.1.0", [], None)
