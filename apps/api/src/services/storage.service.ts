import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  base: null,
  timestamp: false,
  transport: process.env.NODE_ENV !== 'production' ? { target: 'pino-pretty' } : undefined,
});

class StorageService {
  private s3Client: S3Client | null = null;
  private bucketName: string | null = null;
  private publicUrl: string | null = null;

  constructor() {
    const endpoint = process.env.S3_ENDPOINT;
    const accessKeyId = process.env.S3_ACCESS_KEY_ID;
    const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
    const bucket = process.env.S3_BUCKET_NAME;
    const region = process.env.S3_REGION || 'us-east-1';
    const forcePathStyle = process.env.S3_FORCE_PATH_STYLE === 'true';
    const s3Url = process.env.S3_PUBLIC_URL;

    if (endpoint && accessKeyId && secretAccessKey && bucket) {
      logger.info(`Inicializando cliente S3 com endpoint: ${endpoint}`);
      this.s3Client = new S3Client({
        endpoint,
        region,
        credentials: {
          accessKeyId,
          secretAccessKey,
        },
        forcePathStyle,
      });
      this.bucketName = bucket;
      this.publicUrl = s3Url || `${endpoint}/${bucket}`;
    } else {
      logger.info('S3/MinIO não configurado. Utilizando armazenamento local como fallback.');
      // Garantir que a pasta pública local de mídia exista
      fs.mkdirSync('public/media', { recursive: true });
    }
  }

  /**
   * Salva um arquivo de mídia no S3/MinIO ou localmente no fallback estático.
   * Retorna a URL pública de acesso para o arquivo.
   */
  async saveFile(buffer: Buffer, filename: string, mimetype: string): Promise<string> {
    const fileExtension = path.extname(filename) || this.getExtensionFromMimetype(mimetype);
    const uniqueFilename = `${crypto.randomUUID()}${fileExtension}`;

    if (this.s3Client && this.bucketName) {
      try {
        const command = new PutObjectCommand({
          Bucket: this.bucketName,
          Key: `media/${uniqueFilename}`,
          Body: buffer,
          ContentType: mimetype,
        });

        await this.s3Client.send(command);
        const url = `${this.publicUrl}/media/${uniqueFilename}`;
        logger.info(`Arquivo salvo no S3: ${url}`);
        return url;
      } catch (err: any) {
        logger.error(err, 'Falha ao fazer upload para o S3. Utilizando armazenamento local como fallback.');
      }
    }

    // Fallback: Armazenamento Local
    try {
      const localDir = 'public/media';
      fs.mkdirSync(localDir, { recursive: true });
      const localPath = path.join(localDir, uniqueFilename);
      fs.writeFileSync(localPath, buffer);

      // Obter porta local e host da API para gerar URL
      const apiHost = process.env.API_PUBLIC_URL || `http://localhost:${process.env.PORT || 3002}`;
      const url = `${apiHost}/public/media/${uniqueFilename}`;
      logger.info(`Arquivo salvo localmente: ${url}`);
      return url;
    } catch (err: any) {
      logger.error(err, 'Falha ao salvar arquivo localmente');
      throw new Error(`Falha ao salvar arquivo: ${err.message}`);
    }
  }

  private getExtensionFromMimetype(mimetype: string): string {
    const parts = mimetype.split('/');
    if (parts.length > 1) {
      const ext = parts[1];
      // Ajustes comuns de extensão
      if (ext === 'jpeg') return '.jpg';
      if (ext === 'svg+xml') return '.svg';
      if (ext.startsWith('ogg')) return '.ogg';
      return `.${ext}`;
    }
    return '.bin';
  }
}

export const storageService = new StorageService();
export default storageService;
