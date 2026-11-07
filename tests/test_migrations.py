"""Older stored data loads without loss; newer data is refused instead of misread."""
import copy
import json
from pathlib import Path

import pytest
from homeassistant.config_entries import ConfigEntryState
from homeassistant.core import HomeAssistant
from homeassistant.setup import async_setup_component
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.haushaltsbuch import backups
from custom_components.haushaltsbuch.const import DOMAIN
from custom_components.haushaltsbuch.migrations import (
    BOOK_STEPS,
    BOOK_VERSION,
    LEDGER_STEPS,
    LEDGER_VERSION,
    UNVERSIONED,
    NewerDataError,
    migrate_book,
    migrate_ledger,
)
from custom_components.haushaltsbuch.store import Book

FIXTURES = Path(__file__).parent / "fixtures" / "storage"


def fixture(name: str) -> dict:
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


@pytest.mark.parametrize(("steps", "current"), [(BOOK_STEPS, BOOK_VERSION), (LEDGER_STEPS, LEDGER_VERSION)])
def test_every_old_version_reaches_the_current_one(steps, current):
    version = UNVERSIONED
    while version < current:
        assert version in steps, f"no step from {version}"
        version = steps[version][0]
    assert version == current
    for start, (target, _) in steps.items():
        assert start < target <= current


def test_rc4_book_is_kept_as_it_is():
    stored = fixture("haushaltsbuch.data-1.1-rc4.json")
    before = copy.deepcopy(stored["data"])
    upgraded = migrate_book((1, 1), stored["data"])
    assert upgraded == before
    assert stored["data"] == before, "the input must not be changed"
    Book(upgraded)  # loads


def test_first_version_book_is_completed():
    stored = fixture("haushaltsbuch.data-1.1-erste-version.json")
    upgraded = migrate_book((stored["version"], stored.get("minor_version", 1)), stored["data"])
    assert upgraded["households"] == {}
    assert upgraded["users"]["anna"] == {"balance": 500.0, "balance_date": None}
    assert upgraded["items"] == stored["data"]["items"]
    book = Book(upgraded)
    assert [i["name"] for i in book.visible_items("anna")] == ["Internet"]


def test_newer_versions():
    data = {"users": {}, "items": {}, "households": {}, "added_later": True}
    # a newer minor version only added things: read as it is
    assert migrate_book((BOOK_VERSION[0], BOOK_VERSION[1] + 1), data) == data
    with pytest.raises(NewerDataError):
        migrate_book((BOOK_VERSION[0] + 1, 1), data)
    with pytest.raises(NewerDataError):
        migrate_ledger((LEDGER_VERSION[0] + 1, 1), {"users": {}})


def test_backups_carry_versions_and_old_ones_still_restore():
    book = Book(migrate_book((1, 1), fixture("haushaltsbuch.data-1.1-rc4.json")["data"]))
    document = backups.make_document(book, backups.Ledger(), "manual")
    assert document["book_version"] == list(BOOK_VERSION)
    assert document["ledger_version"] == list(LEDGER_VERSION)
    # backups from 0.10.0rc7 and earlier have no version
    old = {"format": backups.BACKUP_FORMAT, "version": 1, "created": "2026-11-06T10:00:00+01:00", "reason": "manual",
           "book": fixture("haushaltsbuch.data-1.1-erste-version.json")["data"], "ledger": {"users": {}}}
    backups.check_document(old)
    upgraded_book, _ = backups.upgrade(old)
    assert upgraded_book["households"] == {}
    newer = {**document, "book_version": [BOOK_VERSION[0] + 1, 1]}
    with pytest.raises(backups.ValidationError, match="backup_newer"):
        backups.check_document(newer)


async def _setup(hass: HomeAssistant) -> MockConfigEntry:
    assert await async_setup_component(hass, "http", {})
    entry = MockConfigEntry(domain=DOMAIN, title="Haushaltsbuch")
    entry.add_to_hass(hass)
    await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    return entry


async def test_update_from_rc4_in_home_assistant(hass: HomeAssistant, hass_storage, tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(backups, "backup_dir", lambda hass: tmp_path)
    book = fixture("haushaltsbuch.data-1.1-rc4.json")
    ledger = fixture("haushaltsbuch.ledger-1.1-rc4.json")
    hass_storage["haushaltsbuch.data"] = copy.deepcopy(book)
    hass_storage["haushaltsbuch.ledger"] = copy.deepcopy(ledger)

    entry = await _setup(hass)
    assert entry.state is ConfigEntryState.LOADED
    data = entry.runtime_data
    assert data.book.data == book["data"]
    assert data.ledger.data == ledger["data"]
    # the file now carries the current version
    saved = hass_storage["haushaltsbuch.data"]
    assert (saved["version"], saved["minor_version"]) == BOOK_VERSION
    assert saved["data"] == book["data"]
    # and the state before the update is kept as a backup, with the ledger
    found = backups.listing(tmp_path)
    assert [b["reason"] for b in found] == ["before_update"]
    kept = backups.read(tmp_path, found[0]["id"])
    assert kept["book"] == book["data"] and kept["book_version"] == [1, 1]
    assert kept["ledger"] == ledger["data"]


async def test_current_files_load_without_backup(hass: HomeAssistant, hass_storage, tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(backups, "backup_dir", lambda hass: tmp_path)
    book = fixture("haushaltsbuch.data-1.1-rc4.json")
    hass_storage["haushaltsbuch.data"] = {**book, "version": BOOK_VERSION[0], "minor_version": BOOK_VERSION[1]}
    entry = await _setup(hass)
    assert entry.state is ConfigEntryState.LOADED
    assert backups.listing(tmp_path) == []


async def test_data_from_a_newer_version_is_refused(hass: HomeAssistant, hass_storage, tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(backups, "backup_dir", lambda hass: tmp_path)
    book = fixture("haushaltsbuch.data-1.1-rc4.json")
    hass_storage["haushaltsbuch.data"] = {**book, "version": BOOK_VERSION[0] + 1, "minor_version": 1}
    entry = await _setup(hass)
    assert entry.state is ConfigEntryState.SETUP_ERROR
    # nothing was overwritten
    assert hass_storage["haushaltsbuch.data"]["version"] == BOOK_VERSION[0] + 1
    assert hass_storage["haushaltsbuch.data"]["data"] == book["data"]
