const fs = require('fs');
let content = fs.readFileSync('apps/management-console/src/server/routing-rules.integration.test.ts', 'utf-8');
content = content.replace(
  `import { createApp } from './app';`,
  `import { createManagementConsoleApp } from './app';`
);
content = content.replace(
  `let app: ReturnType<typeof createApp>;`,
  `let app: ReturnType<typeof createManagementConsoleApp>;`
);
content = content.replace(
  `app = createApp({`,
  `app = createManagementConsoleApp({`
);
fs.writeFileSync('apps/management-console/src/server/routing-rules.integration.test.ts', content);
