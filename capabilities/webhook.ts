import { Capability, Log, a, k8s } from "pepr";

import {
  isECRregistry,
  getRepositoryNames,
  getAccountId,
  ECRProviderImpl,
  ECRPublicProviderImpl,
  privateECR,
  publicECR,
} from "./ecr";

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
  .Mutate(async request => {
    const result = await isECRregistry();

    if (!result.isECR) {
      throw new Error(
        "A valid ECR URL was not found in the Zarf state secret: '" +
          result.registryURL +
          "'\nPlease provide a valid ECR registry URL.\nExample: '123456789012.dkr.ecr.us-east-1.amazonaws.com'",
      );
    }

    const secret = request.Raw;
    let secretData: DeployedPackage;
    let secretString: string;
    let manuallyDecoded = false;

    // Pepr does not decode/encode non-ASCII characters in secret data: https://github.com/defenseunicorns/pepr/issues/219
    try {
      secretString = atob(secret.data.data);
      manuallyDecoded = true;
    } catch (err) {
      secretString = secret.data.data;
    }

    // Parse the secret object
    try {
      secretData = JSON.parse(secretString);
    } catch (err) {
      throw new Error("Failed to parse the secret.data.data: " + err);
    }

    for (const deployedComponent of secretData?.deployedComponents ?? []) {
      for (const component of secretData?.data.components ?? []) {
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
            secretData.componentWebhooks?.[deployedComponent?.name]?.[
              webhookName
            ];

          // Check if the component has a webhook running for the current package generation
          if (componentWebhook?.observedGeneration === secretData.generation) {
            Log.debug(
              "The component " +
                deployedComponent.name +
                " has already had a webhook executed for it. Not executing another.",
            );
          } else {
            // Seed the componentWebhooks map/object
            if (!secretData.componentWebhooks) {
              secretData.componentWebhooks = {};
            }

            // Update the secret noting that the webhook is running for this component
            secretData.componentWebhooks[deployedComponent.name] = {
              "ecr-webhook": {
                name: webhookName,
                status: "Running",
                observedGeneration: secretData.generation,
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
      secret.data.data = btoa(JSON.stringify(secretData));
    } else {
      secret.data.data = JSON.stringify(secretData);
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
  if (privateECR.test(registryURL)) {
    const accountId = getAccountId(registryURL);
    const ecr = new ECRProviderImpl(region);

    Log.info("Attempting to create ECR repositories");
    await ecr.createRepositories(repoNames, accountId);
  }

  // Create repositories for public ECR registry
  if (publicECR.test(registryURL)) {
    const ecrPublic = new ECRPublicProviderImpl(region);

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
  // Configure the k8s api client
  const kc = new k8s.KubeConfig();
  kc.loadFromDefault();
  const k8sCoreApi = kc.makeApiClient(k8s.CoreV1Api);

  try {
    const response = await k8sCoreApi.readNamespacedSecret(secretName, "zarf");
    const v1Secret = response.body;

    const secretString = atob(v1Secret.data.data);
    const secretData = JSON.parse(secretString);

    // Update the webhook status if the observedGeneration matches
    const componentWebhook =
      secretData.componentWebhooks[componentName]?.[webhookName];

    if (componentWebhook?.observedGeneration === secretData.generation) {
      componentWebhook.status = status;
      secretData.componentWebhooks[componentName][webhookName] =
        componentWebhook;
    }

    v1Secret.data.data = btoa(JSON.stringify(secretData));

    // Patch the secret back to the cluster
    await k8sCoreApi.patchNamespacedSecret(
      secretName,
      "zarf",
      v1Secret,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      {
        headers: {
          "Content-Type": "application/strategic-merge-patch+json",
        },
      },
    );
  } catch (err) {
    Log.error(
      `Unable to update the package secret webhook status: ${JSON.stringify(
        err,
      )}`,
    );
  }
}
