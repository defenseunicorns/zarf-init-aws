import { ZarfState } from "../zarf-types";
import { K8s, kind, Log } from "pepr";
import {
  zarfNamespace,
  zarfStateSecret,
  zarfImagePullSecret,
  managedByLabel,
} from "./constants";

export async function getZarfRegistryURL(): Promise<string> {
  try {
    const secret = await K8s(kind.Secret)
      .InNamespace(zarfNamespace)
      .Get(zarfStateSecret);
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
  try {
    const namespace = await K8s(kind.Namespace).Get();
    const namespaces = namespace.items;

    for (const ns of namespaces) {
      try {
        await K8s(kind.Secret)
          .InNamespace(ns.metadata!.name!)
          .WithLabel(managedByLabel, "zarf")
          .Get(zarfImagePullSecret);
      } catch (err) {
        // Continue checking the next namespace if this namespace doesn't have a "private-registry" secret
        if (JSON.stringify(err).includes("404")) {
          continue;
        }
        throw new Error(JSON.stringify(err));
      }
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
  } catch (err) {
    throw new Error(
      `unable to update Zarf image pull secrets: ${JSON.stringify(err)}`,
    );
  }
}
