# Zarf Init Package for AWS - DevSecOps for Air Gap

[![Latest Release](https://img.shields.io/github/v/release/defenseunicorns/zarf-init-aws)](https://github.com/defenseunicorns/zarf-init-aws/releases)
[![Go version](https://img.shields.io/github/go-mod/go-version/defenseunicorns/zarf-init-aws?filename=go.mod)](https://go.dev/)
[![Build Status](https://img.shields.io/github/actions/workflow/status/defenseunicorns/zarf-init-aws/release.yml)](https://github.com/defenseunicorns/zarf-init-aws/actions/workflows/release.yml)
[![OpenSSF Scorecard](https://api.securityscorecards.dev/projects/github.com/defenseunicorns/zarf-init-aws/badge)](https://api.securityscorecards.dev/projects/github.com/defenseunicorns/zarf-init-aws)

Zarf eliminates the [complexity of air gap software delivery](https://www.itopstimes.com/contain/air-gap-kubernetes-considerations-for-running-cloud-native-applications-without-the-cloud/) for Kubernetes clusters and cloud-native workloads using a declarative packaging strategy to support DevSecOps in offline and semi-connected environments.

## 👀 Looking for Zarf?

- [Zarf Website](https://zarf.dev)
- [Zarf Overview](https://docs.zarf.dev/docs/zarf-overview)
- [Zarf Repo](https://github.com/defenseunicorns/Zarf)

## Zarf Init Package for AWS

This repository contains the Zarf init package for AWS that uses the [Amazon Elastic Container Registry (ECR)](https://aws.amazon.com/ecr/) as an OCI registry and deploys onto the [Amazon Elastic Kubernetes Service (EKS)](https://aws.amazon.com/eks/) platform.

## Usage

### Prerequisites

- Zarf (version >= `v0.30.0`)
  - <https://docs.zarf.dev/docs/getting-started>

- Connection to an existing EKS cluster configured with an IAM OIDC identity provider to allow [IRSA](https://docs.aws.amazon.com/eks/latest/userguide/iam-roles-for-service-accounts.html) authentication
  - <https://docs.aws.amazon.com/eks/latest/userguide/enable-iam-roles-for-service-accounts.html>

- AWS CLI configured with the necessary permissions to create ECR repositories and pull/push images

- Create IAM role for the Pepr webhook to be able to list and create ECR repositories
  - Ensure the IAM role has the trust relationship configured correctly to allow Pepr to assume the role
    - Ensure the `sts:AssumeRoleWithWebIdentity` Action is allowed
    - Ensure the Federated Principal has the correct OIDC provider ARN with correct EKS cluster ID
    - This might look something like:

    ```json
    {
        "Version": "2012-10-17",
        "Statement": [
            {
                "Effect": "Allow",
                "Principal": {
                    "Federated": "arn:aws:iam::<AWS_ACCOUNT_ID>:oidc-provider/oidc.eks.<AWS_REGION>.amazonaws.com/id/<EKS_CLUSTER_ID>"
                },
                "Action": "sts:AssumeRoleWithWebIdentity",
                "Condition": {
                    "StringEquals": {
                        "oidc.eks.us-east-1.amazonaws.com/id/<EKS_CLUSTER_ID>:sub": "system:serviceaccount:pepr-system:pepr-b95dbd80-e078-5eb9-aaf3-bcb9567417d0"
                    }
                }
            }
        ]
    }
    ```

    - TODO: list exact ECR API Actions that need to be allowed for this IAM role

- (Optional) Create IAM role for the `zarf-ecr-credential-helper` to be able to fetch new ECR auth tokens and update image pull secrets
  - The credential helper is an optional component and is NOT required to use ECR as an external Zarf registry. It can be used if you are looking for an automated solution for keeping your image pull secrets updated with valid ECR auth tokens. Frequent rotation of ECR tokens in image pull secrets is required because they expire after 12 hours.
  - Ensure the IAM role has the trust relationship configured correctly to allow the `zarf-ecr-credential-helper` to assume the role
    - Ensure the `sts:AssumeRoleWithWebIdentity` Action is allowed
    - Ensure the Federated Principal has the correct OIDC provider ARN with correct EKS cluster ID
    - This might look something like:

    ```json
    {
        "Version": "2012-10-17",
        "Statement": [
            {
                "Effect": "Allow",
                "Principal": {
                    "Federated": "arn:aws:iam::<AWS_ACCOUNT_ID>:oidc-provider/oidc.eks.<AWS_REGION>.amazonaws.com/id/<EKS_CLUSTER_ID>"
                },
                "Action": "sts:AssumeRoleWithWebIdentity",
                "Condition": {
                    "StringEquals": {
                        "oidc.eks.us-east-1.amazonaws.com/id/<EKS_CLUSTER_ID>:sub": "system:serviceaccount:zarf:zarf-ecr-credential-helper"
                    }
                }
            }
        ]
    }
    ```

  - TODO: list exact ECR API Actions that need to be allowed for this IAM role

### Create the Zarf init package

```bash
zarf package create . -a amd64 --confirm
```

### Initialize EKS cluster with Zarf configured to use ECR as external registry

#### Use ***private*** ECR registry

```bash

REGISTRY_TYPE="private"
AWS_REGION="us-east-1"

AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query 'Account' --output text)
REGISTRY_URL="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
ECR_AUTH_TOKEN=$(aws ecr get-login-password --region "${AWS_REGION}")

zarf init \
    --registry-url="${REGISTRY_URL}" \
    --registry-push-username="AWS" \
    --registry-push-password="${ECR_AUTH_TOKEN}" \
    --set=REGISTRY_TYPE="${REGISTRY_TYPE}" \
    --set=AWS_REGION="${AWS_REGION}" \
    --set=ECR_HOOK_ROLE_ARN="arn:aws:iam::${AWS_ACCOUNT_ID}:role/zarf-ecr" \
    --set=ECR_CREDENTIAL_HELPER_ROLE_ARN="arn:aws:iam::${AWS_ACCOUNT_ID}:role/zarf-ecr" \
    --components="zarf-ecr-credential-helper" \ # This component is optional, so we need to specify that we want to deploy it
    -a amd64 \
    -l debug \
    --confirm

```

#### Use ***public*** ECR registry

```bash

REGISTRY_TYPE="public"
AWS_REGION="us-east-1"

AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query 'Account' --output text)
REGISTRY_URL=$(aws ecr-public describe-registries --query 'registries[0].registryUri' --output text)
ECR_AUTH_TOKEN=$(aws ecr-public get-login-password --region "${AWS_REGION}")

zarf init \
    --registry-url="${REGISTRY_URL}" \
    --registry-push-username="AWS" \
    --registry-push-password="${ECR_AUTH_TOKEN}" \
    --set=REGISTRY_TYPE="${REGISTRY_TYPE}" \
    --set=AWS_REGION="${AWS_REGION}" \
    --set=ECR_HOOK_ROLE_ARN="arn:aws:iam::${AWS_ACCOUNT_ID}:role/zarf-ecr" \
    --set=ECR_CREDENTIAL_HELPER_ROLE_ARN="arn:aws:iam::${AWS_ACCOUNT_ID}:role/zarf-ecr" \
    --components="zarf-ecr-credential-helper" \ # This component is optional, so we need to specify that we want to deploy it
    -a amd64 \
    -l debug \
    --confirm

```

### Deploy workloads to the cluster

Now that Zarf is deployed in the EKS cluster and configured to use ECR as as an external registry, let's deploy some workloads to the cluster and verify that Zarf is rewriting our container images to be stored in ECR:

```bash
zarf package deploy oci://example-registry.io/example-repo/example-package:v0.0.1
```
