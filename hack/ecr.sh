#!/bin/bash

REPO_NAME="defenseunicorns/pepr/controller"
ECR_CMD="ecr"

# Validate the input for registry type
if [ "$REGISTRY_TYPE" != "public" ] && [ "$REGISTRY_TYPE" != "private" ]; then
    echo "Error: Invalid registry type. Please specify 'public' or 'private'."
    exit 1
fi

# When authenticating to a public registry, always authenticate to the us-east-1 region when using the AWS CLI.
# https://docs.aws.amazon.com/AmazonECR/latest/public/public-registries.html#public-registry-auth
if [ "$REGISTRY_TYPE" = "public" ]; then

    if [ "$AWS_REGION" != "us-east-1" ]; then
        echo "Error: Invalid region: ECR public registries are only available in the us-east-1 region."
        exit 1
    fi

    ECR_CMD="ecr-public"
fi

# Create an ECR repository for the Pepr controller image if it doesn't already exist
if ! aws "$ECR_CMD" describe-repositories \
        --repository-names "$REPO_NAME" \
        --region "$AWS_REGION" >/dev/null 2>&1
then
    ARGS=("--repository-name" "$REPO_NAME" "--region" "$AWS_REGION")
    
    if [ "$REGISTRY_TYPE" = "private" ]; then
        ARGS+=("--image-scanning-configuration" "scanOnPush=true" "--image-tag-mutability" "IMMUTABLE")
    fi
    
    aws "$ECR_CMD" create-repository "${ARGS[@]}"
fi

