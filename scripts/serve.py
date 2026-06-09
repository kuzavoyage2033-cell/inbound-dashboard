import http.server, os, sys
from pathlib import Path
os.chdir(Path(__file__).resolve().parent.parent / 'dashboard')
http.server.test(HandlerClass=http.server.SimpleHTTPRequestHandler, port=3456, bind='127.0.0.1')
