// Let the app's local test page (http://localhost:8765) talk to the LOCAL test CouchDB.
import { req, as } from './lib.mjs';

const set = (section, key, value) => req(as('admin'), 'PUT', `/_node/_local/_config/${section}/${key}`, value);
const out = {
  enable: (await set('chttpd', 'enable_cors', 'true')).status,
  origins: (await set('cors', 'origins', 'http://localhost:8765')).status,
  credentials: (await set('cors', 'credentials', 'true')).status,
  methods: (await set('cors', 'methods', 'GET, PUT, POST, HEAD, DELETE')).status,
  headers: (await set('cors', 'headers', 'accept, authorization, content-type, origin, referer')).status,
  // lets _users/_security name the accounts-only admin (see accounts-backend/README.md)
  usersEditable: (await set('couchdb', 'users_db_security_editable', 'true')).status,
};
console.log(out);
