# 1. Use Pulumi TypeScript SDK to provision AWS IAM resources

Date: 2023-10-13

## Status

Accepted

## Context

Currently, the Zarf Init Package for AWS has two components that require access to ECR in AWS to function correctly, the Pepr webhook and zarf-ecr-credential-helper. EKS is currently the only Kubernetes distribution that is supported and tested on. We are leveraging an authentication feature of EKS called 'IAM Roles for Service Accounts (IRSA)', which allows you to add an annotation to a Kubernetes Service Account with the Amazon Resource Name (ARN) of an IAM role that contains the necessary policies and permissions. Here is how we are currently using this Service Account annotation to give Pepr the necessary permissions to list and create ECR repositories:

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: pepr-b95dbd80-e078-5eb9-aaf3-bcb9567417d0
  namespace: pepr-system
  annotations:
    eks.amazonaws.com/role-arn: "###ZARF_VAR_ECR_HOOK_ROLE_ARN###"
```

For more information on EKS IRSA authentication, see: <https://docs.aws.amazon.com/eks/latest/userguide/iam-roles-for-service-accounts.html>

The IAM role used for Pepr to use IRSA authentication looks like:

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Principal": {
                "Federated": "arn:aws:iam::{{AWS_ACCOUNT_ID}}:oidc-provider/oidc.eks.us-east-1.amazonaws.com/id/{{EKS_CLUSTER_ID}}"
            },
            "Action": "sts:AssumeRoleWithWebIdentity",
            "Condition": {
                "StringEquals": {
                    "oidc.eks.us-east-1.amazonaws.com/id/{{EKS_CLUSTER_ID}}:sub": "system:serviceaccount:pepr-system:pepr-b95dbd80-e078-5eb9-aaf3-bcb9567417d0"
                }
            }
        }
    ]
}
```

The `{{EKS_CLUSTER_ID}}` is a placeholder value for an EKS cluster's OIDC issuer ID that is unique for each EKS cluster. Because we are provisioning ephemeral EKS clusters in CI to test the Zarf Init Package for AWS, we must dynamically fetch this data from the EKS cluster after it has been created, and replace the placeholder values in the IAM role(s) with the actual value.

Four approaches have been considered to handle the updating and provisioning of the IAM policies and roles needed for our tests:

1. Shell script using AWS CLI
2. Pulumi Go SDK
3. Pulumi TypeScript SDK
4. Terraform

### Shell script using AWS CLI

Pros:

- Simple and quick to write to get a working solution

Cons:

- Requires using tools like `sed` to perform string replacements, which hinders portability and readability. For example, `gsed` is needed to work on MacOS, but `sed` is needed to work on Linux.

### Pulumi Go SDK

Pros:

- Strongly typed programming language
- Aligns with Defense Unicorns' tech stack
- More portable than a shell script

Cons:

- The Pulumi Go SDK results in very verbose programs. Requires roughly 3x the amount of code when compared to a shell script. This results in slower development, debugging, and ultimately, cycle times.

### Pulumi TypeScript SDK

Pros:

- Strongly typed programming language
- Aligns with Defense Unicorns' tech stack
- More portable than a shell script
- Less verbose than the Pulumi Go SDK

Cons:

- N/A

### Terraform

Pros:

- Has been the de-facto standard for Infrastructure as Code for years
- Many engineers at Defense Unicorns are familiar with it

Cons:

- It is not released under an Open Source license (BSL): <https://www.hashicorp.com/bsl>

## Decision

The Zarf Init Package for AWS will use the Pulumi TypeScript SDK to handle the updating and provisioning of IAM resources for use in our tests. This allows us to leverage a robust programming language that is clean and concise to read and write, and also allows for easier local testing due to the improved portability.

## Consequences

There may be a more steep learning curve for contributors who are unfamiliar with Pulumi or TypeScript.
