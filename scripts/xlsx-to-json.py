#!/usr/bin/env python3
"""Converte a planilha do Google Ads (exportada como .xlsx) em raw/google.json.

Uso: python3 scripts/xlsx-to-json.py raw/google.xlsx raw/google.json
Só biblioteca padrão. Cada aba vira uma lista de objetos com o cabeçalho da linha 1 como chave.
"""
import json
import re
import sys
import zipfile
import xml.etree.ElementTree as ET

NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
      "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships"}


def col_index(ref):
    letters = re.match(r"[A-Z]+", ref).group(0)
    n = 0
    for ch in letters:
        n = n * 26 + ord(ch) - 64
    return n - 1


def main(src, dst):
    z = zipfile.ZipFile(src)
    shared = []
    if "xl/sharedStrings.xml" in z.namelist():
        for si in ET.fromstring(z.read("xl/sharedStrings.xml")).findall("m:si", NS):
            shared.append("".join(t.text or "" for t in si.iter("{%s}t" % NS["m"])))
    wb = ET.fromstring(z.read("xl/workbook.xml"))
    rels = ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))
    target = {r.get("Id"): r.get("Target") for r in rels}
    out = {}
    for sh in wb.find("m:sheets", NS):
        name = sh.get("name")
        path = target[sh.get("{%s}id" % NS["r"])].lstrip("/")
        path = path if path.startswith("xl/") else "xl/" + path
        rows = []
        for row in ET.fromstring(z.read(path)).iter("{%s}row" % NS["m"]):
            vals = {}
            for c in row.findall("m:c", NS):
                t, v = c.get("t"), c.find("m:v", NS)
                if t == "s" and v is not None:
                    val = shared[int(v.text)]
                elif t == "inlineStr":
                    val = "".join(x.text or "" for x in c.iter("{%s}t" % NS["m"]))
                elif v is not None:
                    try:
                        f = float(v.text)
                        val = int(f) if f.is_integer() else f
                    except ValueError:
                        val = v.text
                else:
                    val = ""
                vals[col_index(c.get("r"))] = val
            if vals:
                rows.append([vals.get(i, "") for i in range(max(vals) + 1)])
        if not rows:
            out[name] = []
            continue
        head = [str(h) for h in rows[0]]
        out[name] = [{h: (r[i] if i < len(r) else "") for i, h in enumerate(head) if h} for r in rows[1:]]
    json.dump(out, open(dst, "w"), ensure_ascii=False)
    print("google.json: " + ", ".join("%s=%d" % (k, len(v)) for k, v in out.items()))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
