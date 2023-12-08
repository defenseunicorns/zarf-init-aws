import { Capability } from "pepr";
import { ECRPrivate } from "../ecr-private";
import { ECRPublic } from "../ecr-public";
import { isPrivateECRURL, isPublicECRURL } from "../lib/utils";
import { getZarfRegistryURL, updateZarfManagedImageSecrets } from "../lib/zarf";

/**
 * The ECR Credential Helper Capability refreshes ECR tokens for Zarf image pull secrets.
 */
export const ECRCredentialHelper = new Capability({
  name: "ecr-credential-helper",
  description: "Refreshes ECR tokens for Zarf image pull secrets",
  namespaces: ["pepr-system"],
});

const { OnSchedule } = ECRCredentialHelper;

OnSchedule({
  name: "refresh-ecr-token",
  every: 10,
  unit: "seconds",
  run: async () => {
    await refreshECRToken();
  },
});

export async function refreshECRToken(): Promise<void> {
  let authToken: string = "";
  const region = process.env.AWS_REGION;

  if (region === undefined) {
    throw new Error("AWS_REGION environment variable is not defined.");
  }

  try {
    const ecrURL = await getZarfRegistryURL();

    if (isPrivateECRURL(ecrURL)) {
      const ecrPrivate = new ECRPrivate(region);
      authToken = await ecrPrivate.fetchECRToken();
    }

    if (isPublicECRURL(ecrURL)) {
      const ecrPublic = new ECRPublic(region);
      authToken = await ecrPublic.fetchECRToken();
    }

    await updateZarfManagedImageSecrets(ecrURL, authToken);
  } catch (err) {
    throw new Error(
      `unable to update ECR token in Zarf image pull secrets: ${err}`,
    );
  }
}
