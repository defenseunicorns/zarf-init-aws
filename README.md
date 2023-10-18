# Zarf Init Package for AWS - DevSecOps for Air Gap

[![Latest Release](https://img.shields.io/github/v/release/defenseunicorns/zarf-init-aws)](https://github.com/defenseunicorns/zarf-init-aws/releases)
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

- Zarf CLI (version >= `v0.30.0`)
  - <https://docs.zarf.dev/docs/getting-started>

- Connection to an existing EKS cluster configured with an IAM OIDC identity provider to allow [IRSA](https://docs.aws.amazon.com/eks/latest/userguide/iam-roles-for-service-accounts.html) authentication
  - <https://docs.aws.amazon.com/eks/latest/userguide/enable-iam-roles-for-service-accounts.html>

- AWS CLI configured with the necessary permissions to describe and create ECR repositories, and fetch ECR tokens

- Create IAM role for the Pepr webhook to be able to list and create ECR repositories
  - See an [example role for reference](iam/json/ecr-webhook-role.json). Be sure to replace the `{{AWS_ACCOUNT_ID}}` and `{{EKS_CLUSTER_ID}}` placeholders, as well as the AWS region with your values.

  - You will need to create an IAM policy with the appropriate permissions and attach it to the role. See an [example policy for reference](iam/json/ecr-webhook-policy.json).

  ***Note***: If you only need to work with a private ECR registry, the `ecr-public:` prefixed actions can be removed from the policy. Likewise, if you only need to work with a public ECR registry, the `ecr:` prefixed actions can be removed from the policy.

- (Optional) Create IAM role for the `zarf-ecr-credential-helper` to be able to fetch new ECR auth tokens
  - The credential helper is an optional component and is NOT required to use ECR as an external Zarf registry. It can be used if you are looking for an automated solution for keeping your image pull secrets updated with valid ECR auth tokens. Frequent rotation of ECR tokens in image pull secrets is required because they expire after 12 hours. <https://docs.aws.amazon.com/AmazonECR/latest/APIReference/API_GetAuthorizationToken.html>

  - See an [example role for reference](iam/json/ecr-credential-helper-role.json). Be sure to replace the `{{AWS_ACCOUNT_ID}}` and `{{EKS_CLUSTER_ID}}` placeholders, as well as the AWS region with your values.
  
  - You will need to create an IAM policy with the appropriate permissions and attach it to the role. See an [example policy for reference](iam/json/ecr-credential-helper-policy.json).
  
  ***Note***: If you only need to work with a private ECR registry, the `ecr-public:` prefixed actions can be removed from the policy. Likewise, if you only need to work with a public ECR registry, the `ecr:` prefixed actions can be removed from the policy.

### Get the Zarf init package

```bash
zarf package pull oci://ghcr.io/defenseunicorns/packages/init-aws:v0.0.1-amd64
```

### Initialize EKS cluster with Zarf configured to use ECR as external registry

#### Use ***private*** ECR registry

1. Create a Zarf config file `zarf-config.toml`

    ```toml
    architecture = 'amd64'

    [package.deploy]
    components = 'zarf-ecr-credential-helper'

    [package.deploy.set]
    registry_type = 'private'

    # Change me to your AWS region if needed
    aws_region = 'us-east-1'

    # Set IAM role ARNs
    ecr_hook_role_arn = '<YOUR_WEBHOOK_ROLE_ARN>'
    ecr_credential_helper_role_arn = '<YOUR_CREDENTIAL_HELPER_ROLE_ARN>'
    ```

1. Zarf init

    Note: Be sure to run the `zarf init` command from the same working directory as your Zarf config file

    ```bash
    AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query 'Account' --output text)

    # Note: Be sure the region you specify in the --registry-url matches the one specified in your Zarf config file
    zarf init \
      --registry-url="${AWS_ACCOUNT_ID}.dkr.ecr.<YOUR_AWS_REGION>.amazonaws.com" \
      --registry-push-username="AWS" \
      --registry-push-password="$(aws ecr get-login-password --region <YOUR_AWS_REGION>)" \
      --confirm
    ```

#### Use ***public*** ECR registry

1. Create a Zarf config file `zarf-config.toml`

    ```toml
    architecture = 'amd64'

    [package.deploy]
    components = 'zarf-ecr-credential-helper'

    [package.deploy.set]
    registry_type = 'public'

    # Must use us-east-1 region for public ECR registries:
    # https://docs.aws.amazon.com/AmazonECR/latest/public/public-registries.html#public-registry-auth
    aws_region = 'us-east-1'

    # Set IAM role ARNs
    ecr_hook_role_arn = '<YOUR_WEBHOOK_ROLE_ARN>'
    ecr_credential_helper_role_arn = '<YOUR_CREDENTIAL_HELPER_ROLE_ARN>'
    ```

1. Zarf init

    Note: Be sure to run the `zarf init` command from the same working directory as your Zarf config file

    ```bash
    zarf init \
      --registry-url="$(aws ecr-public describe-registries --query 'registries[0].registryUri' --output text --region us-east-1)" \
      --registry-push-username="AWS" \
      --registry-push-password="$(aws ecr-public get-login-password --region us-east-1)" \
      --confirm
    ```
