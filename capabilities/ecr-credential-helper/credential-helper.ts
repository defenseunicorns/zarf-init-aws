import { Capability } from "pepr";
import { ECRPrivate } from "../ecr-private";
import { ECRPublic } from "../ecr-public";
import { isPrivateECRURL, isPublicECRURL } from "../lib/utils";
import { updateZarfManagedImageSecrets } from "../lib/zarf";
import { isECRregistry } from "../lib/ecr";

/**
 * The ECR Credential Helper Capability refreshes ECR tokens for Zarf image pull secrets.
 */
export const ECRCredentialHelper = new Capability({
  name: "ecr-credential-helper",
  description: "Refreshes ECR tokens for Zarf image pull secrets",
  namespaces: ["pepr-system"],
});

const { OnSchedule } = ECRCredentialHelper;

/**
 * Following the same schedule used by the EKS Anywhere CronJob used to refresh ECR tokens.
 * https://github.com/aws/eks-anywhere-packages/blob/492a930b6cc1791208b9ac6da9907331350ace5a/charts/eks-anywhere-packages/templates/cronjob.yaml#L18
 */
OnSchedule({
  name: "refresh-ecr-token",
  every: 5,
  unit: "hours",
  run: async () => {
    await refreshECRToken();
  },
});

async function refreshECRToken(): Promise<void> {
  let authToken: string = "";
  const region = process.env.AWS_REGION;

  if (region === undefined) {
    throw new Error("AWS_REGION environment variable is not defined.");
  }

  try {
    const result = await isECRregistry();

    if (!result.isECR) {
      throw new Error(
        `A valid ECR URL was not found in the Zarf state secret: ${result.registryURL}\n
        Please provide a valid ECR registry URL.\n
        Example: '123456789012.dkr.ecr.us-east-1.amazonaws.com'`,
      );
    }

    if (isPrivateECRURL(result.registryURL)) {
      const ecrPrivate = new ECRPrivate(region);
      authToken = await ecrPrivate.fetchECRToken();
    }

    if (isPublicECRURL(result.registryURL)) {
      const ecrPublic = new ECRPublic(region);
      authToken = await ecrPublic.fetchECRToken();
    }

    await updateZarfManagedImageSecrets(result.registryURL, authToken);
  } catch (err) {
    throw new Error(
      `unable to update ECR token in Zarf image pull secrets: ${err}`,
    );
  }
}
