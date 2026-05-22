"""Tests for session IPI learning curve (diminishing returns)."""

from app.algorithms.learning_curve import (
    apply_learning_curve_ipi,
    learning_curve_target,
    personal_asymptote,
)


def test_ten_sessions_with_perfect_observation_stays_below_ceiling():
    """Amb observació sempre «perfecta», 10 sessions no han d'arribar a 100."""
    baseline = 40.0
    m = personal_asymptote(baseline, baseline)
    prev = None
    for n in range(1, 11):
        prev = apply_learning_curve_ipi(
            prev_ipi=prev,
            observed_ipi=98.0,
            baseline_ipi=baseline,
            session_index=n,
        )
    assert prev is not None
    assert prev < m
    assert prev < 78.0
    assert prev > baseline + 8.0


def test_learning_curve_target_increases_then_saturates():
    b = 35.0
    targets = [learning_curve_target(b, n) for n in range(1, 21)]
    assert targets[0] < targets[5] < targets[10]
    assert targets[18] - targets[19] < 2.0
    assert targets[-1] <= personal_asymptote(b, b)
