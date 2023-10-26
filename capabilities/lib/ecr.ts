import { K8s, kind, Log } from "pepr";
import { getRepositoryNames } from "./utils";
import { ZarfState, DeployedComponent, ZarfComponent } from "../zarf-types";
import { privateECRURLPattern, ECRPrivate } from "../ecr-private";
import { publicECRURLPattern, ECRPublic } from "../ecr-public";

/**
 * Represents the result of checking whether the Zarf registry is an ECR registry.
 */
interface ECRCheckResult {
  isECR: boolean; // Indicates if the registry is an ECR registry.
  registryURL: string; // The URL of the ECR registry.
}

/**
 * Check whether the configured Zarf registry is an ECR registry.
 * @returns {Promise<ECRCheckResult>} The result of the ECR registry check.
 * @throws {Error} If an error occurs while fetching or parsing the Zarf state secret.
 */
export async function isECRregistry(): Promise<ECRCheckResult> {
  let zarfState: ZarfState;

  // Fetch the Zarf state secret
  try {
    const secret = await K8s(kind.Secret).InNamespace("zarf").Get("zarf-state");
    const secretString = atob(secret.data.state);
    zarfState = JSON.parse(secretString);
  } catch (err) {
    throw new Error(
      `Error: Failed to get secret 'zarf-state' in namespace 'zarf': ${err}`,
    );
  }

  const registryURL = zarfState.registryInfo.address;

  if (zarfState.registryInfo.internalRegistry === true) {
    Log.warn(
      "Zarf is configured to use an internal registry. Skipping creating ECR repos.",
    );
    return { isECR: false, registryURL };
  }

  if (
    publicECRURLPattern.test(registryURL) ||
    privateECRURLPattern.test(registryURL)
  ) {
    return { isECR: true, registryURL };
  }

  return { isECR: false, registryURL };
}

/**
 * Creates ECR repositories for a component in the specified registry.
 *
 * @param {DeployedComponent} deployedComponent - The deployed Zarf component.
 * @param {ZarfComponent} zarfComponent - The corresponding Zarf component.
 * @param {string} registryURL - The URL of the ECR registry where repositories should be created.
 * @returns {Promise<void>}
 */
export async function createRepos(
  deployedComponent: DeployedComponent,
  zarfComponent: ZarfComponent,
  registryURL: string,
): Promise<void> {
  Log.info(
    `Gathering a list of ECR repository names to create for component '${deployedComponent.name}'`,
  );

  const repoNames = getRepositoryNames(zarfComponent.images);

  if (!repoNames) {
    Log.info(
      `No repositories will be created for component '${deployedComponent.name}`,
    );
    return;
  }

  const region = process.env.AWS_REGION;

  // Create repositories for private ECR registry
  if (privateECRURLPattern.test(registryURL)) {
    const accountId = getAccountId(registryURL);
    const ecrPrivate = new ECRPrivate(region);

    Log.info("Attempting to create ECR repositories");
    await ecrPrivate.createRepositories(repoNames, accountId);
  }

  // Create repositories for public ECR registry
  if (publicECRURLPattern.test(registryURL)) {
    const ecrPublic = new ECRPublic(region);

    Log.info("Attempting to create ECR repositories");
    await ecrPublic.createRepositories(repoNames);
  }
}

/**
 * Get the AWS account ID from a private ECR URL.
 * @param {string} url - The private ECR URL.
 * @returns {string} The AWS account ID extracted from the URL.
 * @throws {Error} If the URL format is invalid.
 */
export function getAccountId(url: string): string {
  const matches = url.match(privateECRURLPattern);

  if (!matches || matches.length !== 2) {
    throw new Error(`Invalid private ECR URL format: ${url}`);
  }

  const [, accountId] = matches;

  return accountId;
}
