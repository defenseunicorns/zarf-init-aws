import {
  ECRPUBLICClient,
  CreateRepositoryCommand,
  CreateRepositoryCommandInput,
  DescribeRepositoriesCommand,
  DescribeRepositoriesCommandInput,
  GetAuthorizationTokenCommand,
} from "@aws-sdk/client-ecr-public";
import { Log } from "pepr";
import { ECRProvider } from "./ecr-provider";

/**
 * Regular expression pattern to match public ECR URLs.
 *
 * See the RegistryAlias name pattern for more info:
 * https://docs.aws.amazon.com/AmazonECRPublic/latest/APIReference/API_RegistryAlias.html
 *
 * For a more detailed explanation: https://regex101.com/r/1WsT03/1
 * @type {RegExp}
 */
export const publicECRURLPattern: RegExp =
  /^public\.ecr\.aws\/[a-z][a-z0-9]+(?:[._-][a-z0-9]+)*$/;

/**
 * Provides methods to interact with public ECR repositories.
 */
export class ECRPublic implements ECRProvider {
  private ecr: ECRPUBLICClient;

  /**
   * Creates an instance of ECRPublic.
   * @param {string} region - The AWS region in which the public ECR repositories are created.
   */
  constructor(region: string) {
    this.ecr = new ECRPUBLICClient({ region });
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
      Log.error(`Error checking for existing public ECR repositories: ${err}`);
      return [];
    }
  }

  /**
   * Creates public ECR repositories for the specified repository names if they do not already exist.
   * @param {string[]} repoNames - An array of repository names to create.
   * @returns {Promise<void>}
   */
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
      Log.error(`Error creating public ECR repositories: ${err}`);
    }
  }

  async fetchECRToken(): Promise<string> {
    try {
      const authOutput = await this.ecr.send(
        new GetAuthorizationTokenCommand({}),
      );

      if (!authOutput.authorizationData) {
        throw new Error("No authorization data received from ECR");
      }

      return authOutput.authorizationData.authorizationToken;
    } catch (error) {
      Log.error(`Error calling GetAuthorizationTokenCommand(): ${error}`);
      return "";
    }
  }
}
