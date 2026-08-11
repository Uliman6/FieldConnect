#!/usr/bin/env python3
"""
RFI Intelligence Report - Web UI for querying and filtering RFI data.
Run with: python reports/app.py
"""

import asyncio
import os
import sys
import json
from pathlib import Path
from flask import Flask, render_template, request, jsonify
from flask_cors import CORS

sys.path.insert(0, str(Path(__file__).parent.parent))

from dotenv import load_dotenv
load_dotenv()

import asyncpg

app = Flask(__name__, template_folder='templates', static_folder='static')
CORS(app)

DATABASE_URL = os.getenv("DATABASE_URL")

# Project type classification
PROJECT_TYPES = {
    'Abbott Alameda Office TI': 'TI',
    'CoreSite Data Center': 'Data Center',
    'Intuitive Surgical MOB': 'MOB',
    'Silicon Valley Office': 'Ground-Up Office',
    'Southline Office': 'Ground-Up Office',
    'Sutter Eden - Office TI': 'TI',
    'Sutter East': 'Healthcare',
}

def get_project_type(project_name):
    return PROJECT_TYPES.get(project_name, 'Other')


def run_async(coro):
    """Run async function in sync context."""
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


async def get_db_connection():
    return await asyncpg.connect(DATABASE_URL)


async def fetch_rfis(filters=None):
    """Fetch RFIs with optional filters."""
    conn = await get_db_connection()

    try:
        where_clauses = ["cost_impact > 0"]
        params = []
        param_idx = 1

        if filters:
            if filters.get('project'):
                where_clauses.append(f"source_project_name = ${param_idx}")
                params.append(filters['project'])
                param_idx += 1

            if filters.get('min_cost'):
                where_clauses.append(f"cost_impact >= ${param_idx}")
                params.append(float(filters['min_cost']))
                param_idx += 1

            if filters.get('max_cost'):
                where_clauses.append(f"cost_impact <= ${param_idx}")
                params.append(float(filters['max_cost']))
                param_idx += 1

            if filters.get('trade'):
                where_clauses.append(f"trade_category ILIKE ${param_idx}")
                params.append(f"%{filters['trade']}%")
                param_idx += 1

            if filters.get('root_cause'):
                where_clauses.append(f"metadata::text ILIKE ${param_idx}")
                params.append(f"%{filters['root_cause']}%")
                param_idx += 1

            if filters.get('search'):
                where_clauses.append(f"(raw_text ILIKE ${param_idx} OR abstracted_summary ILIKE ${param_idx})")
                params.append(f"%{filters['search']}%")
                param_idx += 1

        where_sql = " AND ".join(where_clauses)

        query = f"""
            SELECT source_ref, source_project_name, cost_impact,
                   raw_text, abstracted_summary, trade_category,
                   issue_type, metadata, item_date
            FROM intelligence.items
            WHERE {where_sql}
            ORDER BY cost_impact DESC
            LIMIT 100
        """

        rows = await conn.fetch(query, *params)

        results = []
        for row in rows:
            meta = {}
            if row['metadata']:
                try:
                    meta = json.loads(row['metadata']) if isinstance(row['metadata'], str) else dict(row['metadata'])
                except:
                    pass

            # Extract title from raw_text
            title = ""
            if row['raw_text']:
                if 'Title:' in row['raw_text']:
                    title = row['raw_text'].split('Title:')[1].split('\n')[0].strip()[:150]

            results.append({
                'rfi': row['source_ref'],
                'project': row['source_project_name'],
                'project_type': get_project_type(row['source_project_name']),
                'cost': float(row['cost_impact']),
                'title': title,
                'summary': row['abstracted_summary'] or '',
                'trade': row['trade_category'] or '',
                'issue_type': row['issue_type'] or '',
                'root_cause': meta.get('llm_cause', ''),
                'system': meta.get('llm_system', ''),
                'date': str(row['item_date']) if row['item_date'] else '',
            })

        return results

    finally:
        await conn.close()


async def fetch_stats():
    """Fetch summary statistics."""
    conn = await get_db_connection()

    try:
        # Overall stats
        overall = await conn.fetchrow("""
            SELECT COUNT(*) as total_rfis,
                   COUNT(cost_impact) FILTER (WHERE cost_impact > 0) as rfis_with_cost,
                   SUM(cost_impact) as total_cost
            FROM intelligence.items
        """)

        # By project
        by_project = await conn.fetch("""
            SELECT source_project_name as project,
                   COUNT(*) as count,
                   SUM(cost_impact) as total_cost
            FROM intelligence.items
            WHERE cost_impact > 0
            GROUP BY source_project_name
            ORDER BY SUM(cost_impact) DESC
        """)

        # By root cause (metadata is stored as JSON string, need to cast)
        by_cause = await conn.fetch("""
            SELECT metadata::jsonb->>'llm_cause' as root_cause,
                   COUNT(*) as count,
                   SUM(cost_impact) as total_cost
            FROM intelligence.items
            WHERE cost_impact > 0 AND metadata IS NOT NULL
                  AND metadata::jsonb->>'llm_cause' IS NOT NULL
            GROUP BY metadata::jsonb->>'llm_cause'
            ORDER BY SUM(cost_impact) DESC
            LIMIT 10
        """)

        # By trade
        by_trade = await conn.fetch("""
            SELECT trade_category as trade,
                   COUNT(*) as count,
                   SUM(cost_impact) as total_cost
            FROM intelligence.items
            WHERE cost_impact > 0 AND trade_category IS NOT NULL AND trade_category != '-'
            GROUP BY trade_category
            ORDER BY SUM(cost_impact) DESC
            LIMIT 10
        """)

        return {
            'overall': {
                'total_rfis': overall['total_rfis'],
                'rfis_with_cost': overall['rfis_with_cost'],
                'total_cost': float(overall['total_cost']) if overall['total_cost'] else 0
            },
            'by_project': [
                {'project': r['project'], 'count': r['count'], 'total_cost': float(r['total_cost'])}
                for r in by_project
            ],
            'by_root_cause': [
                {'root_cause': r['root_cause'], 'count': r['count'], 'total_cost': float(r['total_cost'])}
                for r in by_cause if r['root_cause']
            ],
            'by_trade': [
                {'trade': r['trade'], 'count': r['count'], 'total_cost': float(r['total_cost'])}
                for r in by_trade if r['trade']
            ]
        }

    finally:
        await conn.close()


async def fetch_projects():
    """Fetch list of projects."""
    conn = await get_db_connection()
    try:
        rows = await conn.fetch("""
            SELECT DISTINCT source_project_name FROM intelligence.items
            WHERE cost_impact > 0
            ORDER BY source_project_name
        """)
        return [r['source_project_name'] for r in rows]
    finally:
        await conn.close()


async def fetch_root_causes():
    """Fetch list of root causes."""
    conn = await get_db_connection()
    try:
        rows = await conn.fetch("""
            SELECT DISTINCT metadata::jsonb->>'llm_cause' as cause
            FROM intelligence.items
            WHERE cost_impact > 0 AND metadata IS NOT NULL
                  AND metadata::jsonb->>'llm_cause' IS NOT NULL
            ORDER BY 1
        """)
        return [r['cause'] for r in rows if r['cause']]
    finally:
        await conn.close()


async def fetch_cross_project_insights():
    """Identify high-value cross-project learning opportunities (Score 5s)."""
    conn = await get_db_connection()

    try:
        # Preventable root causes with high cost (Design Coordination, Incomplete Design)
        preventable_causes = ['Design Coordination', 'Incomplete Design', 'Code / Regulatory']

        insights = {
            'high_value_rfis': [],
            'cross_project_patterns': [],
            'preventable_costs': {},
        }

        # Get high-cost RFIs with preventable causes (Score 5 candidates)
        high_value = await conn.fetch("""
            SELECT source_ref, source_project_name, cost_impact,
                   raw_text, abstracted_summary, metadata
            FROM intelligence.items
            WHERE cost_impact >= 50000
            ORDER BY cost_impact DESC
            LIMIT 50
        """)

        for r in high_value:
            meta = {}
            if r['metadata']:
                try:
                    meta = json.loads(r['metadata'])
                except:
                    pass

            cause = meta.get('llm_cause', '')
            system = meta.get('llm_system', '')

            # Score 5 criteria: Preventable + High Cost + Has clear lesson
            is_preventable = cause in preventable_causes
            is_high_cost = float(r['cost_impact']) >= 100000

            # Extract title and description from raw_text
            title = ""
            description = ""
            raw_text = r['raw_text'] or ''

            if 'Title:' in raw_text:
                title = raw_text.split('Title:')[1].split('\n')[0].strip()[:150]

            # Extract question/description
            if 'Question:' in raw_text:
                desc_part = raw_text.split('Question:')[1]
                for marker in ['Answer:', 'Response:', 'Status:', '\n\n']:
                    if marker in desc_part:
                        desc_part = desc_part.split(marker)[0]
                        break
                description = desc_part.strip()[:500]
            elif 'Description:' in raw_text:
                desc_part = raw_text.split('Description:')[1]
                for marker in ['Answer:', 'Response:', 'Status:', '\n\n']:
                    if marker in desc_part:
                        desc_part = desc_part.split(marker)[0]
                        break
                description = desc_part.strip()[:500]

            # Fallback to summary or raw text excerpt
            if not description:
                description = r['abstracted_summary'] or raw_text[:500]

            insights['high_value_rfis'].append({
                'rfi': r['source_ref'],
                'project': r['source_project_name'],
                'project_type': get_project_type(r['source_project_name']),
                'cost': float(r['cost_impact']),
                'root_cause': cause,
                'system': system,
                'title': title,
                'description': description,
                'summary': r['abstracted_summary'] or '',
                'raw_text': raw_text[:2000],
                'is_preventable': is_preventable,
                'score_5_candidate': is_preventable and is_high_cost,
            })

        # Cross-project patterns: root causes appearing in multiple project types
        patterns = await conn.fetch("""
            SELECT metadata::jsonb->>'llm_cause' as root_cause,
                   metadata::jsonb->>'llm_system' as system,
                   COUNT(DISTINCT source_project_name) as project_count,
                   COUNT(*) as rfi_count,
                   SUM(cost_impact) as total_cost
            FROM intelligence.items
            WHERE cost_impact > 0 AND metadata IS NOT NULL
                  AND metadata::jsonb->>'llm_cause' IS NOT NULL
            GROUP BY metadata::jsonb->>'llm_cause', metadata::jsonb->>'llm_system'
            HAVING COUNT(DISTINCT source_project_name) >= 2
            ORDER BY SUM(cost_impact) DESC
            LIMIT 15
        """)

        for p in patterns:
            insights['cross_project_patterns'].append({
                'root_cause': p['root_cause'],
                'system': p['system'],
                'project_count': p['project_count'],
                'rfi_count': p['rfi_count'],
                'total_cost': float(p['total_cost']),
            })

        # Preventable costs summary
        preventable = await conn.fetch("""
            SELECT metadata::jsonb->>'llm_cause' as root_cause,
                   SUM(cost_impact) as total_cost,
                   COUNT(*) as count
            FROM intelligence.items
            WHERE cost_impact > 0 AND metadata IS NOT NULL
                  AND metadata::jsonb->>'llm_cause' IN ('Design Coordination', 'Incomplete Design', 'Code / Regulatory')
            GROUP BY metadata::jsonb->>'llm_cause'
            ORDER BY SUM(cost_impact) DESC
        """)

        total_preventable = 0
        for p in preventable:
            cost = float(p['total_cost'])
            insights['preventable_costs'][p['root_cause']] = {
                'cost': cost,
                'count': p['count']
            }
            total_preventable += cost

        insights['preventable_costs']['_total'] = total_preventable

        return insights

    finally:
        await conn.close()


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/api/rfis')
def api_rfis():
    filters = {
        'project': request.args.get('project'),
        'min_cost': request.args.get('min_cost'),
        'max_cost': request.args.get('max_cost'),
        'trade': request.args.get('trade'),
        'root_cause': request.args.get('root_cause'),
        'search': request.args.get('search'),
    }
    # Remove None values
    filters = {k: v for k, v in filters.items() if v}

    rfis = run_async(fetch_rfis(filters))
    return jsonify(rfis)


@app.route('/api/stats')
def api_stats():
    stats = run_async(fetch_stats())
    return jsonify(stats)


@app.route('/api/projects')
def api_projects():
    projects = run_async(fetch_projects())
    return jsonify(projects)


@app.route('/api/root-causes')
def api_root_causes():
    causes = run_async(fetch_root_causes())
    return jsonify(causes)


@app.route('/api/insights')
def api_insights():
    insights = run_async(fetch_cross_project_insights())
    return jsonify(insights)


if __name__ == '__main__':
    print("=" * 60)
    print("RFI Intelligence Report")
    print("=" * 60)
    print("Starting server at http://localhost:5050")
    print("Press Ctrl+C to stop")
    print("=" * 60)
    app.run(host='0.0.0.0', port=5050, debug=True)
