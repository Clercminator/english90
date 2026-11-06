from http.server import BaseHTTPRequestHandler
import json
from urllib.parse import urlparse, parse_qs
from server.commerce import dispatch, Problem


class handler(BaseHTTPRequestHandler):
    def log_message(self, *_args):
        pass

    def do_GET(self):
        self.handle_request()

    def do_POST(self):
        self.handle_request()

    def handle_request(self):
        try:
            size=int(self.headers.get('content-length','0'))
            if size<0 or size>65536:
                raise Problem('request_too_large',413)
            query=parse_qs(urlparse(self.path).query)
            action=query.get('action',['config'])[0]
            result=dispatch(self.command,action,{k.lower():v for k,v in self.headers.items()},query,
                            self.rfile.read(size),self.headers.get('x-real-ip',self.client_address[0]))
            status=200
        except Problem as error:
            status,result=error.status,{'error':error.code}
        except (ValueError,TypeError,KeyError):
            status,result=400,{'error':'invalid_request'}
        except Exception:
            status,result=503,{'error':'temporarily_unavailable'}
        content=json.dumps(result).encode()
        self.send_response(status)
        self.send_header('Content-Type','application/json; charset=utf-8')
        self.send_header('Cache-Control','no-store, private')
        self.send_header('Referrer-Policy','no-referrer')
        self.send_header('X-Content-Type-Options','nosniff')
        self.send_header('Content-Length',str(len(content)))
        self.end_headers()
        self.wfile.write(content)
