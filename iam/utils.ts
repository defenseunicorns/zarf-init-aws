import { iam, getCallerIdentity } from "@pulumi/aws";
import { getCluster } from "@pulumi/aws/eks";
import { readFileSync } from "fs";
import { compile } from "handlebars";

export function createPolicy(file: string, policyName: string) {
  const policy = readFileSync(file, "utf8");
  return new iam.Policy(policyName, {
    policy: policy,
  });
}

export function createRole(
  file: string,
  roleName: string,
  accountId: string,
  clusterId: string,
) {
  const placeholderRole = readFileSync(file, "utf8");
  const template = compile(placeholderRole)
  
  const updatedPlaceholders = {
    AWS_ACCOUNT_ID: accountId,
    EKS_CLUSTER_ID: clusterId,
  }

  const updatedRole = template(updatedPlaceholders)

  return new iam.Role(roleName, {
    assumeRolePolicy: updatedRole,
  });
}

export function attachPolicyToRole(
  name: string,
  roleName: string,
  policyArn: string,
) {
  return new iam.RolePolicyAttachment(name, {
    role: roleName,
    policyArn: policyArn,
  });
}

export async function getClusterId(): Promise<string> {
  const clusterName = process.env.CLUSTER_NAME;

  if (!clusterName) {
    throw new Error(
      "CLUSTER_NAME environment variable must be set with a valid EKS cluster name",
    );
  }

  try {
    const cluster = await getCluster({
      name: clusterName,
    });
    const oidcIssuer = cluster.identities[0].oidcs[0].issuer;
    const clusterId = oidcIssuer.split("/").pop();
    if (clusterId === undefined) {
      throw new Error("EKS cluster OIDC provider ID is undefined");
    }
    return clusterId;
  } catch (err) {
    throw new Error(`Failed to get EKS cluster info: ${err}`);
  }
}

export async function getAccountId(): Promise<string> {
  const callerId = await getCallerIdentity({});
  return callerId.accountId;
}
