import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL não configurado.');
}

const pool = new pg.Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('🌱 Iniciando seeding do banco de dados (SaaS Multi-Tenancy)...');

  // 1. Criar Tenant Padrão
  const tenant = await prisma.tenant.upsert({
    where: { id: 'default-tenant-uuid' },
    update: {},
    create: {
      id: 'default-tenant-uuid',
      name: 'Cliente Demo SaaS',
    },
  });

  console.log(`✅ Tenant criado: ${tenant.name} (${tenant.id})`);

  // 2. Criar Chave de API de Desenvolvimento
  const apiKey = await prisma.apiKey.upsert({
    where: { key: 'zap_default_dev_key_123' },
    update: {},
    create: {
      key: 'zap_default_dev_key_123',
      name: 'Chave de Dev Local',
      tenantId: tenant.id,
    },
  });

  console.log(`✅ Chave de API de Teste criada: ${apiKey.key} (${apiKey.name})`);
  console.log(
    '\nUse o header "Authorization: Bearer zap_default_dev_key_123" ou "x-api-key: zap_default_dev_key_123" para autenticar suas requisições REST.',
  );
}

main()
  .catch(e => {
    console.error('❌ Erro no seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
