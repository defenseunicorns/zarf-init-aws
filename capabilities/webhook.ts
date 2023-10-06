import { Capability, Log, a, K8s, kind } from "pepr";
import { isECRregistry, getAccountId, getRepositoryNames } from "./lib/utils";
import { ECRPublic, publicECRURLPattern } from "./ecr-public";
import { ECRPrivate, privateECRURLPattern } from "./ecr-private";
import {
  DeployedPackage,
  DeployedComponent,
  ZarfComponent,
} from "./zarf-types";

/**
 * The ECR Capability creates ECR repositories for a Zarf managed ECR registry
 */
export const ECRhook = new Capability({
  name: "ecr",
  description: "Create ECR repositories for a Zarf managed ECR registry",
  namespaces: ["pepr-system"],
});

const webhookName = "ecr-webhook";

const { When } = ECRhook;

When(a.Secret)
  .IsCreatedOrUpdated()
  .InNamespace("zarf")
  .WithLabel("package-deploy-info")
  .Watch(async secret => {
    const result = await isECRregistry();

    if (!result.isECR) {
      throw new Error(
        "A valid ECR URL was not found in the Zarf state secret: '" +
          result.registryURL +
          "'\nPlease provide a valid ECR registry URL.\nExample: '123456789012.dkr.ecr.us-east-1.amazonaws.com'",
      );
    }

    let secretString: string;
    let manuallyDecoded = false;

    // Pepr does not decode/encode non-ASCII characters in secret data: https://github.com/defenseunicorns/pepr/issues/219
    try {
      secretString = atob(secret.data.data);
      manuallyDecoded = true;
    } catch (err) {
      secretString = secret.data.data;
    }

    const deployedPackage: DeployedPackage = JSON.parse(secretString);

    for (const deployedComponent of deployedPackage.deployedComponents) {
      for (const component of deployedPackage.data.components) {
        if (
          deployedComponent.name === component.name &&
          deployedComponent.status === "Deploying" &&
          component.images
        ) {
          Log.info(
            "The component " +
              deployedComponent.name +
              " is currently deploying",
          );

          const componentWebhook =
            deployedPackage.componentWebhooks?.[deployedComponent.name]?.[
              webhookName
            ];

          // Check if the component has a webhook running for the current package generation
          if (
            componentWebhook.observedGeneration === deployedPackage.generation
          ) {
            Log.debug(
              "The component " +
                deployedComponent.name +
                " has already had a webhook executed for it. Not executing another.",
            );
          } else {
            // Seed the componentWebhooks map/object
            if (!deployedPackage.componentWebhooks) {
              deployedPackage.componentWebhooks = {};
            }

            // Update the secret noting that the webhook is running for this component
            deployedPackage.componentWebhooks[deployedComponent.name] = {
              "ecr-webhook": {
                name: webhookName,
                status: "Running",
                observedGeneration: deployedPackage.generation,
              },
            };

            createReposAndUpdateStatus(
              deployedComponent,
              result.registryURL,
              secret.metadata.name,
              component,
            );
          }
        }
      }
    }

    if (manuallyDecoded === true) {
      secret.data.data = btoa(JSON.stringify(deployedPackage));
    } else {
      secret.data.data = JSON.stringify(deployedPackage);
    }
  });

// Create ECR repositories and update webhook status in Zarf package secret
async function createReposAndUpdateStatus(
  deployedComponent: DeployedComponent,
  registryURL: string,
  secretName: string,
  zarfComponent: ZarfComponent,
): Promise<void> {
  let webhookStatus = "Succeeded";

  try {
    await createRepos(deployedComponent, zarfComponent, registryURL);
  } catch (err) {
    if (err.message.includes("Error creating ECR repositories")) {
      Log.error(`Failed to create ECR repositories: ${err.message}`);
      webhookStatus = "Failed";
    }
  } finally {
    await updateWebhookStatus(
      secretName,
      deployedComponent.name,
      webhookStatus,
    );
  }
}

async function createRepos(
  deployedComponent: DeployedComponent,
  zarfComponent: ZarfComponent,
  registryURL: string,
) {
  Log.info(
    `Gathering a list of ECR repository names to create for component '${deployedComponent?.name}'`,
  );

  const repoNames = getRepositoryNames(zarfComponent?.images);

  if (!repoNames) {
    Log.info(
      `No repositories will be created for component '${deployedComponent?.name}`,
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

// updateWebhookStatus updates the webhook status in the Zarf package secret
async function updateWebhookStatus(
  secretName: string,
  componentName: string,
  status: string,
): Promise<void> {
  const ns = "zarf";

  let secret: a.Secret;
  let secretString: string;
  let deployedPackage: DeployedPackage;

  // Fetch the package secret
  try {
    secret = await K8s(kind.Secret).InNamespace(ns).Get(secretName);
    secretString = atob(secret.data.data);
    deployedPackage = JSON.parse(secretString);
  } catch (err) {
    Log.error(
      `Error: Failed to get package secret '${secretName}' in namespace '${ns}': ${err}`,
    );
  }

  const componentWebhook =
    deployedPackage.componentWebhooks[componentName]?.[webhookName];

  // Update the webhook status if the observedGeneration matches
  if (componentWebhook?.observedGeneration === deployedPackage.generation) {
    componentWebhook.status = status;
    deployedPackage.componentWebhooks[componentName][webhookName] =
      componentWebhook;
  }

  // Update the package secret
  try {
    secret.data.data = btoa(JSON.stringify(deployedPackage));

    await K8s(kind.Secret).Apply({
      metadata: {
        name: secretName,
        namespace: ns,
      },
      data: {
        data: secret.data.data,
      },
    });
  } catch (err) {
    Log.error(
      `Error: Failed to update package secret '${secretName}' in namespace '${ns}': ${err}`,
    );
  }
}
