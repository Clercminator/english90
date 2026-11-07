"""Owner-only recovery client. Credentials come from environment, never arguments."""
import argparse
import os
from uuid import UUID
import requests

parser=argparse.ArgumentParser(description='Inspect/retry English90 fulfillment without creating a charge.')
parser.add_argument('command',choices=['inspect','retry','resend','run'])
parser.add_argument('--order',help='Internal UUID; required except for run')
args=parser.parse_args()
if args.command!='run':
    try: args.order=str(UUID(args.order))
    except (ValueError,TypeError,AttributeError): parser.error('--order must be an internal UUID')
if args.command=='inspect':
    url=(os.environ.get('SUPABASE_PROJECT_URL') or os.environ['SUPABASE_URL']).rstrip('/')+'/rest/v1/guide_deliveries'
    response=requests.get(url,params={'order_id':'eq.'+args.order,'select':'order_id,status,attempts,last_error_code,sent_at,delivered_at,lease_until'},
          headers={'apikey':os.environ['SUPABASE_SECRET_KEY'],'Authorization':'Bearer '+os.environ['SUPABASE_SECRET_KEY']},timeout=30)
else:
    response=requests.post(os.environ['SITE_URL'].rstrip('/')+'/api/commerce?action=operations',
        headers={'Authorization':'Bearer '+os.environ['CRON_SECRET'],
                 **({'x-vercel-protection-bypass':os.environ['VERCEL_AUTOMATION_BYPASS_SECRET']}
                    if os.environ.get('VERCEL_AUTOMATION_BYPASS_SECRET') else {})},
        json={} if args.command=='run' else {'order':args.order,'retry':args.command=='retry','resend':args.command=='resend'},timeout=300)
if not response.ok:
    raise SystemExit(f'Operation failed (HTTP {response.status_code}). Inspect provider/owner logs without printing credentials.')
print(response.text)
