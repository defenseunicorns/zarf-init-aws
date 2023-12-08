import { getSecret, listNamespaces } from "./k8s";
import { ZarfState } from "../zarf-types";
import { K8s, kind, Log } from "pepr";

const zarfNamespace = "zarf";
const zarfStateSecret = "zarf-state";
const zarfImagePullSecret = "private-registry";
const zarfAgentLabel = "zarf.dev/agent";
const zarfManagedByLabel = "app.kubernetes.io/managed-by";

export async function getZarfRegistryURL(): Promise<string> {
  try {
    const secret = await getSecret(zarfNamespace, zarfStateSecret);
    const secretString = atob(secret.data!.state);
    const zarfState: ZarfState = JSON.parse(secretString);
    return zarfState.registryInfo.address;
  } catch (err) {
    throw new Error(
      `unable to get registry URL from the ${zarfStateSecret} secret: ${JSON.stringify(
        err,
      )}`,
    );
  }
}

export async function updateZarfManagedImageSecrets(
  ecrURL: string,
  authToken: string,
): Promise<void> {
  let registrySecret: kind.Secret | undefined;

  try {
    const namespaces = await listNamespaces();

    for (const ns of namespaces) {
      try {
        registrySecret = await getSecret(
          ns.metadata!.name!,
          zarfImagePullSecret,
        );
      } catch (err) {
        // Continue checking the next namespace if this namespace doesn't have a "private-registry" secret
        if (JSON.stringify(err).includes("404")) {
          continue;
        }
        throw new Error(JSON.stringify(err));
      }

      // Check if this is a Zarf managed secret or is in a namespace the Zarf agent will take action in
      if (
        registrySecret!.metadata!.labels &&
        (registrySecret!.metadata!.labels[zarfManagedByLabel] === "zarf" ||
          (ns.metadata!.labels &&
            ns.metadata!.labels[zarfAgentLabel] !== "skip" &&
            ns.metadata!.labels[zarfAgentLabel] !== "ignore"))
      ) {
        // Update the secret with the new ECR auth token
        const dockerConfigJSON = {
          auths: {
            [ecrURL]: {
              auth: authToken,
            },
          },
        };
        const dockerConfigData = btoa(JSON.stringify(dockerConfigJSON));
        const updatedRegistrySecret = await K8s(kind.Secret).Apply(
          {
            metadata: {
              name: zarfImagePullSecret,
              namespace: ns.metadata!.name,
            },
            data: {
              [".dockerconfigjson"]: dockerConfigData,
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