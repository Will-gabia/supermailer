sed -i.bak "s/import { createUlid } from '@supermailer\/contracts';/const createUniqueSuffix = (): string => \`\${Date.now().toString(36)}\${Math.random().toString(36).slice(2, 10)}\`;/g" e2e/template-management.spec.ts
sed -i.bak "s/createUlid()/createUniqueSuffix()/g" e2e/template-management.spec.ts
