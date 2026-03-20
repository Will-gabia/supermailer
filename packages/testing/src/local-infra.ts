import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageDirectory = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(packageDirectory, '../../..');

export const getLocalInfraPaths = () => ({
  workspaceRoot,
  dockerComposeFile: path.join(workspaceRoot, 'docker-compose.yml'),
  postfixMainCf: path.join(workspaceRoot, 'infra/postfix/config/main.cf'),
  postfixEntrypoint: path.join(workspaceRoot, 'infra/postfix/bin/container-entrypoint.sh'),
});

export const readLocalPostfixConfig = async (): Promise<string> => readFile(getLocalInfraPaths().postfixMainCf, 'utf8');
