import { Capability, Log } from "pepr";
import { refreshECRToken } from "./lib/ecr-token";

/**
 * The ECR Credential Helper Capability refreshes ECR tokens for Zarf image pull secrets.
 */
export const ECRCredentialHelper = new Capability({
  name: "ecr-credential-helper",
  description: "Refreshes ECR tokens for Zarf image pull secrets",
  namespaces: ["pepr-system"],
});

const { OnSchedule } = ECRCredentialHelper;

OnSchedule({
  name: "refresh-ecr-token",
  every: 10,
  unit: "seconds",
  run: async () => {
    Log.info("AM I RUNNING?");
    await refreshECRToken();
  },
});
