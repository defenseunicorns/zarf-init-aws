import { Log } from "pepr";
import { getRepositoryNames } from "./utils";
import { DeployedComponent, ZarfComponent } from "../../zarf-types";
import { privateECRURLPattern, ECRPrivate } from "../../ecr-private";
import { ECRPublic } from "../../ecr-public";
import { isPrivateECRURL, isPublicECRURL } from "../../lib/utils";
import { isECRregistry } from "../../lib/ecr";

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
  const result = await isECRregistry();

  if (!result.isECR) {
    throw new Error(
      `A valid ECR URL was not found in the Zarf state secret: ${result.registryURL}\n
      Please provide a valid ECR registry URL.\n
      Example: '123456789012.dkr.ecr.us-east-1.amazonaws.com'`,
    );
  }

  Log.info(
    `Gathering a list of ECR repository names to create for component '${deployedComponent.name}'`,
  );

  const images = zarfComponent.images;
  const repoNames = getRepositoryNames(images!);

  if (repoNames.length === 0) {
    throw new Error(
      `unable to extract valid repository names from images (${images}) for component '${deployedComponent.name}'`,
    );
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
