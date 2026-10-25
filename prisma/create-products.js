const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
async function main() {
  for (const p of [{ pname: 'X', price: '100.00', quantity: 100 }, { pname: 'Y', price: '250.00', quantity: 100 }]) {
    const old = await db.product.findFirst({ where: { pname: p.pname }, orderBy: { pid: 'asc' } });
    if (old) await db.product.update({ where: { pid: old.pid }, data: { price: p.price, quantity: p.quantity } });
    else await db.product.create({ data: p });
  }
  console.log('Products X and Y are ready.');
}
main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => db.$disconnect());
