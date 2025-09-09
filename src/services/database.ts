import { PrismaClient } from '@prisma/client';

export class DatabaseService {
  private static instance: DatabaseService;
  private prisma: PrismaClient;
  private isConnected: boolean = false;

  private constructor() {
    this.prisma = new PrismaClient({
      log: ['error', 'warn'],
      errorFormat: 'minimal',
    });
  }

  public static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService();
    }
    return DatabaseService.instance;
  }

  /**
   * Connects to the database with a built-in retry mechanism.
   */
  public async connect(maxRetries = 3, delay = 2000): Promise<boolean> {
    let retries = 0;
    while (retries < maxRetries) {
      try {
        await this.prisma.$connect();
        this.isConnected = true;
        console.log('✅ Database connected successfully');
        return true;
      } catch (error) {
        retries++;
        console.error(`❌ Database connection failed (attempt ${retries}/${maxRetries})`);
        if (retries < maxRetries) {
          console.log(`Retrying in ${delay / 1000} seconds...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    console.error('❌ Could not connect to the database after all retries.');
    this.isConnected = false;
    return false;
  }

  public getPrisma(): PrismaClient {
    return this.prisma;
  }

  /**
   * Returns the last known connection status without performing a live check.
   */
  public getConnectionStatus(): boolean {
    return this.isConnected;
  }

  /**
   * Performs a live query to confirm the database connection is active.
   */
  public async healthCheck(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      this.isConnected = true;
      return true;
    } catch (error) {
      // Don't log here to avoid noise during health checks, the calling function can log if needed.
      this.isConnected = false;
      return false;
    }
  }

  public async disconnect(): Promise<void> {
    if (!this.isConnected) {
      return;
    }
    try {
      await this.prisma.$disconnect();
      this.isConnected = false;
      console.log('✅ Database disconnected successfully');
    } catch (error) {
      console.error('❌ Error disconnecting from database:', error);
    }
  }
}

// IMPORTANT: Your application's startup logic MUST call and await 
// `DatabaseService.getInstance().connect()` before this `db` instance is used.
export const db = DatabaseService.getInstance().getPrisma();