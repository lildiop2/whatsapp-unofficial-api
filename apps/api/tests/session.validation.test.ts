import '../src/load-env.js';
import { describe, it, expect } from 'vitest';
import { createSessionSchema, updateSessionSchema } from '../src/validators/session.validator.js';

describe('Session Input Validation Schemas', () => {
  describe('createSessionSchema', () => {
    it('deve aceitar dados validos com phone, webhookEvents e botConfig', () => {
      const payload = {
        body: {
          name: 'Atendimento',
          phone: '5511999999999',
          webhookUrl: 'https://webhook.site/test',
          webhookEvents: ['message', 'connection'],
          botEnabled: true,
          botConfig: {
            type: 'simple',
            rules: [{ trigger: 'oi', response: 'Olá' }],
          },
        },
      };

      const result = createSessionSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it('deve rejeitar phone com caracteres nao numericos', () => {
      const payload = {
        body: {
          name: 'Atendimento',
          phone: '+55 (11) 99999-9999', // com formato invalido
        },
      };

      const result = createSessionSchema.safeParse(payload);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('telefone');
      }
    });

    it('deve rejeitar webhookUrl com formato invalido', () => {
      const payload = {
        body: {
          name: 'Atendimento',
          webhookUrl: 'url-invalida',
        },
      };

      const result = createSessionSchema.safeParse(payload);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('webhookUrl');
      }
    });
  });

  describe('updateSessionSchema', () => {
    it('deve aceitar payload parcial de atualizacao', () => {
      const payload = {
        params: { id: 'financeiro-bot' },
        body: {
          botEnabled: false,
          webhookEvents: ['all'],
        },
      };

      const result = updateSessionSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });
  });
});
