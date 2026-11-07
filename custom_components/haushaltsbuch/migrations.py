"""Upgrades of the stored data when its layout changes.

Both files in /config/.storage carry a version (major.minor):

* ``haushaltsbuch.data`` – the book (items, households, users)
* ``haushaltsbuch.ledger`` – the imported bank transactions

Rules for a layout change:

* Only something added that older versions can ignore → raise the *minor*
  version. An older Haushaltsbuch still opens the file (useful when someone
  goes back to the previous release).
* Something renamed, moved or removed → raise the *major* version. An older
  Haushaltsbuch then refuses to open the file instead of misreading it.

Every change gets one step below, from the old version to the next one, and a
test in tests/test_migrations.py with a file in the old layout. Steps never
call into store.py, so they keep working when the code there changes later.
Backups carry the versions too and go through the same steps when restored.
"""
from __future__ import annotations

import copy
from collections.abc import Callable
from typing import Any

Version = tuple[int, int]
Step = Callable[[dict[str, Any]], dict[str, Any]]

BOOK_VERSION: Version = (1, 2)
LEDGER_VERSION: Version = (1, 1)

# Files written before versions were kept (up to 0.10.0rc7) are 1.1.
UNVERSIONED: Version = (1, 1)


class NewerDataError(Exception):
    """The data was written by a newer Haushaltsbuch with an incompatible layout."""

    def __init__(self, what: str, found: Version, supported: Version) -> None:
        super().__init__(
            f"{what} {found[0]}.{found[1]} was written by a newer Haushaltsbuch "
            f"(this version reads up to {supported[0]}.x). Please update the integration."
        )
        self.what = what
        self.found = found
        self.supported = supported


# ------------------------------------------------------------------- book
def _book_1_1_to_1_2(data: dict[str, Any]) -> dict[str, Any]:
    """Starting point of the versioned layout.

    Up to 0.10.0rc4 missing parts were filled in on every start. From now on
    the file itself is complete: the three sections exist and every user has
    balance fields. Nothing that was stored before changes.
    """
    for key in ("users", "items", "households"):
        if not isinstance(data.get(key), dict):
            data[key] = {}
    for user in data["users"].values():
        user.setdefault("balance", None)
        user.setdefault("balance_date", None)
    return data


BOOK_STEPS: dict[Version, tuple[Version, Step]] = {
    (1, 1): ((1, 2), _book_1_1_to_1_2),
}

# ----------------------------------------------------------------- ledger
LEDGER_STEPS: dict[Version, tuple[Version, Step]] = {}


# ------------------------------------------------------------------ runner
def _migrate(what: str, steps: dict, current: Version, found: Version, data: Any) -> dict[str, Any]:
    found = (int(found[0]), int(found[1] or 1))
    if found[0] > current[0]:
        raise NewerDataError(what, found, current)
    data = copy.deepcopy(data) if isinstance(data, dict) else {}
    version = found
    while version < current:
        if version not in steps:
            raise ValueError(f"No upgrade for {what} {version[0]}.{version[1]}")
        version, step = steps[version]
        data = step(data)
    return data


def migrate_book(found: Version, data: Any) -> dict[str, Any]:
    """The book in the current layout. A newer minor version is left as it is."""
    return _migrate("haushaltsbuch.data", BOOK_STEPS, BOOK_VERSION, found, data)


def migrate_ledger(found: Version, data: Any) -> dict[str, Any]:
    """The ledger in the current layout. A newer minor version is left as it is."""
    return _migrate("haushaltsbuch.ledger", LEDGER_STEPS, LEDGER_VERSION, found, data)


def version_of(value: Any, default: Version = UNVERSIONED) -> Version:
    """A version stored as [major, minor] in a backup; old backups have none."""
    try:
        major, minor = value
        return (int(major), int(minor))
    except (TypeError, ValueError):
        return default
