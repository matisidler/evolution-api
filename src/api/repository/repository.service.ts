import { ConfigService } from '@config/env.config';
import { Logger } from '@config/logger.config';
import { PrismaClient } from '@prisma/client';

export class Query<T> {
  where?: T;
  sort?: 'asc' | 'desc';
  page?: number;
  offset?: number;
}

export class PrismaRepository extends PrismaClient {
  constructor(private readonly configService: ConfigService) {
    super({
      datasources: {
        db: {
          url: process.env.DATABASE_CONNECTION_URI,
        },
      },
      log: ['error', 'warn'],
    });

    // Configure Prisma Client to use connection pooling
    this.$use(async (params, next) => {
      return this.executeWithRetry(() => next(params));
    });
  }

  private readonly logger = new Logger('PrismaRepository');

  public async onModuleInit() {
    try {
      await this.$connect();
      this.logger.info('Repository:Prisma - ON');
    } catch (error) {
      this.logger.error(`Failed to connect to database: ${error}`);
      throw error;
    }
  }

  public async onModuleDestroy() {
    try {
      await this.$disconnect();
      this.logger.warn('Repository:Prisma - OFF');
    } catch (error) {
      this.logger.error(`Error disconnecting from database: ${error}`);
    }
  }

  // Helper method to safely execute database operations with retries
  private async executeWithRetry<T>(operation: () => Promise<T>, maxRetries = 3, initialDelay = 100): Promise<T> {
    let attempt = 0;
    let lastError;

    while (attempt < maxRetries) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        attempt++;

        // Only retry on connection-related errors
        if (
          !error?.message?.includes('too many clients already') &&
          !error?.message?.includes('Connection pool timeout')
        ) {
          throw error;
        }

        if (attempt < maxRetries) {
          const delay = initialDelay * Math.pow(2, attempt - 1);
          await new Promise((resolve) => setTimeout(resolve, delay));
          this.logger.warn(`Retrying database operation after connection error (attempt ${attempt}/${maxRetries})`);
        }
      }
    }

    throw lastError;
  }
}
