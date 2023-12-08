import { K8s, kind, Log } from "pepr";
import { ECRPrivate, privateECRURLPattern } from "../../ecr-private";
import { ECRPublic, publicECRURLPattern } from "../../ecr-public";
import { getSecret, listNamespaces } from "../../lib/k8s";
import { ZarfState } from "../../zarf-types";

const zarfNamespace = "zarf";
const zarfImagePullSecret = "private-registry";
const zarfStateSecret = "zarf-state";
const zarfAgentLabel = "zarf.dev/agent";
const zarfManagedByLabel = "app.kubernetes.io/managed-by";

export async function refreshECRToken(): Promise<void> {
  let authToken: string = "";
  const region = process.env.AWS_REGION;

  if (region === undefined) {
    throw new Error("AWS_REGION environment variable is not defined.");
  }

  try {
    const ecrURL = await getECRURL();

    if (privateECRURLPattern.test(ecrURL)) {
      const ecrPrivate = new ECRPrivate(region);
      authToken = await ecrPrivate.fetchECRToken();
    }

    if (publicECRURLPattern.test(ecrURL)) {
      const ecrPublic = new ECRPublic(region);
      authToken = await ecrPublic.fetchECRToken();
    }

    await updateZarfManagedImageSecrets(ecrURL, authToken);
  } catch (err) {
    throw new Error(
      `unable to update ECR token in Zarf image pull secrets: ${JSON.stringify(
        err,
      )}`,
    );
  }
}

async function getECRURL(): Promise<string> {
  try {
    const secret = await getSecret(zarfNamespace, zarfStateSecret);
    const secretString = atob(secret.data!.state);
    const zarfState: ZarfState = JSON.parse(secretString);
    return zarfState.registryInfo.address;
  } catch (err) {
    throw new Error(
      `unable to get ECR URL from the ${zarfStateSecret} secret: ${JSON.stringify(
        err,
      )}`,
    );
  }
}

async function updateZarfManagedImageSecrets(
  ecrURL: string,
  authToken: string,
): Promise<void> {
  try {
    const namespaces = await listNamespaces();

    for (const ns of namespaces) {
      const registrySecret = await getSecret(
        ns.metadata!.name!,
        zarfImagePullSecret,
      );

      // Check if this is a Zarf managed secret or is in a namespace the Zarf agent will take action in
      if (
        registrySecret.metadata!.labels &&
        (registrySecret.metadata!.labels[zarfManagedByLabel] === "zarf" ||
          (ns.metadata!.labels &&
            ns.metadata!.labels[zarfAgentLabel] !== "skip" &&
            ns.metadata!.labels[zarfAgentLabel] !== "ignore"))
      ) {
        // Update the secret with the new ECR auth token
        const dockerConfigJSON = {
          Auths: {
            [ecrURL]: {
              Auth: authToken,
            },
          },
        };
        const dockerConfigData = btoa(JSON.stringify(dockerConfigJSON));
        registrySecret.data![".dockerconfigjson"] = dockerConfigData;

        const updatedRegistrySecret = await K8s(kind.Secret).Apply(
          {
            metadata: {
              name: zarfImagePullSecret,
              namespace: ns.metadata!.name,
            },
            data: {
              data: registrySecret.data!.data,
            },
          },
          { force: true },
        );

        Log.info(
          `Successfully updated secret '${
            updatedRegistrySecret.metadata!.name
          }' in namespace '${ns.metadata!.name}'`,
        );
      }
    }
  } catch (err) {
    throw new Error(
      `unable to update Zarf image pull secrets: ${JSON.stringify(err)}`,
    );
  }
}
