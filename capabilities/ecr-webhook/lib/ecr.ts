import { Log } from "pepr";
import { getRepositoryNames } from "./utils";
import { DeployedComponent, ZarfComponent } from "../../zarf-types";
import { privateECRURLPattern, ECRPrivate } from "../../ecr-private";
import { ECRPublic } from "../../ecr-public";
import { isPrivateECRURL, isPublicECRURL } from "../../lib/utils";
import { getZarfRegistryURL } from "../../lib/zarf";

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
  try {
    const registryURL = await getZarfRegistryURL();

    if (isPrivateECRURL(registryURL) || isPublicECRURL(registryURL)) {
      return { isECR: true, registryURL };
    }
  } catch (err) {
    throw new Error(
      `unable to determine if Zarf is configured to use an ECR registry: ${JSON.stringify(
        err,
      )}`,
    );
  }

  return { isECR: false, registryURL: "" };
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

  const images = zarfComponent.images;

  if (!images) {
    Log.info(
      `No repositories will be created for component '${deployedComponent.name}`,
    );
    return;
  }

  const repoNames = getRepositoryNames(images);

  if (repoNames.length === 0) {
    Log.info(
      `No repositories will be created for component '${deployedComponent.name}`,
    );
    return;
  }

  const region = process.env.AWS_REGION;

  if (region === undefined) {
    throw new Error("AWS_REGION environment variable is not defined.");
  }

  if (isPrivateECRURL(registryURL)) {
    const accountId = getAccountId(registryURL);
    const ecrPrivate = new ECRPrivate(region);

    Log.info("Attempting to create ECR repositories");
    await ecrPrivate.createRepositories(repoNames, accountId);
  }

  if (isPublicECRURL(registryURL)) {
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
