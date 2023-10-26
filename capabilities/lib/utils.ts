import { K8s, kind, Log, a } from "pepr";
import { createRepos } from "./ecr";
import {
  ZarfComponent,
  DeployedComponent,
  DeployedPackage,
} from "../zarf-types";

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

  let secret: a.Secret;
  let secretString: string;
  let deployedPackage: DeployedPackage;
  let manuallyDecoded = false;

  // Fetch the package secret
  try {
    secret = await K8s(kind.Secret).InNamespace(ns).Get(secretName);
  } catch (err) {
    Log.error(
      `Error: Failed to get package secret '${secretName}' in namespace '${ns}': ${JSON.stringify(
        err,
      )}`,
    );
  }

  try {
    secretString = atob(secret.data.data);
    manuallyDecoded = true;
  } catch (err) {
    secretString = secret.data.data;
  }

  try {
    deployedPackage = JSON.parse(secretString);
  } catch (err) {
    Log.error(`Failed to parse the secret data: ${err.message}`);
  }

  const componentWebhook =
    deployedPackage.componentWebhooks?.[componentName][webhookName];

  // Update the webhook status if the observedGeneration matches
  if (componentWebhook?.observedGeneration === deployedPackage.generation) {
    componentWebhook.status = status;
    deployedPackage.componentWebhooks[componentName][webhookName] =
      componentWebhook;
  }

  if (manuallyDecoded === true) {
    secret.data.data = btoa(JSON.stringify(deployedPackage));
  } else {
    secret.data.data = JSON.stringify(deployedPackage);
  }

  // Use Server-Side force apply to forcefully take ownership of the package secret data.data field
  // Doing a Server-Side apply without the force option will result in a FieldManagerConflict error due to Zarf owning the object.
  try {
    await K8s(kind.Secret).Apply(
      {
        metadata: {
          name: secretName,
          namespace: ns,
        },
        data: {
          data: secret.data.data,
        },
      },
      { force: true },
    );
  } catch (err) {
    throw new Error(
      `Error: Failed to update package secret '${secretName}' in namespace '${ns}': ${JSON.stringify(
        err,
      )}`,
    );
  }
}
