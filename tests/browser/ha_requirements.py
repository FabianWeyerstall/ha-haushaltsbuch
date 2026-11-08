"""Print the Python packages a Home Assistant with default_config needs.

pip install -r requirements_test.txt only brings the core. The frontend waits
for parts of default_config (conversation, camera, …), so their packages are
installed up front instead of letting Home Assistant fetch them at start.
"""
import json
from pathlib import Path

import homeassistant.components as components

ROOT = Path(components.__file__).parent
seen: set[str] = set()
requirements: set[str] = set()


def walk(domain: str) -> None:
    if domain in seen:
        return
    seen.add(domain)
    manifest = ROOT / domain / "manifest.json"
    if not manifest.is_file():
        return
    data = json.loads(manifest.read_text(encoding="utf-8"))
    requirements.update(data.get("requirements", []))
    for dep in data.get("dependencies", []) + data.get("after_dependencies", []):
        walk(dep)


walk("default_config")
print("\n".join(sorted(requirements)))
