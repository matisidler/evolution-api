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

    // Configure Prisma Client to use connection pooling and handle deadlocks
    this.$use(async (params: any, next) => {
      // Define operations that should be wrapped in transactions
      const transactionOperations = {
        create: true,
        createMany: true,
        update: true,
        updateMany: true,
        delete: true,
        deleteMany: true,
      };

      // Check if this is a write operation that should be in a transaction
      const shouldUseTransaction = params.action in transactionOperations && !params.runInTransaction; // Prevent recursive transactions

      if (shouldUseTransaction) {
        // Run in transaction with retry logic
        return this.$transaction(async (tx) => {
          // Set a flag to prevent recursive transactions
          params.runInTransaction = true;
          // Replace the client instance with the transaction
          params.client = tx;
          return this.executeWithRetry(() => next(params));
        });
      }

      // For read operations or operations already in a transaction
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

  // Enhanced retry logic with better deadlock handling
  private async executeWithRetry<T>(operation: () => Promise<T>, maxRetries = 3, initialDelay = 100): Promise<T> {
    let attempt = 0;
    let lastError;

    while (attempt < maxRetries) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        attempt++;

        // Check for specific error types
        const isDeadlock =
          error?.message?.includes('deadlock detected') ||
          error?.code === '40P01' || // PostgreSQL deadlock error code
          error?.code === 1213; // MySQL deadlock error code

        const isConnectionError =
          error?.message?.includes('too many clients already') || error?.message?.includes('Connection pool timeout');

        // Retry on deadlocks or connection errors
        if (!isDeadlock && !isConnectionError) {
          throw error;
        }

        if (attempt < maxRetries) {
          // Use a longer delay for deadlocks to allow transactions to complete
          const baseDelay = isDeadlock ? initialDelay * 2 : initialDelay;
          const delay = baseDelay * Math.pow(2, attempt - 1); // Exponential backoff

          this.logger.warn(
            `Database operation failed with ${isDeadlock ? 'deadlock' : 'connection error'}. ` +
              `Retrying (attempt ${attempt}/${maxRetries}) after ${delay}ms...`,
          );

          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError;
  }

  // Helper method for explicit transactions when needed
  public async withTransaction<T>(operation: (tx: PrismaClient) => Promise<T>, maxRetries = 3): Promise<T> {
    return this.executeWithRetry(
      () => this.$transaction(operation),
      maxRetries,
      200, // Start with a longer delay for explicit transactions
    );
  }
}
