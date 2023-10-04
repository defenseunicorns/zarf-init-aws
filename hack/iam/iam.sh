#!/bin/sh

# Names for IAM policies and roles
WEBHOOK_IAM_NAME="ecr-webhook-${GITHUB_JOB}"
CREDENTIAL_HELPER_IAM_NAME="ecr-credential-helper-${GITHUB_JOB}"

# Filepaths for IAM policies and roles
WEBHOOK_POLICY_PATH="ecr-webhook-policy.json"
WEBHOOK_ROLE_PATH="ecr-webhook-role.json"
CREDENTIAL_HELPER_POLICY_PATH="ecr-credential-helper-policy.json"
CREDENTIAL_HELPER_ROLE_PATH="ecr-credential-helper-role.json"

create() {
    # Check if the cluster name argument is provided
    if [ -z "$2" ]; then
        echo "Please provide the EKS cluster name as the second argument."
        exit 1
    fi

    # Fetch AWS account ID
    AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query 'Account' --output text)

    # Fetch the EKS Cluster ID
    EKS_CLUSTER_ID=$(aws eks describe-cluster --name "$2" --query "cluster.identity.oidc.issuer" --output text | cut -d '/' -f 5)
    if [ -z "$EKS_CLUSTER_ID" ]; then
        echo "Failed to fetch EKS cluster OIDC provider ID. Please ensure you provided the correct cluster name"
        exit 1
    fi

    # Replace the placeholder in the JSON role files with the AWS account ID and EKS cluster ID
    SED_CMD="sed"
    if [ "$(uname -s)" = "Darwin" ]; then
        SED_CMD="gsed"
    fi
    "$SED_CMD" -i "s/{{AWS_ACCOUNT_ID}}/$AWS_ACCOUNT_ID/g" "$WEBHOOK_ROLE_PATH"
    "$SED_CMD" -i "s/{{AWS_ACCOUNT_ID}}/$AWS_ACCOUNT_ID/g" "$CREDENTIAL_HELPER_ROLE_PATH"

    "$SED_CMD" -i "s/{{EKS_CLUSTER_ID}}/$EKS_CLUSTER_ID/g" "$WEBHOOK_ROLE_PATH"
    "$SED_CMD" -i "s/{{EKS_CLUSTER_ID}}/$EKS_CLUSTER_ID/g" "$CREDENTIAL_HELPER_ROLE_PATH"

    # Create IAM policies from JSON files
    ECR_WEBHOOK_POLICY_ARN=$(aws iam create-policy --policy-name "$WEBHOOK_IAM_NAME" --policy-document "file://${WEBHOOK_POLICY_PATH}" --query "Policy.Arn" --output text)
    ECR_CREDENTIAL_HELPER_POLICY_ARN=$(aws iam create-policy --policy-name "$CREDENTIAL_HELPER_IAM_NAME" --policy-document "file://${CREDENTIAL_HELPER_POLICY_PATH}" --query "Policy.Arn" --output text)

    # Create IAM roles from JSON files
    ECR_WEBHOOK_ROLE_ARN=$(aws iam create-role --role-name "$WEBHOOK_IAM_NAME" --assume-role-policy-document "file://${WEBHOOK_ROLE_PATH}" --query "Role.Arn" --output text)
    ECR_CREDENTIAL_HELPER_ROLE_ARN=$(aws iam create-role --role-name "$CREDENTIAL_HELPER_IAM_NAME" --assume-role-policy-document "file://${CREDENTIAL_HELPER_ROLE_PATH}" --query "Role.Arn" --output text)

    # Set the IAM role ARNs as GitHub Actions outputs
    echo "ecr-webhook-role-arn=${ECR_WEBHOOK_ROLE_ARN}" >> "$GITHUB_OUTPUT"
    echo "ecr-credential-helper-role-arn=${ECR_CREDENTIAL_HELPER_ROLE_ARN}" >> "$GITHUB_OUTPUT"

    # Attach policies to roles
    aws iam attach-role-policy --role-name "$WEBHOOK_IAM_NAME" --policy-arn "$ECR_WEBHOOK_POLICY_ARN"
    aws iam attach-role-policy --role-name "$CREDENTIAL_HELPER_IAM_NAME" --policy-arn "$ECR_CREDENTIAL_HELPER_POLICY_ARN"

    echo "IAM roles and policies created and attached successfully."
}

delete() {
    # Fetch policy ARNs
    ECR_WEBHOOK_POLICY_ARN=$(aws iam list-policies --query "Policies[?PolicyName==${WEBHOOK_IAM_NAME}].Arn" --output text)
    ECR_CREDENTIAL_HELPER_POLICY_ARN=$(aws iam list-policies --query "Policies[?PolicyName==${CREDENTIAL_HELPER_IAM_NAME}].Arn" --output text)

    # Detach policies from roles
    aws iam detach-role-policy --role-name "$WEBHOOK_IAM_NAME" --policy-arn "$ECR_WEBHOOK_POLICY_ARN"
    aws iam detach-role-policy --role-name "$CREDENTIAL_HELPER_IAM_NAME" --policy-arn "$ECR_CREDENTIAL_HELPER_POLICY_ARN"

    # Delete IAM policies
    aws iam delete-policy --policy-arn "$ECR_WEBHOOK_POLICY_ARN"
    aws iam delete-policy --policy-arn "$ECR_CREDENTIAL_HELPER_POLICY_ARN"

    # Delete IAM roles
    aws iam delete-role --role-name "$WEBHOOK_IAM_NAME"
    aws iam delete-role --role-name "$CREDENTIAL_HELPER_IAM_NAME"

    echo "IAM roles and policies detached and deleted successfully."
}

# Check the argument value
if [ "$1" = "create" ]; then
    create "$@"
elif [ "$1" = "delete" ]; then
    delete
else
    echo "Usage: $0 [create <cluster-name>|delete]"
    exit 1
fi
