import { Output } from "@pulumi/pulumi";
import {
  createPolicy,
  createRole,
  attachPolicyToRole,
  getAccountId,
  getClusterId,
} from "./utils";

// Resource names
const webhookRoleName = "ecr-webhook-role";
const webhookPolicyName = "ecr-webhook-policy";
const credentialHelperRoleName = "ecr-credential-helper-role";
const credentialHelperPolicyName = "ecr-credential-helper-policy";

// File names for IAM resources
const webhookPolicyPath = "ecr-webhook-policy.json";
const webhookRolePath = "ecr-webhook-role.json";
const credentialHelperPolicyPath = "ecr-credential-helper-policy.json";
const credentialHelperRolePath = "ecr-credential-helper-role.json";

const main = async () => {
  const clusterId = await getClusterId();
  const accountId = await getAccountId();

  // Create webhook IAM policy
  const webhookPolicy = createPolicy(webhookPolicyPath, webhookPolicyName);

  // Create webhook IAM role
  const webhookRole = createRole(
    webhookRolePath,
    webhookRoleName,
    accountId,
    clusterId as string,
  );

  // Create credential helper IAM policy
  const credentialHelperPolicy = createPolicy(
    credentialHelperPolicyPath,
    credentialHelperPolicyName,
  );

  // Create credential helper IAM role
  const credentialHelperRole = createRole(
    credentialHelperRolePath,
    credentialHelperRoleName,
    accountId,
    clusterId as string,
  );

  // Attach webhook policy to role
  attachPolicyToRole(
    "ecr-webhook-policy-attachment",
    webhookRole.name as unknown as string,
    webhookPolicy.arn as unknown as string,
  );

  // Attach credential helper policy to role
  attachPolicyToRole(
    "ecr-credential-helper-policy-attachment",
    credentialHelperRole.name as unknown as string,
    credentialHelperPolicy.arn as unknown as string,
  );

  const webhookRoleArn = webhookRole.arn;
  const credentialHelperRoleArn = credentialHelperRole.arn;

  return [webhookRoleArn, credentialHelperRoleArn];
};

const outputs = main();

export const webhookRoleArn: Promise<Output<string>> = outputs.then(
  result => result[0],
);
export const credentialHelperRoleArn: Promise<Output<string>> = outputs.then(
  result => result[1],
);
