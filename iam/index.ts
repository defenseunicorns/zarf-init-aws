import { Output } from "@pulumi/pulumi";
import { join } from "path";
import {
  createPolicy,
  createRole,
  attachPolicyToRole,
  getAccountId,
  getClusterId,
} from "./utils";

// Resource names
const roleName = "ecr-role";
const policyName = "ecr-policy";

// Filepaths for IAM resources
const jsonFilesDir = join(__dirname, "json");
const policyPath = join(jsonFilesDir, "ecr-policy.json");
const rolePath = join(jsonFilesDir, "ecr-role.json");

const main = async () => {
  const clusterId = await getClusterId();
  const accountId = await getAccountId();

  const policy = createPolicy(policyPath, policyName);

  const role = createRole(rolePath, roleName, accountId, clusterId as string);

  attachPolicyToRole(
    "ecr-policy-attachment",
    role.name as unknown as string,
    policy.arn as unknown as string,
  );

  return role.arn;
};

const outputs = main();

export const roleArn: Promise<Output<string>> = outputs.then(result => result);
