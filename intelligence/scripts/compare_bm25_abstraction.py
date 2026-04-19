#!/usr/bin/env python3
"""
Direct comparison: BM25 vs Abstraction matching.
Shows the top match from each method for 10 queries.
"""

import asyncio
import asyncpg
import os
import json
import csv
import sys
from pathlib import Path
from collections import Counter
import numpy as np

sys.path.insert(0, str(Path(__file__).parent.parent))

from dotenv import load_dotenv
load_dotenv()

from extraction.abstraction import extract_clean_question
from evaluation.approaches import BM25


async def main():
    conn = await asyncpg.connect(os.getenv('DATABASE_URL'))

    # Get 10 random queries with abstractions
    queries = await conn.fetch("""
        SELECT id::text, source_ref, question_text, raw_text, embedding, abstracted_summary
        FROM intelligence.items
        WHERE source_type = 'rfi'
          AND embedding IS NOT NULL
          AND abstracted_summary IS NOT NULL
          AND abstracted_summary != '{}'
          AND LENGTH(COALESCE(question_text, raw_text)) > 80
        ORDER BY RANDOM()
        LIMIT 10
    """)

    # Get corpus
    corpus_rows = await conn.fetch("""
        SELECT id::text, source_ref, question_text, raw_text, embedding, abstracted_summary
        FROM intelligence.items
        WHERE source_type = 'rfi'
          AND embedding IS NOT NULL
        LIMIT 1000
    """)
    corpus = [dict(r) for r in corpus_rows]

    # Build BM25 index
    bm25 = BM25()
    for doc in corpus:
        doc['text'] = doc.get('question_text') or doc.get('raw_text') or ''
    bm25.fit(corpus)

    results = []

    for q in queries:
        query_id = q['id']
        query_ref = q['source_ref']
        query_text = q.get('question_text') or q.get('raw_text') or ''
        query_clean = extract_clean_question(query_text)
        query_emb = np.array(q['embedding'])

        query_abs = json.loads(q['abstracted_summary']) if q['abstracted_summary'] else {}
        query_terms = query_abs.get('key_terms', [])
        query_base = query_ref.split('.')[0]  # RFI-0030.1 -> RFI-0030

        # BM25 ranking
        bm25_results = bm25.rank(query_text, top_k=20)
        bm25_top = None
        for doc_id, score in bm25_results:
            if doc_id == query_id:
                continue
            doc = next((d for d in corpus if d['id'] == doc_id), None)
            if not doc or not doc.get('source_ref'):
                continue
            # Skip revisions
            doc_base = doc['source_ref'].split('.')[0]
            if doc_base == query_base:
                continue
            bm25_top = {'doc': doc, 'score': score}
            break

        # Abstraction + Embedding ranking
        scored = []
        for doc in corpus:
            if doc['id'] == query_id:
                continue
            if not doc.get('source_ref'):
                continue
            # Skip revisions
            doc_base = doc['source_ref'].split('.')[0]
            if doc_base == query_base:
                continue

            doc_emb = doc.get('embedding')
            if not doc_emb:
                continue
            doc_emb = np.array(doc_emb)

            # Semantic score
            sem = float(np.dot(query_emb, doc_emb) / (np.linalg.norm(query_emb) * np.linalg.norm(doc_emb)))

            # Key terms score
            doc_abs = json.loads(doc['abstracted_summary']) if doc.get('abstracted_summary') else {}
            doc_terms = doc_abs.get('key_terms', [])

            q_set = {t.lower() for t in query_terms}
            d_set = {t.lower() for t in doc_terms}
            overlap = q_set & d_set
            term_score = min(1.0, len(overlap) * 0.35) if overlap else 0

            combined = 0.4 * sem + 0.6 * term_score
            scored.append({
                'doc': doc,
                'score': combined,
                'sem': sem,
                'overlap': list(overlap)
            })

        scored.sort(key=lambda x: x['score'], reverse=True)
        abs_top = scored[0] if scored else None

        results.append({
            'query_ref': query_ref,
            'query': query_clean,
            'query_terms': query_terms[:5],
            'bm25_ref': bm25_top['doc']['source_ref'] if bm25_top else 'N/A',
            'bm25_match': extract_clean_question(bm25_top['doc'].get('question_text') or bm25_top['doc'].get('raw_text') or '') if bm25_top else 'N/A',
            'abs_ref': abs_top['doc']['source_ref'] if abs_top else 'N/A',
            'abs_match': extract_clean_question(abs_top['doc'].get('question_text') or abs_top['doc'].get('raw_text') or '') if abs_top else 'N/A',
            'abs_overlap': abs_top['overlap'] if abs_top else [],
        })

    await conn.close()

    # Write CSV - full text, no truncation
    output = Path(__file__).parent.parent / 'evaluation' / 'bm25_vs_abstraction.csv'
    with open(output, 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(['query_ref', 'query', 'bm25_ref', 'bm25_match', 'abs_ref', 'abs_match', 'abs_terms_matched'])
        for r in results:
            writer.writerow([
                r['query_ref'],
                r['query'],
                r['bm25_ref'],
                r['bm25_match'],
                r['abs_ref'],
                r['abs_match'],
                '; '.join(r['abs_overlap']),
            ])

    # Print comparison
    for i, r in enumerate(results, 1):
        print(f'\n{"="*80}')
        print(f'QUERY {i}: {r["query_ref"]}')
        print(f'{r["query"][:180]}')
        print()
        print(f'BM25: {r["bm25_ref"]}')
        print(f'{r["bm25_match"][:180]}')
        print()
        print(f'ABSTRACTION: {r["abs_ref"]}')
        print(f'{r["abs_match"][:180]}')
        print(f'[matched terms: {", ".join(r["abs_overlap"]) if r["abs_overlap"] else "none"}]')

    print(f'\n\nCSV: {output}')


if __name__ == "__main__":
    asyncio.run(main())
