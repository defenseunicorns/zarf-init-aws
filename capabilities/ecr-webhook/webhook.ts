import { Capability, Log, a } from "pepr";
import { isECRregistry } from "./lib/ecr";
import { DeployedPackage } from "../zarf-types";
import {
  createReposAndUpdateStatus,
  componentReadyForWebhook,
} from "./lib/utils";

/**
 * The ECR Capability creates ECR repositories for a Zarf managed ECR registry
 */
export const ECRhook = new Capability({
  name: "ecr",
  description: "Create ECR repositories for a Zarf managed ECR registry",
  namespaces: ["pepr-system", "zarf"],
});

const { When } = ECRhook;

When(a.Secret)
  .IsCreatedOrUpdated()
  .InNamespace("zarf")
  .WithLabel("package-deploy-info")
  .Mutate(async request => {
    const result = await isECRregistry();

    if (!result.isECR) {
      throw new Error(
        `Error: A valid ECR URL was not found in the Zarf state secret: ${result.registryURL}\n
        Please provide a valid ECR registry URL.\n
        Example: '123456789012.dkr.ecr.us-east-1.amazonaws.com'`,
      );
    }

    const webhookName = "ecr-webhook";
    const secret = request.Raw;

    let manuallyDecoded = false;
    let secretString: string;

    if (!secret.data) {
      throw new Error(
        `Error: the '.data' field for package secret ${secret.metadata?.name} is undefined.`,
      );
    }

    try {
      secretString = atob(secret.data.data);
      manuallyDecoded = true;
    } catch (err) {
      secretString = secret.data.data;
    }

    const deployedPackage: DeployedPackage = JSON.parse(secretString);

    const componentRes = componentReadyForWebhook(deployedPackage, webhookName);
    if (!componentRes) {
      Log.debug(
        "There are no Zarf package components ready for the ECR webhook to execute. Skipping...",
      );
      return;
    }

    if (!deployedPackage.componentWebhooks) {
      deployedPackage.componentWebhooks = {};
    }

    // Update the webhook status noting that the webhook is running for this component.
    // Zarf will pause deploying this component until the webhook status is not "Running".
    deployedPackage.componentWebhooks[componentRes.deployedComponent.name] = {
      "ecr-webhook": {
        name: webhookName,
        status: "Running",
        observedGeneration: deployedPackage.generation,
      },
    };

    createReposAndUpdateStatus(
      componentRes.deployedComponent,
      result.registryURL,
      secret.metadata?.name as string,
      webhookName,
      componentRes.component,
    );

    if (manuallyDecoded === true) {
      secret.data.data = btoa(JSON.stringify(deployedPackage));
    } else {
      secret.data.data = JSON.stringify(deployedPackage);
    }
  });
