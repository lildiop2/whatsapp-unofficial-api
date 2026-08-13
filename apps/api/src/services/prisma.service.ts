import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { tenantLocalStorage } from './tenant-context.service.js';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);

const basePrisma = new PrismaClient({ adapter });

export const prisma = basePrisma.$extends({
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        const multiTenantModels = ['User', 'WhatsappSession'];

        if (multiTenantModels.includes(model)) {
          const context = tenantLocalStorage.getStore();
          const tenantId = context?.tenantId;

          if (tenantId) {
            const anyArgs = args as any;
            anyArgs.where = anyArgs.where || {};

            // Para queries de findUnique, reescrevemos sob o capô como findFirst
            // de modo que o Prisma nos permita filtrar por tenantId (que não é campo único no schema)
            if (operation === 'findUnique') {
              anyArgs.where.tenantId = tenantId;
              return (basePrisma as any)[model.charAt(0).toLowerCase() + model.slice(1)].findFirst(
                anyArgs,
              );
            }

            // Filtragem padrão de leitura/escrita baseada em "where"
            if (
              [
                'findFirst',
                'findMany',
                'update',
                'updateMany',
                'delete',
                'deleteMany',
                'count',
                'aggregate',
                'groupBy',
              ].includes(operation)
            ) {
              anyArgs.where.tenantId = tenantId;
            }

            // Injeção automática de tenantId nas criações
            if (operation === 'create') {
              anyArgs.data = anyArgs.data || {};
              anyArgs.data.tenantId = tenantId;
            } else if (operation === 'createMany') {
              if (Array.isArray(anyArgs.data)) {
                anyArgs.data = anyArgs.data.map((item: any) => ({
                  ...item,
                  tenantId,
                }));
              } else {
                anyArgs.data = anyArgs.data || {};
                anyArgs.data.tenantId = tenantId;
              }
            } else if (operation === 'upsert') {
              anyArgs.create = anyArgs.create || {};
              anyArgs.create.tenantId = tenantId;
              anyArgs.update = anyArgs.update || {};
              anyArgs.update.tenantId = tenantId;
            }
          }
        }

        return query(args);
      },
    },
  },
});

export default prisma;
