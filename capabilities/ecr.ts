import {
  ECR,
  CreateRepositoryCommand,
  CreateRepositoryCommandInput,
  DescribeRepositoriesCommand,
  DescribeRepositoriesCommandInput,
} from "@aws-sdk/client-ecr";

import {
  ECRPUBLICClient,
  CreateRepositoryCommand as CreatePublicRepositoryCommand,
  CreateRepositoryCommandInput as CreatePublicRepositoryCommandInput,
  DescribeRepositoriesCommand as DescribePublicRepositoriesCommand,
  DescribeRepositoriesCommandInput as DescribePublicRepositoriesCommandInput,
} from "@aws-sdk/client-ecr-public";

import { k8s, Log } from "pepr";

import { ZarfState } from "./zarf-types";

interface ECRCheckResult {
  isECR: boolean;
  registryURL: string;
}

export const publicECR =
  /^public\.ecr\.aws\/[a-z][a-z0-9]+(?:[._-][a-z0-9]+)*$/;

export const privateECR =
  /^(?<accountId>[0-9]{12})\.dkr\.ecr\..*\.amazonaws\.com$/;

interface ECRProvider {
  listExistingRepositories(repoNames: string[]): Promise<string[]>;
  createRepositories(repoNames: string[], accountId?: string): Promise<void>;
}

export class ECRProviderImpl implements ECRProvider {
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

export class ECRPublicProviderImpl implements ECRProvider {
  private ecrPublic: ECRPUBLICClient;

  constructor(region: string) {
    this.ecrPublic = new ECRPUBLICClient({ region });
  }

  async listExistingRepositories(repoNames: string[]): Promise<string[]> {
    try {
      const existingRepositories: string[] = [];

      for (const repoName of repoNames) {
        const params: DescribePublicRepositoriesCommandInput = {
          repositoryNames: [repoName],
        };

        try {
          await this.ecrPublic.send(
            new DescribePublicRepositoriesCommand(params),
          );
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
          const createParams: CreatePublicRepositoryCommandInput = {
            repositoryName: repoName,
          };

          await this.ecrPublic.send(
            new CreatePublicRepositoryCommand(createParams),
          );

          Log.info(`ECR Repository '${repoName}' created successfully.`);
        }
      }
    } catch (err) {
      Log.error(`Error creating ECR repositories: ${err}`);
    }
  }
}

export async function isECRregistry(): Promise<ECRCheckResult> {
  let secretData: ZarfState;
  let secretString: string;

  const kc = new k8s.KubeConfig();
  kc.loadFromDefault();
  const k8sCoreApi = kc.makeApiClient(k8s.CoreV1Api);

  const response = await k8sCoreApi.readNamespacedSecret("zarf-state", "zarf");
  const v1Secret = response.body;

  try {
    secretString = atob(v1Secret.data.state);
  } catch (err) {
    secretString = v1Secret.data.state;
  }

  try {
    secretData = JSON.parse(secretString);
  } catch (err) {
    Log.error(`failed to parse the secret.data.state: ${err}`);
  }

  if (secretData?.registryInfo?.internalRegistry === true) {
    Log.warn(
      "Zarf is configured to use an internal registry. Skipping creating ECR repos.",
    );
  }

  const registryURL = secretData?.registryInfo?.address;

  if (publicECR.test(registryURL) || privateECR.test(registryURL)) {
    return { isECR: true, registryURL };
  }

  return { isECR: false, registryURL };
}

export function getRepositoryNames(images: string[]): string[] {
  if (!images) {
    return [];
  }

  const repoNames = images.map((image: string) => {
    if (image.includes(":")) {
      image = image.split(":")[0];
    }

    const firstSlashIndex = image.indexOf("/");
    if (firstSlashIndex !== -1) {
      const substringBeforeSlash = image.substring(0, firstSlashIndex);
      if (substringBeforeSlash.includes(".")) {
        image = image.substring(firstSlashIndex + 1);
      }
    }

    return image;
  });

  return repoNames;
}

export function getAccountId(url: string): string {
  const matches = url.match(privateECR);

  if (!matches || matches.length !== 2) {
    throw new Error(`Invalid private ECR URL format: ${url}`);
  }

  const [, accountId] = matches;

  return accountId;
}
