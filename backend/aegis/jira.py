"""Sync a redacted case summary to one Jira Cloud issue per incident."""
import base64
import http.client
import json
import os
from urllib.parse import quote

from .cloud import ReviewRequired


def sync(cfg, case, stage, known_key=None):
    settings=cfg["jira"]
    secret=os.getenv(settings["token_env"],"")
    if not secret:
        raise ReviewRequired("Jira credential unavailable")
    auth=base64.b64encode(f"{settings['email']}:{secret}".encode()).decode()
    connection=http.client.HTTPSConnection(settings["host"],timeout=8)
    def request(method,path,body):
        connection.request(method,"/rest/api/3/"+path,json.dumps(body),
                           {"Authorization":"Basic "+auth,"Content-Type":"application/json","Accept":"application/json"})
        response=connection.getresponse()
        data=response.read()
        if response.status not in (200,201,204):
            raise RuntimeError("Jira delivery failed")
        return json.loads(data) if data else {}
    label="aegis-"+case
    try:
        search={"issues":[{"key":known_key}]} if known_key else request("POST","search/jql",{"jql":f'project = "{settings["project"]}" AND labels = "{label}"',
                                           "maxResults":2,"fields":["key"]})
        issues=search["issues"]
        if len(issues)>1:
            raise ReviewRequired("More than one Jira issue matches the incident")
        url=os.getenv("AEGIS_PUBLIC_URL","http://localhost:3000").rstrip("/")+"/?case="+case
        description={"type":"doc","version":1,"content":[{"type":"paragraph","content":[
            {"type":"text","text":f"AEGIS incident {case} · {stage} · {url}"}]}]}
        fields={"summary":f"AEGIS incident {case}","description":description}
        if issues:
            key=issues[0]["key"]
            request("PUT","issue/"+quote(key,safe=""),{"fields":fields})
        else:
            fields.update(project={"key":settings["project"]},issuetype={"id":settings["issue_type_id"]},labels=[label])
            try:
                key=request("POST","issue",{"fields":fields})["key"]
            except Exception as exc:
                raise ReviewRequired("Verify Jira creation before retrying this delivery") from exc
        return key
    finally:
        connection.close()
