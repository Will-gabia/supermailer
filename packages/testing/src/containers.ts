import { GenericContainer, type StartedTestContainer } from 'testcontainers';

export type TestPostgresContainer = {
  container: StartedTestContainer;
  connectionString: string;
};

export type TestRedisContainer = {
  container: StartedTestContainer;
  redisUrl: string;
};

export const startPostgresContainer = async (): Promise<TestPostgresContainer> => {
  const username = 'postgres';
  const password = 'postgres';
  const database = 'supermailer';
  const container = await new GenericContainer('postgres:16-alpine')
    .withEnvironment({
      POSTGRES_USER: username,
      POSTGRES_PASSWORD: password,
      POSTGRES_DB: database,
    })
    .withExposedPorts(5432)
    .start();

  return {
    container,
    connectionString: `postgres://${username}:${password}@${container.getHost()}:${container.getMappedPort(5432)}/${database}`,
  };
};

export const startRedisContainer = async (): Promise<TestRedisContainer> => {
  const container = await new GenericContainer('redis:7-alpine').withExposedPorts(6379).start();

  return {
    container,
    redisUrl: `redis://${container.getHost()}:${container.getMappedPort(6379)}`,
  };
};

export const waitFor = async <T>(callback: () => Promise<T>, options: { attempts?: number; delayMs?: number } = {}): Promise<T> => {
  const attempts = options.attempts ?? 30;
  const delayMs = options.delayMs ?? 500;

  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await callback();
    } catch (error) {
      lastError = error;

      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  throw lastError;
};
