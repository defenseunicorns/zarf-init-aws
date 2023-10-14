import { readFile, writeFile } from "fs";

const filePath = "../zarf-config.toml";

// Config file keys
const registryType = "registry_type";
const ecrWebhookRoleArn = "ecr_hook_role_arn";
const ecrCredentialHelperRoleArn = "ecr_credential_helper_role_arn";

const args = process.argv.slice(2);

// Validate registry type input
if (args[0] !== "private" && args[0] !== "public") {
  console.log("First argument must be either 'public' or 'private' to specify ECR registry type");
  process.exit(1);
}

// Validate role ARN inputs
if (!args[1]) {
  console.log("Second argument must be an IAM role ARN for the ECR webhook");
  process.exit(1);
}
if (!args[2]) {
  console.log("Third argument must be an IAM role ARN for the ECR credential helper");
  process.exit(1);
}

readFile(filePath, "utf8", (err, data) => {
  if (err) {
    console.error(err);
    return;
  }

  // Update Zarf config file values
  const pattern = `\\s*=\\s*['"].*['"]`

  let updatedConfig = data;

  updatedConfig = updatedConfig.replace(
    new RegExp(`${registryType}${pattern}`),
    `${registryType} = '${args[0]}'`
  );

  updatedConfig = updatedConfig.replace(
    new RegExp(`${ecrWebhookRoleArn}${pattern}`),
    `${ecrWebhookRoleArn} = '${args[1]}'`
  );

  updatedConfig = updatedConfig.replace(
    new RegExp(`${ecrCredentialHelperRoleArn}${pattern}`),
    `${ecrCredentialHelperRoleArn} = '${args[2]}'`
  );

  writeFile(filePath, updatedConfig, "utf8", (err) => {
    if (err) {
      console.error(err);
      return;
    }
    console.log("Zarf config file updated successfully.");
  });
});
