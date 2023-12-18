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
    const namespaces = (
      await K8s(kind.Namespace).WithLabel(managedByLabel, "zarf").Get()
    ).items;

    for (const ns of namespaces) {
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
    throw new Error(`unable to update Zarf image pull secrets: ${err}`);
  }
}

export async function updateZarfStateSecret(authToken: string): Promise<void> {
  try {
    const stateSecret = await K8s(kind.Secret)
      .InNamespace(zarfNamespace)
      .Get(zarfStateSecret);
    const secretString = atob(stateSecret.data!.state);
    const oldZarfState: ZarfState = JSON.parse(secretString);

    const updatedZarfState: ZarfState = {
      ...oldZarfState,
      registryInfo: {
        ...oldZarfState.registryInfo,
        pushPassword: authToken,
        pullPassword: authToken,
      },
    };

    const updatedStateSecret = await K8s(kind.Secret).Apply(
      {
        metadata: {
          name: zarfStateSecret,
          namespace: zarfNamespace,
        },
        data: {
          ["state"]: btoa(JSON.stringify(updatedZarfState)),
        },
      },
      { force: true },
    );

    Log.info(
      `Successfully updated secret '${
        updatedStateSecret.metadata!.name
      }' in namespace '${zarfNamespace}'`,
    );
  } catch (err) {
    throw new Error(`unable to update the Zarf state secret: ${err}`);
  }
}
