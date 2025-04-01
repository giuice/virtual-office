// src/repositories/interfaces/IUserRepository.ts
import { User, UserRole } from '@/types/database';

export interface IUserRepository {
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  findByFirebaseUid(firebaseUid: string): Promise<User | null>;
  findByCompany(companyId: string): Promise<User[]>;
  create(userData: Omit<User, 'id' | 'createdAt' | 'lastActive'>): Promise<User>;
  update(id: string, updates: Partial<User>): Promise<User | null>;
  deleteById(id: string): Promise<boolean>; // Returns true if successful
  // Add other methods as needed, e.g., search, count, etc.
  updateCompanyAssociation(userId: string, companyId: string | null): Promise<User | null>;
}