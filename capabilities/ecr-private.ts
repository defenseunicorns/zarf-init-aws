import {
  ECR,
  CreateRepositoryCommand,
  CreateRepositoryCommandInput,
  DescribeRepositoriesCommand,
  DescribeRepositoriesCommandInput,
} from "@aws-sdk/client-ecr";
import { Log } from "pepr";
import { ECRProvider } from "./ecr-provider";

export const privateECRURLPattern =
  /^(?<accountId>[0-9]{12})\.dkr\.ecr\..*\.amazonaws\.com$/;

export class ECRPrivate implements ECRProvider {
  private ecr: ECR;

  constructor(region: string) {
    this.ecr = new ECR({ region });
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

  async createRepositories(
    repoNames: string[],
    accountId?: string,
  ): Promise<void> {
    try {
      const existingRepos = await this.listExistingRepositories(repoNames);

      for (const repoName of repoNames) {
        if (!existingRepos?.includes(repoName)) {
          const createParams: CreateRepositoryCommandInput = {
            repositoryName: repoName,
            registryId: accountId,
            imageTagMutability: "IMMUTABLE",
            imageScanningConfiguration: {
              scanOnPush: true,
            },
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
