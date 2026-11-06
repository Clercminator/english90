"""Local API development only. The frontend preview proxies /api to this server."""
from http.server import HTTPServer
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from api.commerce import handler

HTTPServer(('127.0.0.1',4174),handler).serve_forever()
