import { K8s, kind } from "pepr";

export async function getSecret(
  ns: string,
  secretName: string,
): Promise<kind.Secret> {
  return await K8s(kind.Secret).InNamespace(ns).Get(secretName);
}

export async function listNamespaces(): Promise<kind.Namespace[]> {
  const ns = await K8s(kind.Namespace).Get();
  return ns.items;
}
