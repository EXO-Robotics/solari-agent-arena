#!/usr/bin/env python3
"""Send Python to the official Blender MCP TCP bridge on localhost:9876."""

from __future__ import annotations

import json
import socket
import sys
from pathlib import Path

HOST = "127.0.0.1"
PORT = 9876


def execute(code: str, timeout: float = 120.0) -> dict:
    payload = (json.dumps({"type": "execute", "code": code, "strict_json": True}) + "\0").encode("utf-8")
    with socket.create_connection((HOST, PORT), timeout=timeout) as conn:
        conn.sendall(payload)
        chunks = bytearray()
        while b"\0" not in chunks:
            piece = conn.recv(65536)
            if not piece:
                break
            chunks.extend(piece)
    raw = bytes(chunks).split(b"\0", 1)[0]
    if not raw:
        raise RuntimeError("Blender MCP returned an empty response. Is the add-on listening on 9876?")
    return json.loads(raw.decode("utf-8"))


def main() -> int:
    if len(sys.argv) < 2:
        print("usage: mcp_exec.py <python-file>", file=sys.stderr)
        return 2
    path = Path(sys.argv[1]).resolve()
    code = path.read_text()
    project_root = path.parents[2]
    code = f"AION_PROJECT_ROOT = {str(project_root)!r}\n" + code
    if "result =" not in code and "result=" not in code:
        code += "\nresult = {\"ok\": True}\n"
    response = execute(code)
    json.dump(response, sys.stdout, indent=2)
    print()
    return 0 if response.get("status") == "ok" else 1


if __name__ == "__main__":
    raise SystemExit(main())
