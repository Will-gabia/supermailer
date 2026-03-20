const fs = require('fs');
let content = fs.readFileSync('apps/management-console/src/client/App.tsx', 'utf-8');
content = content.replace(
  `      } finally {
        
      }`,
  ``
);
fs.writeFileSync('apps/management-console/src/client/App.tsx', content);
