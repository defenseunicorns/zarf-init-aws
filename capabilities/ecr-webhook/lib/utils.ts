import { Log } from "pepr";
import { createRepos } from "./ecr";
import {
  ZarfComponent,
  DeployedComponent,
  DeployedPackage,
} from "../../zarf-types";
import { getSecret, updateSecret } from "../../lib/k8s";

/**
 * Represents a component check result, indicating whether a component is ready for a webhook to execute.
 */
interface componentCheck {
  component: ZarfComponent;
  deployedComponent: DeployedComponent;
  isReady: boolean;
}

/**
 * Checks if a component is ready for a webhook to execute for it.
 * @param {DeployedPackage} deployedPackage - The Zarf deployed package data to check.
 * @param {string} webhookName - The name of the webhook.
 * @returns {componentCheck | null} A component check result or null if no components meet the criteria.
 */
export function componentReadyForWebhook(
  deployedPackage: DeployedPackage,
  webhookName: string,
): componentCheck | null {
  // Create a map of components by name
  const componentsByName = new Map<string, ZarfComponent>();
  deployedPackage.data.components.forEach(component => {
    componentsByName.set(component.name, component);
  });

  for (const deployedComponent of deployedPackage.deployedComponents) {
    const component = componentsByName.get(deployedComponent.name);

    if (!component) {
      continue;
    }
    if (!component.images) {
      continue;
    }
    if (deployedComponent.status !== "Deploying") {
      continue;
    }

    const componentWebhook =
      deployedPackage.componentWebhooks?.[deployedComponent.name]?.[
        webhookName
      ];

    // Check if the component has a webhook running for the current package generation
    if (componentWebhook?.observedGeneration === deployedPackage.generation) {
      Log.debug(
        `The component '${deployedComponent.name}' has already had a webhook executed for it. Not executing another.`,
      );
      continue;
    }

    return {
      component: component,
      deployedComponent: deployedComponent,
      isReady: true,
    };
  }

  return null;
}

/**
 * Get repository names from a list of image references.
 *
 * Extracts the substring between the tag/SHA and the domain name if present.
 *
 * Example:
 *
 * Input: registry.com:8080/repo/name:tag
 *
 * Output: repo/name
 *
 * @param {string[]} images - The list of image references.
 * @returns {string[]} An array of repository names extracted from the image references.
 * @throws {Error} If no image references are provided.
 */
export function getRepositoryNames(images: string[]): string[] {
  if (images.length === 0) {
    throw new Error("Error: expected at least 1 image reference, but got none");
  }

  const repoNames = images.map((image: string) => {
    let repoName = image;

    // Remove the domain name (and port) if present
    const firstSlashIndex = repoName.indexOf("/");
    if (substringFound(firstSlashIndex) === true) {
      // Check if the substring before the first slash '/' contains a dot '.' or a colon ':'
      // indicating a domain or port number. If so, remove that part.
      const substringBeforeSlash = repoName.substring(0, firstSlashIndex);
      if (
        substringBeforeSlash.includes(".") ||
        substringBeforeSlash.includes(":")
      ) {
        repoName = repoName.substring(firstSlashIndex + 1);
      }
    }

    // Remove the hash (SHA) if present
    const hashIndex = repoName.lastIndexOf("@");
    if (substringFound(hashIndex) === true) {
      repoName = repoName.substring(0, hashIndex);
    }

    // Remove the tag if present
    const tagIndex = repoName.lastIndexOf(":");
    if (substringFound(tagIndex) === true) {
      repoName = repoName.substring(0, tagIndex);
    }

    return repoName;
  });

  return repoNames;
}

/**
 * Checks if a substring is found at a specified index.
 *
 * @param {number} index - The index to check. If the index is -1, the substring was not found.
 * @returns {boolean} True if a substring was found at the specified index, false otherwise.
 */
function substringFound(index: number): boolean {
  if (index === -1) {
    return false;
  }
  return true;
}

/**
 * Creates ECR repositories and updates webhook status in a Zarf package secret.
 * @param {DeployedComponent} deployedComponent - The deployed component for which repositories should be created.
 * @param {string} registryURL - The URL of the ECR registry.
 * @param {string} secretName - The name of the secret to update.
 * @param {string} webhookName - The name of the webhook.
 * @param {ZarfComponent} zarfComponent - The corresponding Zarf component.
 */
export async function createReposAndUpdateStatus(
  deployedComponent: DeployedComponent,
  registryURL: string,
  secretName: string,
  webhookName: string,
  zarfComponent: ZarfComponent,
): Promise<void> {
  let webhookStatus = "Succeeded";

  try {
    await createRepos(deployedComponent, zarfComponent, registryURL);
  } catch (err) {
    Log.error(`Failed to create ECR repositories: ${err.message}`);
    webhookStatus = "Failed";
  } finally {
    await updateWebhookStatus(
      secretName,
      deployedComponent.name,
      webhookName,
      webhookStatus,
    );
  }
}

/**
 * Updates the webhook status in a Zarf package secret.
 * @param {string} secretName - The name of the secret to update.
 * @param {string} componentName - The name of the component for which the webhook executed.
 * @param {string} webhookName - The name of the webhook.
 * @param {string} status - The new status for the webhook.
 */
export async function updateWebhookStatus(
  secretName: string,
  componentName: string,
  webhookName: string,
  status: string,
): Promise<void> {
  const ns = "zarf";

  try {
    // Fetch the package secret
    const secret = await getSecret(ns, secretName);

    if (!secret.data) {
      Log.error(
        `Error: Package secret data is undefined for '${secretName}' in namespace '${ns}'.`,
      );
      return;
    }

    const secretString = atob(secret.data.data);
    const deployedPackage: DeployedPackage = JSON.parse(secretString);

    // Update the webhook status if the observedGeneration matches
    const componentWebhook =
      deployedPackage.componentWebhooks?.[componentName]?.[webhookName];
    if (componentWebhook?.observedGeneration === deployedPackage.generation) {
      componentWebhook.status = status;
    }

    secret.data.data = btoa(JSON.stringify(deployedPackage));

    await updateSecret(ns, secretName, secret.data.data);
  } catch (err) {
    Log.error(
      `Error: Failed to update webhook status in package secret '${secretName}' in namespace '${ns}': ${JSON.stringify(
        err,
      )}`,
    );
  }
}
