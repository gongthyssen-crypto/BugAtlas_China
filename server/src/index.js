import { buildApp } from './app.js';
import { createConfig } from './config.js';

const config = createConfig();
const app = await buildApp({ config });

try {
  await app.listen({ host: config.host, port: config.port });
  app.log.info({ address: `http://${config.host}:${config.port}`, mode: config.demoMode ? 'demo' : 'live' }, '虫宿博物志本地服务已启动');
} catch (error) {
  app.log.error(error);
  process.exit(1);
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    await app.close();
    process.exit(0);
  });
}
