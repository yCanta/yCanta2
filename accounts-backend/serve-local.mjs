// A local stand-in for the deployed helper: serves Code.gs at http://localhost:8790 for the app's local
// test page, talking to the LOCAL test CouchDB. Sent "emails" are printed here instead of sent.
import { createServer } from 'node:http';
import { loadHelper } from './local-shim.mjs';
import { BASE, pw } from '../couchdb/lib.mjs';

const sentMail = [];
const helper = loadHelper({ COUCH_URL: BASE + '/', MAKER_NAME: 'maker', MAKER_PASS: pw('maker'), APP_URL: 'http://localhost:8765/' }, { sentMail });
createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.end();
  if (req.method === 'GET' && req.url === '/mail') {
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify(sentMail));
  }
  let body = '';
  req.on('data', d => (body += d));
  req.on('end', () => {
    let out;
    try {
      out = helper.sandbox.doPost({ postData: { contents: body } }).text;
    } catch (err) {
      out = JSON.stringify({ ok: false, error: String(err) });
    }
    res.setHeader('Content-Type', 'application/json');
    res.end(out);
  });
}).listen(8790, () => console.log('local accounts helper on http://localhost:8790'));
