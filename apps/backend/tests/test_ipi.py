from app.algorithms.ipi import DimensionScores, calculate_ipi, calculate_relative_improvement


def test_calculate_ipi_full_dimensions():
    scores = DimensionScores(
        reading_level=4,
        math_level=3,
        comprehension_level=4,
        attention_level=3,
        memory_level=4,
        autonomy_level=4,
        peer_interaction=4,
        group_work=3,
        emotional_regulation=4,
        language_fluency=3,
        cultural_adaptation=4,
    )
    result = calculate_ipi(scores)
    assert result["ipi"] is not None
    assert 0 <= result["ipi"] <= 100
    assert result["completeness"] == 1.0


def test_calculate_ipi_partial_dimensions():
    scores = DimensionScores(reading_level=3, math_level=3, comprehension_level=3)
    result = calculate_ipi(scores)
    assert result["ipi"] == 50.0
    assert result["dimensions"]["academic"] == 50.0
    assert result["completeness"] < 1.0


def test_relative_improvement():
    result = calculate_relative_improvement(40, 60)
    assert result["absolute_delta"] == 20
    assert result["relative_delta_pct"] == 50.0
    assert result["trajectory"] == "improving"
