import { readFile, writeFile } from "fs";
import { parseDocument } from "yaml";

const filePath = "../zarf-config.yaml";
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

readFile(filePath, "utf8", (err, configData) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }

  const parsedConfig = parseDocument(configData);

  // Update Zarf config file values
  if (parsedConfig.has("package") && parsedConfig.get("package").has("deploy")) {
    let deployVars = parsedConfig.get("package").get("deploy").get("set")
    deployVars.set("registry_type", args[0]);
    deployVars.set("ecr_hook_role_arn", args[1]);
    deployVars.set("ecr_credential_helper_role_arn", args[2]);
  }

  const updatedConfig = parsedConfig.toString();

  writeFile(filePath, updatedConfig, "utf8", (err) => {
    if (err) {
      console.error(err);
      process.exit(1);
    }

    console.log("Zarf config file updated successfully.");
  });
});
