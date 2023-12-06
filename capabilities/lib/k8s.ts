import { K8s, kind } from "pepr";

export async function getSecret(
  ns: string,
  secretName: string,
): Promise<kind.Secret> {
  return await K8s(kind.Secret).InNamespace(ns).Get(secretName);
}

export async function updateSecret(
  ns: string,
  secretName: string,
  secretData: string,
): Promise<kind.Secret> {
  // Use Server-Side force apply to forcefully take ownership of the package secret data.data field
  return await K8s(kind.Secret).Apply(
    {
      metadata: {
        name: secretName,
        namespace: ns,
      },
      data: {
        data: secretData,
      },
    },
    { force: true },
  );
}

export async function listNamespaces(): Promise<kind.Namespace[]> {
  const ns = await K8s(kind.Namespace).Get();
  return ns.items;
}
