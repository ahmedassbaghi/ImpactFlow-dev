"""Canonical periodic assessment selection (dedupe per date)."""

from datetime import date

from app.models import PeriodicAssessment
from app.utils.participant_metrics import (
    latest_periodic_by_participant,
    pick_best_periodic,
    resolve_periodic_timeline,
)


def _pa(
    *,
    pid: str = "p1",
    d: date,
    ipi: float,
    label: str,
    reading: int = 3,
    math: int | None = None,
) -> PeriodicAssessment:
    return PeriodicAssessment(
        id=f"{label}-{d.isoformat()}",
        participant_id=pid,
        program_id="prog",
        assessed_by="u1",
        assessment_date=d,
        period_label=label,
        reading_level=reading,
        math_level=math if math is not None else reading,
        comprehension_level=reading,
        attention_level=reading,
        memory_level=reading,
        autonomy_level=reading,
        peer_interaction=reading,
        group_work=reading,
        emotional_regulation=reading,
        language_fluency=reading,
        cultural_adaptation=reading,
        ipi_score=ipi,
    )


def test_pick_best_prefers_trimestral_over_session_auto():
    d = date(2026, 2, 20)
    low = _pa(d=d, ipi=22.0, label="session_auto", reading=2)
    high = _pa(d=d, ipi=65.0, label="avaluacio_trimestral", reading=4, math=5)
    assert pick_best_periodic([low, high]).period_label == "avaluacio_trimestral"


def test_pick_best_prefers_varied_simulation_over_flat_auto():
    d = date(2026, 2, 20)
    flat = _pa(d=d, ipi=20.0, label="session_auto", reading=2)
    sim = _pa(d=d, ipi=62.0, label="19 Feb 2026", reading=4, math=3)
    assert pick_best_periodic([flat, sim]).ipi_score == 62.0


def test_latest_after_resolve_uses_last_date():
    rows = [
        _pa(d=date(2026, 1, 1), ipi=30.0, label="session_auto", reading=2),
        _pa(d=date(2026, 2, 1), ipi=22.0, label="session_auto", reading=2),
        _pa(d=date(2026, 2, 1), ipi=55.0, label="19 Feb 2026", reading=4, math=3),
    ]
    latest = latest_periodic_by_participant(rows)["p1"]
    assert latest.ipi_score == 55.0

    timeline = resolve_periodic_timeline(rows)
    assert len(timeline) == 2
    assert timeline[-1].ipi_score == 55.0


def test_volunteer_sense_multiplier_is_soft():
    from app.utils.participant_metrics import _apply_volunteer_sense_bonus

    base = 50.0
    progressed = _apply_volunteer_sense_bonus(
        base, "progressed", prev_ipi=48.0, baseline_ipi=40.0
    )
    step_back = _apply_volunteer_sense_bonus(
        base, "step_back", prev_ipi=48.0, baseline_ipi=40.0
    )
    assert progressed == 54.0  # 50 * 1.2, dins del cap ±6 respecte 48
    assert step_back == 42.0  # 50 * 0.8 = 40, límit −6 respecte 48


def test_apply_progressive_session_ipi_caps_step():
    from app.utils.participant_metrics import apply_progressive_session_ipi

    d = date(2026, 3, 1)
    prev = _pa(d=d, ipi=40.0, label="19 Feb 2026", reading=3, math=3)
    # Raw IPI would jump to ~100 with all 5s
    raw = 95.0
    merged = {"academic": 5, "cognitive": 5, "social": 5, "integration": 5}
    final, meta = apply_progressive_session_ipi(
        raw,
        merged,
        prev_pa=prev,
        baseline_ipi=30.0,
        has_full_explicit=True,
    )
    assert final <= 40.0 + 6.0 + 0.1
    assert meta["has_previous"] is True
