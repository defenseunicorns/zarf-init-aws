import {
  ECR,
  CreateRepositoryCommand,
  CreateRepositoryCommandInput,
  DescribeRepositoriesCommand,
  DescribeRepositoriesCommandInput,
  GetAuthorizationTokenCommand,
} from "@aws-sdk/client-ecr";
import { Log } from "pepr";
import { ECRProvider } from "./ecr-provider";

/**
 * Regular expression pattern to match private ECR URLs and extract the AWS account ID.
 *
 * See the Repository registryId pattern for more info:
 * https://docs.aws.amazon.com/AmazonECR/latest/APIReference/API_Repository.html
 *
 * For a more detailed explanation: https://regex101.com/r/crzaI2/1
 * @type {RegExp}
 */
export const privateECRURLPattern: RegExp =
  /^(?<accountId>[0-9]{12})\.dkr\.ecr\..*\.amazonaws\.com$/;

/**
 * Provides methods to interact with private ECR repositories.
 */
export class ECRPrivate implements ECRProvider {
  private ecr: ECR;

  /**
   * Creates an instance of ECRPrivate.
   * @param {string} region - The AWS region in which the ECR repositories are created.
   */
  constructor(region: string) {
    this.ecr = new ECR({ region });
  }

  /**
   * Checks if the provided repository names already exist in the ECR registry and returns them as an array.
   * @param {string[]} repoNames - An array of repository names to check for existence.
   * @returns {Promise<string[]>} An array of repository names that already exist in the ECR registry.
   */
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
      throw new Error(
        `error listing existing private ECR repositories: ${err}`,
      );
    }
  }

  /**
   * Creates ECR repositories for the specified repository names if they do not already exist.
   * @param {string[]} repoNames - An array of repository names to create.
   * @param {string} [accountId] - The AWS account ID where the repositories will be created.
   * @returns {Promise<void>}
   */
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
      throw new Error(`error creating ECR repositories: ${err}`);
    }
  }

  async fetchECRToken(): Promise<string> {
    try {
      const authOutput = await this.ecr.send(
        new GetAuthorizationTokenCommand({}),
      );

      if (authOutput.authorizationData.length === 0) {
        throw new Error("No authorization data received from ECR");
      }

      return authOutput.authorizationData[0].authorizationToken;
    } catch (err) {
      throw new Error(`error fetching ECR token: ${err}`);
    }
  }
}
