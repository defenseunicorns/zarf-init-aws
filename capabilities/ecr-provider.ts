export interface ECRProvider {
  listExistingRepositories(repoNames: string[]): Promise<string[]>;
  createRepositories(repoNames: string[], accountId?: string): Promise<void>;
}
