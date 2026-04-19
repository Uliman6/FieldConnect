#!/usr/bin/env python3
"""
Root Cause Analysis for top drywall CO categories.
"""

import asyncio
import os
import sys
import re
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

from dotenv import load_dotenv
load_dotenv()

import asyncpg


async def main():
    conn = await asyncpg.connect(os.getenv("DATABASE_URL"))

    try:
        # =====================================================================
        # CATEGORY 1: MEP PENETRATION FRAMING
        # =====================================================================
        print("=" * 90)
        print("CATEGORY 1: MEP PENETRATION FRAMING")
        print("11 RFIs resulted in Change Orders")
        print("=" * 90)

        rows = await conn.fetch("""
            SELECT
                source_ref,
                source_project_name,
                question_text,
                resolution_text,
                resulted_in_co
            FROM intelligence.items
            WHERE resulted_in_co = true
              AND (trade_category ILIKE '%drywall%'
                OR question_text ILIKE '%drywall%'
                OR question_text ILIKE '%framing%'
                OR question_text ILIKE '%stud%')
              AND (question_text ILIKE '%penetration%'
                OR question_text ILIKE '%access panel%'
                OR question_text ILIKE '%grille%'
                OR question_text ILIKE '%diffuser%'
                OR question_text ILIKE '%duct%'
                OR question_text ILIKE '%conduit%'
                OR question_text ILIKE '%sleeve%'
                OR question_text ILIKE '%chase%')
            ORDER BY source_project_name, source_ref
        """)

        print(f"\nFound {len(rows)} MEP Penetration COs\n")

        for i, r in enumerate(rows, 1):
            q = r["question_text"] or ""
            res = r["resolution_text"] or ""

            # Clean text
            q = re.sub(r'\s+', ' ', q).strip()
            res = re.sub(r'\s+', ' ', res).strip()

            print(f"\n{'='*90}")
            print(f"CO #{i}: {r['source_ref']} - {r['source_project_name']}")
            print(f"{'='*90}")

            print(f"\nFULL QUESTION/ISSUE:")
            print("-" * 50)
            print(q)

            print(f"\nRESOLUTION/FIX:")
            print("-" * 50)
            print(res[:800] if res else "No resolution recorded")

            # Extract root cause patterns
            print(f"\nANALYSIS:")
            print("-" * 50)

            root_causes = []
            if "existing" in q.lower():
                root_causes.append("Existing conditions differ from drawings")
            if "clash" in q.lower() or "conflict" in q.lower():
                root_causes.append("MEP/Structure clash not caught in coordination")
            if "not shown" in q.lower() or "not called out" in q.lower():
                root_causes.append("Missing information in drawings")
            if "change" in q.lower() or "added" in q.lower() or "revised" in q.lower():
                root_causes.append("Design change after framing started")
            if "coordination" in q.lower():
                root_causes.append("Coordination issue between trades")
            if "access" in q.lower():
                root_causes.append("Access panel location/size issue")

            if root_causes:
                print(f"  Root Cause(s): {', '.join(root_causes)}")
            else:
                print(f"  Root Cause: Requires manual review")

            # Extract fix type
            fixes = []
            if "reframe" in res.lower() or "re-frame" in res.lower():
                fixes.append("Reframe wall/ceiling")
            if "relocate" in res.lower() or "move" in res.lower():
                fixes.append("Relocate element")
            if "add" in res.lower() or "provide" in res.lower():
                fixes.append("Add new element/detail")
            if "proceed" in res.lower():
                fixes.append("Proceed with proposed solution")
            if "demo" in res.lower():
                fixes.append("Demo and rebuild")

            if fixes:
                print(f"  Fix Applied: {', '.join(fixes)}")

        # =====================================================================
        # CATEGORY 2: WALL-TO-STRUCTURE ALIGNMENT
        # =====================================================================
        print("\n\n")
        print("=" * 90)
        print("CATEGORY 2: WALL-TO-STRUCTURE ALIGNMENT")
        print("10 RFIs resulted in Change Orders")
        print("=" * 90)

        rows = await conn.fetch("""
            SELECT
                source_ref,
                source_project_name,
                question_text,
                resolution_text,
                resulted_in_co
            FROM intelligence.items
            WHERE resulted_in_co = true
              AND (trade_category ILIKE '%drywall%'
                OR question_text ILIKE '%drywall%'
                OR question_text ILIKE '%framing%'
                OR question_text ILIKE '%stud%'
                OR question_text ILIKE '%wall%')
              AND (question_text ILIKE '%slab edge%'
                OR question_text ILIKE '%curb%'
                OR question_text ILIKE '%existing%'
                OR question_text ILIKE '%as-built%'
                OR question_text ILIKE '%not align%'
                OR question_text ILIKE '%offset%'
                OR question_text ILIKE '%shear wall%'
                OR question_text ILIKE '%concrete wall%')
            ORDER BY source_project_name, source_ref
        """)

        print(f"\nFound {len(rows)} Wall-to-Structure Alignment COs\n")

        for i, r in enumerate(rows, 1):
            q = r["question_text"] or ""
            res = r["resolution_text"] or ""

            # Clean text
            q = re.sub(r'\s+', ' ', q).strip()
            res = re.sub(r'\s+', ' ', res).strip()

            print(f"\n{'='*90}")
            print(f"CO #{i}: {r['source_ref']} - {r['source_project_name']}")
            print(f"{'='*90}")

            print(f"\nFULL QUESTION/ISSUE:")
            print("-" * 50)
            print(q)

            print(f"\nRESOLUTION/FIX:")
            print("-" * 50)
            print(res[:800] if res else "No resolution recorded")

            # Extract root cause patterns
            print(f"\nANALYSIS:")
            print("-" * 50)

            root_causes = []
            if "existing" in q.lower():
                root_causes.append("Existing conditions differ from drawings")
            if "not align" in q.lower() or "does not align" in q.lower():
                root_causes.append("Wall doesn't align with structure")
            if "slab" in q.lower() and ("edge" in q.lower() or "depression" in q.lower()):
                root_causes.append("Slab edge/depression not as shown")
            if "curb" in q.lower():
                root_causes.append("Curb location/dimension issue")
            if "shear wall" in q.lower() or "concrete wall" in q.lower():
                root_causes.append("Conflict with concrete/shear wall")
            if "demo" in q.lower():
                root_causes.append("Requires demo of existing work")
            if "column" in q.lower():
                root_causes.append("Column conflicts with wall layout")

            if root_causes:
                print(f"  Root Cause(s): {', '.join(root_causes)}")
            else:
                print(f"  Root Cause: Requires manual review")

            # Extract fix type
            fixes = []
            if "infill" in res.lower():
                fixes.append("Infill gap")
            if "extend" in res.lower():
                fixes.append("Extend element")
            if "demo" in res.lower():
                fixes.append("Demo and rebuild")
            if "shift" in res.lower() or "move" in res.lower() or "relocate" in res.lower():
                fixes.append("Relocate wall/element")
            if "proceed" in res.lower():
                fixes.append("Proceed with proposed solution")
            if "furred" in res.lower() or "fur" in res.lower():
                fixes.append("Add furred wall")

            if fixes:
                print(f"  Fix Applied: {', '.join(fixes)}")

        # =====================================================================
        # SUMMARY
        # =====================================================================
        print("\n\n")
        print("=" * 90)
        print("ROOT CAUSE SUMMARY")
        print("=" * 90)

        print("""
MEP PENETRATION FRAMING - Common Root Causes:
----------------------------------------------
1. Existing conditions not surveyed before framing
2. MEP rough-in locations changed after drywall coordination
3. Access panel sizes/locations not confirmed before close-in
4. Duct clashes with studs not caught in BIM
5. Conduit routing through stud cavities not coordinated

MEP PENETRATION FRAMING - Typical Fixes:
----------------------------------------------
- Reframe around new penetration locations
- Add blocking/backing for relocated grilles
- Provide new framing details at duct penetrations
- Relocate access panels and reframe

WALL-TO-STRUCTURE ALIGNMENT - Common Root Causes:
----------------------------------------------
1. As-built survey not done before wall layout
2. Slab edges/curbs installed in wrong location
3. Existing walls/structure don't match drawings
4. Column locations conflict with partition grid
5. Floor elevations/depressions not coordinated

WALL-TO-STRUCTURE ALIGNMENT - Typical Fixes:
----------------------------------------------
- Infill gaps between curb and framing
- Demo and rebuild walls at new locations
- Add furred walls to conceal misaligned structure
- Shift walls to clear structural conflicts
- Extend curbs/slabs to meet framing
""")

    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
