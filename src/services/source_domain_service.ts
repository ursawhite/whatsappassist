import { db } from './database';

export interface SourceDomain {
  id: string;
  domain: string;
  name: string;
  description?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export class SourceDomainService {
  /**
   * Get all active source domains
   */
  static async getActiveDomains(): Promise<string[]> {
    try {
      const domains = await db.sourceDomain.findMany({
        where: { isActive: true },
        select: { domain: true }
      });
      
      return domains.map(d => d.domain);
    } catch (error) {
      console.error('❌ Error fetching active source domains:', error);
      // Return default domains as fallback
      return ["*.kompas.com", "*.kompas.tv", "*.kompas.co.id", "*.kompas.id"];
    }
  }

  /**
   * Get all source domains with full details
   */
  static async getAllDomains(): Promise<SourceDomain[]> {
    try {
      return await db.sourceDomain.findMany({
        orderBy: { createdAt: 'desc' }
      });
    } catch (error) {
      console.error('❌ Error fetching all source domains:', error);
      return [];
    }
  }

  /**
   * Add a new source domain
   */
  static async addDomain(domain: string, name: string, description?: string): Promise<SourceDomain> {
    try {
      return await db.sourceDomain.create({
        data: {
          domain,
          name,
          description
        }
      });
    } catch (error) {
      console.error('❌ Error adding source domain:', error);
      throw error;
    }
  }

  /**
   * Update a source domain
   */
  static async updateDomain(id: string, data: Partial<Omit<SourceDomain, 'id' | 'createdAt' | 'updatedAt'>>): Promise<SourceDomain> {
    try {
      return await db.sourceDomain.update({
        where: { id },
        data
      });
    } catch (error) {
      console.error('❌ Error updating source domain:', error);
      throw error;
    }
  }

  /**
   * Delete a source domain
   */
  static async deleteDomain(id: string): Promise<void> {
    try {
      await db.sourceDomain.delete({
        where: { id }
      });
    } catch (error) {
      console.error('❌ Error deleting source domain:', error);
      throw error;
    }
  }

  /**
   * Toggle domain active status
   */
  static async toggleDomainStatus(id: string): Promise<SourceDomain> {
    try {
      const domain = await db.sourceDomain.findUnique({
        where: { id }
      });

      if (!domain) {
        throw new Error('Domain not found');
      }

      return await db.sourceDomain.update({
        where: { id },
        data: { isActive: !domain.isActive }
      });
    } catch (error) {
      console.error('❌ Error toggling domain status:', error);
      throw error;
    }
  }

  /**
   * Initialize default domains if none exist
   */
  static async initializeDefaultDomains(): Promise<void> {
    try {
      const count = await db.sourceDomain.count();
      
      if (count === 0) {
        const defaultDomains = [
          { domain: "*.kompas.com", name: "Kompas", description: "Kompas.com - Media berita terpercaya" },
          { domain: "*.kompas.tv", name: "Kompas TV", description: "Kompas TV - Media berita terpercaya" },
          { domain: "*.kompas.co.id", name: "Kompas.co.id", description: "Kompas.co.id - Media berita terpercaya" },
          { domain: "*.kompas.id", name: "Kompas.id", description: "Kompas.id - Media berita terpercaya" }
        ];

        for (const defaultDomain of defaultDomains) {
          await db.sourceDomain.create({
            data: defaultDomain
          });
        }

        console.log('✅ Default source domains initialized');
      }
    } catch (error) {
      console.error('❌ Error initializing default domains:', error);
    }
  }
}
