"""
Test the phase mapper functionality.

Run with: python -m pytest tests/test_phase_mapper.py -v
Or directly: python tests/test_phase_mapper.py
"""

import sys
from pathlib import Path
from datetime import date, timedelta

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from ingestion.phase_mapper import (
    get_all_phases,
    infer_phase_from_text,
    infer_phase_from_trade,
    get_phase_from_schedule,
    calculate_phase_similarity,
    get_related_phases,
    assign_phase_to_item,
    get_phase_index
)
from ingestion.schedule_parser import (
    parse_date,
    detect_csv_columns,
    create_sample_schedule,
    validate_schedule,
    get_phase_date_ranges
)


def test_get_all_phases():
    """Test that we get all standard phases."""
    phases = get_all_phases()
    assert len(phases) == 9
    assert phases[0] == "preconstruction"
    assert phases[-1] == "closeout"
    print(f"[PASS] get_all_phases: {phases}")


def test_infer_phase_from_text():
    """Test phase inference from text content."""
    test_cases = [
        # (text, expected_phase)
        ("Installing concrete footings for elevator pit", "foundation"),
        ("Steel erection on level 5 today", "structure"),
        ("Curtain wall glazing on west facade", "envelope"),
        ("Installing VAV boxes in mechanical rooms", "mep_rough_in"),
        ("Painting corridors on floors 2-5", "interior_finishes"),
        ("Installing light fixtures in lobby", "mep_trim_out"),
        ("TAB air balance in progress", "commissioning"),
        ("Final punch list walkthrough scheduled", "closeout"),
        ("Submittals review for MEP equipment", "preconstruction"),
    ]

    passed = 0
    for text, expected in test_cases:
        result = infer_phase_from_text(text)
        if result == expected:
            passed += 1
            print(f"[PASS] infer_phase: '{text[:40]}...' -> {result}")
        else:
            print(f"[FAIL] infer_phase: '{text[:40]}...' -> {result} (expected {expected})")

    print(f"\nPhase inference: {passed}/{len(test_cases)} passed")


def test_infer_phase_from_trade():
    """Test phase inference from trade category."""
    test_cases = [
        ("electrical", ["mep_rough_in", "mep_trim_out"]),
        ("concrete", ["foundation", "structure"]),
        ("roofing", ["envelope"]),
        ("drywall", ["interior_finishes"]),
    ]

    for trade, expected_phases in test_cases:
        result = infer_phase_from_trade(trade)
        has_match = any(p in result for p in expected_phases)
        status = "[PASS]" if has_match else "[FAIL]"
        print(f"{status} trade '{trade}' -> {result}")


def test_phase_similarity():
    """Test phase similarity calculation."""
    # Same phase should have similarity 1.0
    sim = calculate_phase_similarity("structure", "structure")
    assert sim == 1.0, f"Expected 1.0, got {sim}"
    print(f"[PASS] same phase similarity: {sim}")

    # Adjacent phases should have high similarity
    sim = calculate_phase_similarity("structure", "envelope")
    assert sim > 0.8, f"Expected > 0.8, got {sim}"
    print(f"[PASS] adjacent phase similarity: {sim}")

    # Distant phases should have low similarity
    sim = calculate_phase_similarity("foundation", "closeout")
    assert sim < 0.2, f"Expected < 0.2, got {sim}"
    print(f"[PASS] distant phase similarity: {sim}")


def test_get_related_phases():
    """Test getting related phases."""
    # Test with window=1 (default)
    related = get_related_phases("structure")
    assert "foundation" in related
    assert "structure" in related
    assert "envelope" in related
    print(f"[PASS] related phases (window=1): {related}")

    # Test with window=2
    related = get_related_phases("mep_rough_in", window=2)
    assert len(related) == 5  # 2 before + center + 2 after
    print(f"[PASS] related phases (window=2): {related}")


def test_schedule_date_parsing():
    """Test date parsing for schedules."""
    test_cases = [
        ("2024-01-15", date(2024, 1, 15)),
        ("01/15/2024", date(2024, 1, 15)),
        ("1/15/24", date(2024, 1, 15)),
        ("Jan 15, 2024", date(2024, 1, 15)),
    ]

    for date_str, expected in test_cases:
        result = parse_date(date_str)
        status = "[PASS]" if result == expected else "[FAIL]"
        print(f"{status} parse_date('{date_str}') -> {result}")


def test_detect_csv_columns():
    """Test auto-detection of CSV columns."""
    # Typical P6 export header
    header1 = ["Activity ID", "Activity Name", "Start", "Finish", "Duration"]
    mapping1 = detect_csv_columns(header1)
    # Check that required columns are detected
    assert "activity_name" in mapping1, f"activity_name not detected in {mapping1}"
    assert "start_date" in mapping1, f"start_date not detected in {mapping1}"
    assert "end_date" in mapping1, f"end_date not detected in {mapping1}"
    print(f"[PASS] P6-style header: {mapping1}")

    # MS Project style header
    header2 = ["Task Name", "Start Date", "Finish Date", "Duration", "Predecessors"]
    mapping2 = detect_csv_columns(header2)
    assert "activity_name" in mapping2, f"activity_name not detected in {mapping2}"
    assert "start_date" in mapping2, f"start_date not detected in {mapping2}"
    print(f"[PASS] MSP-style header: {mapping2}")


def test_create_sample_schedule():
    """Test sample schedule creation."""
    start = date(2024, 1, 1)
    schedule = create_sample_schedule(start, duration_months=12)

    assert len(schedule) == 9  # One entry per phase
    print(f"[PASS] Created sample schedule with {len(schedule)} phases")

    # Validate the schedule
    validation = validate_schedule(schedule)
    assert validation["valid"]
    assert validation["quality_score"] == 100.0
    print(f"[PASS] Schedule validation: {validation['quality_score']}% quality")

    # Check phase ranges
    phase_ranges = get_phase_date_ranges(schedule)
    assert len(phase_ranges) == 9
    print(f"[PASS] Phase date ranges computed for {len(phase_ranges)} phases")

    # Print the schedule
    print("\nSample schedule:")
    for entry in schedule:
        print(f"  {entry['phase']}: {entry['start_date']} to {entry['end_date']}")


def test_get_phase_from_schedule():
    """Test phase determination from schedule."""
    # Create a sample schedule
    start = date(2024, 1, 1)
    schedule = create_sample_schedule(start, duration_months=12)

    # Test a date in the middle of structure phase
    test_date = date(2024, 3, 15)  # Should be in structure phase
    result = get_phase_from_schedule(test_date, schedule)

    if result:
        print(f"[PASS] Phase for {test_date}: {result['phase']} ({result['phase_progress']*100:.1f}% progress)")
    else:
        print(f"[FAIL] Could not determine phase for {test_date}")

    # Test a date before project start
    early_date = date(2023, 12, 1)
    result = get_phase_from_schedule(early_date, schedule)
    assert result["phase"] == "preconstruction"
    print(f"[PASS] Early date maps to: {result['phase']}")

    # Test a date after project end
    late_date = date(2025, 6, 1)
    result = get_phase_from_schedule(late_date, schedule)
    assert result["phase"] == "closeout"
    print(f"[PASS] Late date maps to: {result['phase']}")


def test_assign_phase_to_item():
    """Test automatic phase assignment to items."""
    # Create a sample schedule
    schedule = create_sample_schedule(date(2024, 1, 1), 12)

    # Test with date-based assignment
    item1 = {
        "raw_text": "Some random text without keywords",
        "item_date": "2024-03-15",
        "trade_category": None
    }
    result1 = assign_phase_to_item(item1, schedule)
    print(f"[INFO] Date-based assignment: {result1.get('project_phase')} (source: {result1.get('phase_source')})")

    # Test with text-based assignment (no schedule)
    item2 = {
        "raw_text": "Installing curtain wall glazing panels on the east facade",
        "item_date": None,
        "trade_category": None
    }
    result2 = assign_phase_to_item(item2, None)
    assert result2["project_phase"] == "envelope"
    print(f"[PASS] Text-based assignment: {result2.get('project_phase')} (source: {result2.get('phase_source')})")

    # Test with trade-based assignment
    item3 = {
        "raw_text": "No specific keywords here",
        "item_date": None,
        "trade_category": "electrical"
    }
    result3 = assign_phase_to_item(item3, None)
    print(f"[INFO] Trade-based assignment: {result3.get('project_phase')} (source: {result3.get('phase_source')})")


def run_all_tests():
    """Run all phase mapper tests."""
    print("=" * 60)
    print("Phase Mapper Tests")
    print("=" * 60)

    print("\n--- Testing get_all_phases ---")
    test_get_all_phases()

    print("\n--- Testing infer_phase_from_text ---")
    test_infer_phase_from_text()

    print("\n--- Testing infer_phase_from_trade ---")
    test_infer_phase_from_trade()

    print("\n--- Testing phase_similarity ---")
    test_phase_similarity()

    print("\n--- Testing get_related_phases ---")
    test_get_related_phases()

    print("\n--- Testing schedule date parsing ---")
    test_schedule_date_parsing()

    print("\n--- Testing CSV column detection ---")
    test_detect_csv_columns()

    print("\n--- Testing sample schedule creation ---")
    test_create_sample_schedule()

    print("\n--- Testing get_phase_from_schedule ---")
    test_get_phase_from_schedule()

    print("\n--- Testing assign_phase_to_item ---")
    test_assign_phase_to_item()

    print("\n" + "=" * 60)
    print("All tests completed!")
    print("=" * 60)


if __name__ == "__main__":
    run_all_tests()
