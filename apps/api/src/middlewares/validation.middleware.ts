import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';

export const validateRequest = (schema: ZodSchema) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = (await schema.parseAsync({
        body: req.body,
        query: req.query,
        params: req.params,
      })) as any;
      // Sobrescrever com os dados sanitizados e parseados
      req.body = parsed.body;
      req.query = parsed.query;
      req.params = parsed.params;
      return next();
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({
          error: 'Erro de validação de dados de entrada.',
          details: error.format(),
        });
      }
      return res.status(500).json({ error: 'Erro interno ao validar dados.' });
    }
  };
};
