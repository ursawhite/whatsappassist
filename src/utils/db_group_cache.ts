import { db } from '../services/database';

export class DatabaseGroupCache {
  private static instance: DatabaseGroupCache;

  private constructor() {}

  public static getInstance(): DatabaseGroupCache {
    if (!DatabaseGroupCache.instance) {
      DatabaseGroupCache.instance = new DatabaseGroupCache();
    }
    return DatabaseGroupCache.instance;
  }

  public async addKnownGroup(groupId: string): Promise<void> {
    try {
      await db.knownGroup.upsert({
        where: { id: groupId },
        update: {}, // No updates needed, just ensure it exists
        create: {
          id: groupId,
        },
      });
    } catch (error) {
      console.error('Error adding known group:', error);
      throw error;
    }
  }

  public async isKnownGroup(groupId: string): Promise<boolean> {
    try {
      const group = await db.knownGroup.findUnique({
        where: { id: groupId },
      });
      return group !== null;
    } catch (error) {
      console.error('Error checking known group:', error);
      return false;
    }
  }

  public async removeKnownGroup(groupId: string): Promise<void> {
    try {
      await db.knownGroup.delete({
        where: { id: groupId },
      });
    } catch (error) {
      console.error('Error removing known group:', error);
      throw error;
    }
  }

  public async getAllKnownGroups(): Promise<string[]> {
    try {
      const groups = await db.knownGroup.findMany({
        select: { id: true },
      });
      return groups.map((group: { id: string }) => group.id);
    } catch (error) {
      console.error('Error getting all known groups:', error);
      return [];
    }
  }

  public async clearAllGroups(): Promise<void> {
    try {
      await db.knownGroup.deleteMany({});
    } catch (error) {
      console.error('Error clearing all groups:', error);
      throw error;
    }
  }

  public async getGroupStats(): Promise<{
    totalGroups: number;
    recentGroups: number;
  }> {
    try {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      
      const [totalGroups, recentGroups] = await Promise.all([
        db.knownGroup.count(),
        db.knownGroup.count({
          where: {
            createdAt: {
              gte: oneDayAgo,
            },
          },
        }),
      ]);

      return {
        totalGroups,
        recentGroups,
      };
    } catch (error) {
      console.error('Error getting group stats:', error);
      return {
        totalGroups: 0,
        recentGroups: 0,
      };
    }
  }
}

// Export functions that match the original API
export const dbGroupCache = DatabaseGroupCache.getInstance();

export const addKnownGroup = (groupId: string): Promise<void> => {
  return dbGroupCache.addKnownGroup(groupId);
};

export const isKnownGroup = (groupId: string): Promise<boolean> => {
  return dbGroupCache.isKnownGroup(groupId);
};
