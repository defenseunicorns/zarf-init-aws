import { getZarfRegistryURL } from "./zarf";
import { isPrivateECRURL } from "./utils";
import { isPublicECRURL } from "./utils";

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
