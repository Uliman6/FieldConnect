#!/usr/bin/env python3
"""Explore change order data in the database."""

import asyncio
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

from dotenv import load_dotenv
load_dotenv()

import asyncpg


async def main():
    conn = await asyncpg.connect(os.getenv("DATABASE_URL"))

    try:
        print("CHANGE ORDER DATA OVERVIEW:")
        print("=" * 70)

        # RFIs with resulted_in_co flag
        co_flag = await conn.fetchval("""
            SELECT COUNT(*) FROM intelligence.items
            WHERE resulted_in_co = true
        """)
        print(f"RFIs with resulted_in_co = true: {co_flag}")

        # RFIs with cost_impact
        cost_impact = await conn.fetchval("""
            SELECT COUNT(*) FROM intelligence.items
            WHERE cost_impact IS NOT NULL AND cost_impact > 0
        """)
        print(f"RFIs with cost_impact > 0: {cost_impact}")

        # Total cost impact
        total_cost = await conn.fetchval("""
            SELECT SUM(cost_impact) FROM intelligence.items
            WHERE cost_impact IS NOT NULL
        """)
        if total_cost:
            print(f"Total cost impact tracked: ${total_cost:,.0f}")

        # Check for CO-related text in RFIs
        co_text = await conn.fetchval("""
            SELECT COUNT(*) FROM intelligence.items
            WHERE question_text ILIKE '%change order%'
               OR question_text ILIKE '%PCO%'
               OR question_text ILIKE '%COR%'
               OR raw_text ILIKE '%change order%'
        """)
        print(f"RFIs mentioning change orders in text: {co_text}")

        # By project
        print("\n" + "-" * 70)
        print("CHANGE ORDERS BY PROJECT:")
        print("-" * 70)
        rows = await conn.fetch("""
            SELECT source_project_name,
                   COUNT(*) as co_count,
                   SUM(cost_impact) as total_cost
            FROM intelligence.items
            WHERE resulted_in_co = true
            GROUP BY source_project_name
            ORDER BY co_count DESC
        """)
        for r in rows:
            cost = f"${r['total_cost']:,.0f}" if r['total_cost'] else "N/A"
            print(f"  {r['source_project_name']}: {r['co_count']} COs, {cost}")

        # Sample RFIs with change orders
        print("\n" + "-" * 70)
        print("SAMPLE RFIs THAT RESULTED IN CHANGE ORDERS:")
        print("-" * 70)
        rows = await conn.fetch("""
            SELECT source_project_name, source_ref, trade_category,
                   cost_impact,
                   SUBSTRING(COALESCE(question_text, raw_text), 1, 200) as txt
            FROM intelligence.items
            WHERE resulted_in_co = true
            ORDER BY cost_impact DESC NULLS LAST
            LIMIT 20
        """)
        for r in rows:
            cost = f"${r['cost_impact']:,.0f}" if r['cost_impact'] else "N/A"
            print(f"\n[{r['source_ref']}] {r['source_project_name']}")
            print(f"  Trade: {r['trade_category']} | Cost: {cost}")
            print(f"  {r['txt']}...")

        # Source types
        print("\n" + "-" * 70)
        print("SOURCE TYPES IN DATABASE:")
        print("-" * 70)
        rows = await conn.fetch("""
            SELECT source_type, COUNT(*) as cnt
            FROM intelligence.items
            GROUP BY source_type
            ORDER BY cnt DESC
        """)
        for r in rows:
            print(f"  {r['cnt']:5d}  {r['source_type']}")

    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
