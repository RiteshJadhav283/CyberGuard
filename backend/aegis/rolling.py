"""Event-time rolling detection, including already-seen events following a late arrival."""
import json
from collections import Counter
from datetime import datetime, timezone

from .db import rows, run
from .guardian import WRITES, auto_request, save_case
from .security import digest


def scheduled(rules, actor, at):
    moment=datetime.fromtimestamp(at,timezone.utc)
    minute=moment.hour*60+moment.minute
    return any(s["role"]==actor and moment.weekday() in s["weekdays"] and
               s["start_minute_utc"]<=minute<s["end_minute_utc"] for s in rules["scheduled_jobs"])


def detect_bulk(db,conn,cfg,event):
    rules=cfg["rules"]
    actor,at=event["actor"],event["at"]
    if event.get("source",{}).get("role_arn")!=actor or scheduled(rules,actor,at):
        return
    window,threshold=rules["window_seconds"],rules["threshold"]
    candidates=rows(run(db,"""SELECT event_id,object_key,operation,at,source FROM activity
        WHERE connection=:c AND actor=:a AND outcome='success' AND at BETWEEN :lo AND :hi
        ORDER BY at,event_id""",c=conn["id"],a=actor,lo=at-window+1,hi=at+window-1))
    candidates=[r for r in candidates if r["operation"] in WRITES and json.loads(r["source"]).get("role_arn")==actor
                and not scheduled(rules,actor,r["at"])]
    # Each affected time window ends at or after the arrival's event time.
    # Maintain a distinct-key count as its left and right bounds move forward.
    counts=Counter()
    left=0
    peak=0
    best=None
    for right,row in enumerate(candidates):
        counts[row["object_key"]]+=1
        while candidates[left]["at"]<=row["at"]-window:
            old=candidates[left]["object_key"]
            counts[old]-=1
            if counts[old]==0:
                del counts[old]
            left+=1
        if row["at"]>=at and len(counts)>=threshold and len(counts)>=peak:
            peak,best=len(counts),(left,right)
    if best is None:
        return
    evidence=candidates[best[0]:best[1]+1]
    start,end=evidence[0]["at"],evidence[-1]["at"]
    # Keep stable case IDs for overlapping windows. If late evidence connects two
    # already-issued incidents, retain both audit histories and link their IDs.
    overlaps=list(run(db,"""SELECT id FROM cases WHERE connection=:c AND actor=:a AND rule='rolling_bulk'
        AND first_at<=:end AND last_at>=:start ORDER BY first_at,id""",
        c=conn["id"],a=actor,start=start,end=end).scalars())
    case=overlaps[0] if overlaps else digest(json.dumps([conn["id"],actor,"rolling",event["id"]]).encode())[:40]
    metrics=dict(observed_count=peak,threshold=threshold,window_seconds=window,window_start=start,
                 window_end=end,event_ids=[r["event_id"] for r in evidence],related_case_ids=overlaps[1:])
    save_case(db,conn,case,actor,65,[f"{peak} distinct objects changed within {window} seconds (threshold {threshold})"],
              start,end,"rolling_bulk",metrics)
    for r in evidence:
        run(db,"INSERT INTO case_events VALUES (:id,:c,:event) ON CONFLICT DO NOTHING",
            id=case,c=conn["id"],event=r["event_id"])
    if len(overlaps)<=1:
        auto_request(db,conn,cfg,case,event,"rolling_bulk")
    return case
