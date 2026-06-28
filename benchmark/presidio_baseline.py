#!/usr/bin/env python3
"""
Presidio baseline for the Redacta benchmark.

Runs Microsoft Presidio (as shipped, default recognizers) over the IDENTICAL
corpus Redacta is scored on (benchmark/corpus.json), with the IDENTICAL scoring
rule, so the two numbers are directly comparable.

This cannot run in the Redacta sandbox (Presidio's spaCy model downloads from
GitHub, which the sandbox blocks). Run it on your Mac:

    pip install presidio-analyzer
    python -m spacy download en_core_web_lg
    node benchmark/benchmark.mjs        # regenerate corpus.json
    python benchmark/presidio_baseline.py

Pin versions for a citable run, e.g. presidio-analyzer==2.2.x, en_core_web_lg==3.7.x.
"""
import json, re, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))

# --- identical scoring rule to benchmark.mjs --------------------------------
def norm(s): return re.sub(r"[^a-z0-9]", "", s.lower())
def overlap(a, b):
    x, y = norm(a), norm(b)
    return bool(x) and bool(y) and (x in y or y in x)

# Presidio entity type -> Redacta category. PERSON is a name "family" so a
# detected name can satisfy either a patient or a relative gold label.
NAME_FAMILY = {"PATIENT_NAME", "RELATIVE_NAME"}
ENTITY_MAP = {
    "PERSON": "PERSON",            # name family (see below)
    "UK_NHS": "NHS_NUMBER",
    "EMAIL_ADDRESS": "EMAIL",
    "PHONE_NUMBER": "PHONE",
    "DATE_TIME": "DATE_OF_BIRTH",  # Presidio flags ALL dates, incl. appointments
    "LOCATION": "POSTCODE",
}

def cat_matches(found_cat, gold_cat):
    if found_cat == "PERSON":
        return gold_cat in NAME_FAMILY
    return found_cat == gold_cat

def score(engine_fn, corpus):
    cats = {}
    gold_total = lenient = strict = 0
    redact_total = redact_correct = false_pos = 0
    preserve_total = preserve_kept = 0
    for item in corpus:
        found = engine_fn(item["text"])  # list of {"value","cat"}
        for g in item["gold"]:
            gold_total += 1
            c = cats.setdefault(g["cat"], {"lenient": 0, "strict": 0, "total": 0})
            c["total"] += 1
            if any(overlap(f["value"], g["value"]) for f in found):
                lenient += 1; c["lenient"] += 1
            if any(overlap(f["value"], g["value"]) and cat_matches(f["cat"], g["cat"]) for f in found):
                strict += 1; c["strict"] += 1
        for f in found:
            redact_total += 1
            if any(overlap(f["value"], g["value"]) for g in item["gold"]):
                redact_correct += 1
            else:
                false_pos += 1
        for p in item["preserve"]:
            preserve_total += 1
            if not any(overlap(f["value"], p["value"]) for f in found):
                preserve_kept += 1
    pct = lambda a, b: round(100 * a / b, 1) if b else 0.0
    return {
        "leaksAvoided": pct(lenient, gold_total),
        "strictRecall": pct(strict, gold_total),
        "precision": pct(redact_correct, redact_total),
        "falsePositives": false_pos,
        "preserveAccuracy": pct(preserve_kept, preserve_total),
        "goldIdentifiers": gold_total,
        "perCategory": {
            k: {"leaksAvoided": pct(v["lenient"], v["total"]),
                "strictRecall": pct(v["strict"], v["total"]), "n": v["total"]}
            for k, v in sorted(cats.items())
        },
    }

def main():
    corpus = json.load(open(os.path.join(HERE, "corpus.json")))["notes"]
    try:
        from presidio_analyzer import AnalyzerEngine
    except ImportError:
        sys.exit("presidio-analyzer not installed. See the header of this file.")
    analyzer = AnalyzerEngine()

    def presidio_engine(text):
        out = []
        for r in analyzer.analyze(text=text, language="en"):
            cat = ENTITY_MAP.get(r.entity_type, r.entity_type)
            out.append({"value": text[r.start:r.end], "cat": cat})
        return out

    res = score(presidio_engine, corpus)
    print(json.dumps({"engine": "presidio (default, en_core_web_lg)", **res}, indent=2))
    json.dump(res, open(os.path.join(HERE, "presidio_results.json"), "w"), indent=2)

if __name__ == "__main__":
    main()
