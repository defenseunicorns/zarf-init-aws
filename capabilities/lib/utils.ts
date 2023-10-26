import { K8s, kind, Log } from "pepr";
import { ZarfState } from "../zarf-types";
import { privateECRURLPattern } from "../ecr-private";
import { publicECRURLPattern } from "../ecr-public";

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
 * Get repository names from a list of image references.
 * @param {string[]} images - The list of image references.
 * @returns {string[]} An array of repository names extracted from the image references.
 * @throws {Error} If no image references are provided.
 */
export function getRepositoryNames(images: string[]): string[] {
  if (images.length === 0) {
    throw new Error("Error: expected at least 1 image reference, but got none");
  }

  const repoNames = images.map((image: string) => {
    if (image.includes(":") && !image.includes("@sha256")) {
      image = image.split(":")[0];
    } else if (image.includes("@sha256")) {
      image = image.split("@sha256")[0];
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
