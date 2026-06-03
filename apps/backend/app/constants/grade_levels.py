"""Grade level constants for Catalan school system."""
from __future__ import annotations

GRADE_LEVELS: list[dict[str, str | int]] = [
    {"key": "I3", "label": "I3 (Infantil 3 anys)", "order": 1, "stage": "infantil"},
    {"key": "I4", "label": "I4 (Infantil 4 anys)", "order": 2, "stage": "infantil"},
    {"key": "I5", "label": "I5 (Infantil 5 anys)", "order": 3, "stage": "infantil"},
    {"key": "1P", "label": "1r Primària", "order": 4, "stage": "primaria"},
    {"key": "2P", "label": "2n Primària", "order": 5, "stage": "primaria"},
    {"key": "3P", "label": "3r Primària", "order": 6, "stage": "primaria"},
    {"key": "4P", "label": "4t Primària", "order": 7, "stage": "primaria"},
    {"key": "5P", "label": "5è Primària", "order": 8, "stage": "primaria"},
    {"key": "6P", "label": "6è Primària", "order": 9, "stage": "primaria"},
    {"key": "1E", "label": "1r ESO", "order": 10, "stage": "eso"},
    {"key": "2E", "label": "2n ESO", "order": 11, "stage": "eso"},
    {"key": "3E", "label": "3r ESO", "order": 12, "stage": "eso"},
    {"key": "4E", "label": "4t ESO", "order": 13, "stage": "eso"},
    {"key": "1B", "label": "1r Batxillerat", "order": 14, "stage": "batxillerat"},
    {"key": "2B", "label": "2n Batxillerat", "order": 15, "stage": "batxillerat"},
]

GRADE_PROGRESSION: dict[str, str | None] = {
    "I3": "I4",
    "I4": "I5",
    "I5": "1P",
    "1P": "2P",
    "2P": "3P",
    "3P": "4P",
    "4P": "5P",
    "5P": "6P",
    "6P": "1E",
    "1E": "2E",
    "2E": "3E",
    "3E": "4E",
    "4E": "1B",
    "1B": "2B",
    "2B": None,
}

_VALID_KEYS = {g["key"] for g in GRADE_LEVELS}
_LABEL_BY_KEY = {g["key"]: g["label"] for g in GRADE_LEVELS}


def label_for_key(key: str) -> str | None:
    return _LABEL_BY_KEY.get(key)


def next_grade(key: str) -> str | None:
    return GRADE_PROGRESSION.get(key)


def is_valid_grade_key(key: str) -> bool:
    return key in _VALID_KEYS
