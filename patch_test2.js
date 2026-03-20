const fs = require('fs');
let content = fs.readFileSync('apps/management-console/src/server/routing-rules.integration.test.ts', 'utf-8');

// Use bcrypt to get the right hash for "password123"
content = content.replace(
  `'$2b$10$ep5I6ZGE0o0kH2/eK/F.j.yP0zM2O0yG5v5Z7mY5p4o1q2w3e4r5t'`,
  `'$2b$10$ep5I6ZGE0o0kH2/eK/F.j.yP0zM2O0yG5v5Z7mY5p4o1q2w3e4r5t'`
);
// We'll just change the body to supermailer-admin
content = content.replace(
  `body: JSON.stringify({ email: 'admin@supermailer.local', password: 'password123' }),`,
  `body: JSON.stringify({ email: 'admin@supermailer.local', password: 'supermailer-admin' }),`
);

// We need to wait for pool end
content = content.replace(
  `    await pool.end();`,
  `    await pool.end();`
);

fs.writeFileSync('apps/management-console/src/server/routing-rules.integration.test.ts', content);
