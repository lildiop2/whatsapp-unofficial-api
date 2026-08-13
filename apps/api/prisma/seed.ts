import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import bcrypt from 'bcryptjs';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL não configurado.');
}

const pool = new pg.Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
}

async function main() {
  console.log('🌱 Iniciando seeding do banco de dados (SaaS Roles & Auth)...');

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

  // 3. Criar Tenant Admin (Administrador da Conta Demo)
  const tenantAdminPassword = await hashPassword('password123');
  const tenantAdmin = await prisma.user.upsert({
    where: { email: 'admin@demo.com' },
    update: {},
    create: {
      email: 'admin@demo.com',
      password: tenantAdminPassword,
      name: 'Admin Demo',
      role: 'TENANT_ADMIN',
      tenantId: tenant.id,
    },
  });
  console.log(`✅ Tenant Admin criado: ${tenantAdmin.email} (senha: password123)`);

  // 4. Criar Super Admin Global (Administrador do SaaS)
  const superAdminPassword = await hashPassword('supersecret123');
  const superAdmin = await prisma.user.upsert({
    where: { email: 'superadmin@zapzap.com' },
    update: {},
    create: {
      email: 'superadmin@zapzap.com',
      password: superAdminPassword,
      name: 'Super Admin Global',
      role: 'SUPER_ADMIN',
      tenantId: null, // Acesso global sem pertencer a um tenant específico
    },
  });
  console.log(`✅ Super Admin criado: ${superAdmin.email} (senha: supersecret123)`);

  console.log(
    '\nUse as credenciais acima para efetuar login no painel ou autenticar requisições JWT.',
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
