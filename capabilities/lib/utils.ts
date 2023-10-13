import { K8s, kind, Log } from "pepr";
import { ZarfState } from "../zarf-types";
import { privateECRURLPattern } from "../ecr-private";
import { publicECRURLPattern } from "../ecr-public";

interface ECRCheckResult {
  isECR: boolean;
  registryURL: string;
}

export async function isECRregistry(): Promise<ECRCheckResult> {
  let zarfState: ZarfState;

  // Fetch the Zarf state secret
  try {
    const secret = await K8s(kind.Secret).InNamespace("zarf").Get("zarf-state");
    const secretString = atob(secret.data.state);
    zarfState = JSON.parse(secretString);
  } catch (err) {
    Log.error(
      `Error: Failed to get package secret 'zarf-state' in namespace 'zarf': ${err}`,
    );
  }

  if (zarfState.registryInfo.internalRegistry === true) {
    Log.warn(
      "Zarf is configured to use an internal registry. Skipping creating ECR repos.",
    );
  }

  const registryURL = zarfState.registryInfo.address;

  if (
    publicECRURLPattern.test(registryURL) ||
    privateECRURLPattern.test(registryURL)
  ) {
    return { isECR: true, registryURL };
  }

  return { isECR: false, registryURL };
}

export function getRepositoryNames(images: string[]): string[] {
  if (!images) {
    return [];
  }

  const repoNames = images.map((image: string) => {
    if (image.includes(":") && !image.includes("@sha256")) {
      image = image.split(":")[0];
    } else if (image.includes("@sha256")) {
      image = image.split("@sha256")[0];
    }

    const firstSlashIndex = image.indexOf("/");
    if (firstSlashIndex !== -1) {
      const substringBeforeSlash = image.substring(0, firstSlashIndex);
      if (substringBeforeSlash.includes(".")) {
        image = image.substring(firstSlashIndex + 1);
      }
    }

    return image;
  });

  return repoNames;
}

export function getAccountId(url: string): string {
  const matches = url.match(privateECRURLPattern);

  if (!matches || matches.length !== 2) {
    throw new Error(`Invalid private ECR URL format: ${url}`);
  }

  const [, accountId] = matches;

  return accountId;
}
