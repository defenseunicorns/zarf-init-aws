// This script reads zarf-config.example.yaml, adds the registry type and IAM role ARNs, and writes a new zarf-config.yaml file to be used for running zarf init.
// Execute this script via: `make update-zarf-config REGISTRY_TYPE=public|private`
// Assumes IAM roles already exist and were created via `make create-iam CLUSTER_NAME=my-cluster-name`
import { readFile, writeFile } from "fs";
import { parseDocument } from "yaml";

const exampleFilePath = "../zarf-config.example.yaml";
const updatedFilePath = "../zarf-config.yaml"
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

readFile(exampleFilePath, "utf8", (err, configData) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }

  const parsedConfig = parseDocument(configData);

  // Update Zarf config file values
  if (parsedConfig.has("package") && parsedConfig.get("package").has("deploy")) {
    const deployVars = parsedConfig.get("package").get("deploy").get("set")
    deployVars.set("registry_type", args[0]);
    deployVars.set("ecr_hook_role_arn", args[1]);
    deployVars.set("ecr_credential_helper_role_arn", args[2]);
  }

  const updatedConfig = parsedConfig.toString();

  writeFile(updatedFilePath, updatedConfig, "utf8", (err) => {
    if (err) {
      console.error(err);
      process.exit(1);
    }

    console.log("Zarf config file updated successfully.");
  });
});
