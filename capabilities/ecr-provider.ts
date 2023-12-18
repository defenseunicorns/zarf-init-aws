/**
 * Represents an interface for interacting with ECR registries.
 */
export interface ECRProvider {
  listExistingRepositories(repoNames: string[]): Promise<string[]>;
  createRepositories(repoNames: string[], accountId?: string): Promise<void>;
  fetchECRToken(): Promise<string>;
}
