import {
  ECRPUBLICClient,
  CreateRepositoryCommand,
  CreateRepositoryCommandInput,
  DescribeRepositoriesCommand,
  DescribeRepositoriesCommandInput,
} from "@aws-sdk/client-ecr-public";
import { Log } from "pepr";
import { ECRProvider } from "./ecr-provider";

export const publicECRURLPattern =
  /^public\.ecr\.aws\/[a-z][a-z0-9]+(?:[._-][a-z0-9]+)*$/;

export class ECRPublic implements ECRProvider {
  private ecr: ECRPUBLICClient;

  constructor(region: string) {
    this.ecr = new ECRPUBLICClient({ region });
  }

  async listExistingRepositories(repoNames: string[]): Promise<string[]> {
    try {
      const existingRepositories: string[] = [];

      for (const repoName of repoNames) {
        const params: DescribeRepositoriesCommandInput = {
          repositoryNames: [repoName],
        };

        try {
          await this.ecr.send(new DescribeRepositoriesCommand(params));
          Log.info(`Repository '${repoName}' already exists`);
          existingRepositories.push(repoName);
        } catch (err) {
          if (err.name === "RepositoryNotFoundException") {
            // Ignore this error and proceed to the next iteration
            continue;
          } else {
            throw err;
          }
        }
      }
      return existingRepositories;
    } catch (err) {
      Log.error(`Error checking for existing ECR repositories: ${err}`);
      return [];
    }
  }

  async createRepositories(repoNames: string[]): Promise<void> {
    try {
      const existingRepos = await this.listExistingRepositories(repoNames);

      for (const repoName of repoNames) {
        if (!existingRepos?.includes(repoName)) {
          const createParams: CreateRepositoryCommandInput = {
            repositoryName: repoName,
          };

          await this.ecr.send(new CreateRepositoryCommand(createParams));

          Log.info(`ECR Repository '${repoName}' created successfully.`);
        }
      }
    } catch (err) {
      Log.error(`Error creating ECR repositories: ${err}`);
    }
  }
}
