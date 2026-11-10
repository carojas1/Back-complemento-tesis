// A connection reset in the middle of a query fails that query and nothing else: the process stays up. Goes through a proxy that cuts the socket for real,
// the way a dropped link to Neon does (ECONNRESET): an unhandled 'error' event here would bring the whole test run down.
import { createServer, connect, Server, Socket } from 'node:net';
import { PrismaService } from '../src/prisma/prisma.service';

let proxy: Server;
let prisma: PrismaService;
const open = new Set<Socket>();

beforeAll(async () => {
  const target = new URL(process.env.DATABASE_URL!);
  proxy = createServer((client) => {
    const server = connect(Number(target.port || 5432), target.hostname);
    open.add(client);
    client.on('close', () => {
      open.delete(client);
      server.destroy();
    });
    server.on('close', () => client.destroy());
    client.on('error', () => server.destroy());
    server.on('error', () => client.destroy());
    client.pipe(server);
    server.pipe(client);
  });
  await new Promise<void>((resolve) => proxy.listen(0, '127.0.0.1', resolve));

  const { port } = proxy.address() as { port: number };
  const original = process.env.DATABASE_URL;
  process.env.DATABASE_URL = Object.assign(new URL(original!), { hostname: '127.0.0.1', port: String(port) }).toString();
  prisma = new PrismaService();
  process.env.DATABASE_URL = original;
});

afterAll(async () => {
  await prisma.$disconnect();
  open.forEach((socket) => socket.destroy());
  await new Promise((resolve) => proxy.close(resolve));
});

it('the query fails, the process stays up and the next query works', async () => {
  expect(await prisma.$queryRaw`SELECT 1 AS one`).toEqual([{ one: 1 }]);

  const sleeping = prisma.$queryRaw`SELECT pg_sleep(30)`.then(
    () => 'finished',
    () => 'failed',
  );
  await new Promise((resolve) => setTimeout(resolve, 300));
  expect(open.size).toBeGreaterThan(0);
  open.forEach((socket) => socket.resetAndDestroy());

  expect(await sleeping).toBe('failed');
  expect(await prisma.$queryRaw`SELECT 1 AS one`).toEqual([{ one: 1 }]);
});
